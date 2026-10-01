<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Computes Workforce Analytics directly from live attendance/leave/timesheet
 * data, instead of reading a one-time seeded snapshot.
 */
class AnalyticsService
{
    /**
     * The number of completed months a windowed metric covers, so the caller cannot ask for a
     * window that is not a whole number of months or that runs past the finished data.
     */
    public const MIN_WINDOW_MONTHS = 1;
    public const MAX_WINDOW_MONTHS = 12;
    public const DEFAULT_WINDOW_MONTHS = 12;

    public static function windowMonths(?int $months): int
    {
        if ($months === null) {
            return self::DEFAULT_WINDOW_MONTHS;
        }

        return max(self::MIN_WINDOW_MONTHS, min(self::MAX_WINDOW_MONTHS, $months));
    }

    public function all(?int $months = null): array
    {
        return [
            'attendanceTrend' => $this->attendanceTrend(),
            'departmentProductivity' => $this->workforceProductivity(self::windowMonths($months)),
            'leaveTrend' => $this->leaveTrend(),
            'overtimeSummary' => $this->overtimeSummary(),
            'punctualityScore' => $this->punctualityScore(),
        ];
    }

    public function section(string $key, ?int $months = null): array
    {
        return match ($key) {
            'attendance_trend' => $this->attendanceTrend(),
            'department_productivity' => $this->workforceProductivity(self::windowMonths($months)),
            'leave_trend' => $this->leaveTrend(),
            'overtime_summary' => $this->overtimeSummary(),
            'punctuality_score' => $this->punctualityScore(),
            default => [],
        };
    }

    /**
     * Twelve buckets of completed months, most recent last.
     *
     * The month still in progress is deliberately left out. On the 2nd of a month the company has two
     * days of attendance data, so a rate for that month is measured against almost nothing and reads as
     * a near-perfect 100% - which is not a fact about the workforce, it is an artefact of dividing by a
     * tiny denominator. The partial month returns as soon as it is finished, so nothing is hidden, it
     * simply cannot be summarised honestly until it is a whole month.
     */
    private function attendanceTrend(): array
    {
        $end = Carbon::now()->subMonthNoOverflow()->startOfMonth();
        $start = $end->copy()->subMonths(11)->startOfMonth();

        $months = collect();
        for ($i = 0; $i < 12; $i++) {
            $m = $start->copy()->addMonths($i);
            $months->put($m->format('Y-m'), [
                'month' => $m->format('M Y'), 'present' => 0, 'absent' => 0, 'late' => 0, 'earlyLeave' => 0, 'total' => 0,
            ]);
        }

        Attendance::where('date', '>=', $start->toDateString())
            ->get(['date', 'status'])
            ->each(function ($record) use (&$months) {
                $key = $record->date->format('Y-m');
                if (! $months->has($key)) {
                    return;
                }
                $bucket = $months[$key];
                $bucket['total']++;
                if ($record->status === 'Present') {
                    $bucket['present']++;
                } elseif ($record->status === 'Late') {
                    $bucket['late']++;
                } elseif ($record->status === 'Early Leave') {
                    $bucket['earlyLeave']++;
                } elseif ($record->status === 'Absent') {
                    $bucket['absent']++;
                }
                $months[$key] = $bucket;
            });

        return $months->map(function ($b) {
            // Each record has exactly one status. Attendance rate = days the person came in (on time, late or
            // left early) out of the days they were expected: approved leave is not held against anyone.
            $attended = $b['present'] + $b['late'] + $b['earlyLeave'];
            $expected = $attended + $b['absent'];
            $rate = $expected > 0 ? round(($attended / $expected) * 100, 1) : 0.0;

            return [
                'month' => $b['month'], 'present' => $b['present'], 'absent' => $b['absent'],
                'late' => $b['late'], 'earlyLeave' => $b['earlyLeave'], 'rate' => $rate,
            ];
        })->values()->all();
    }

    private function leaveTrend(): array
    {
        $start = Carbon::now()->subMonths(5)->startOfMonth();

        $months = collect();
        for ($i = 0; $i < 6; $i++) {
            $m = $start->copy()->addMonths($i);
            $months->put($m->format('Y-m'), [
                'month' => $m->format('M Y'), 'vacation' => 0, 'sick' => 0, 'emergency' => 0,
                'special' => 0, 'funeral' => 0, 'unpaid' => 0, 'total' => 0,
            ]);
        }

        Leave::where('status', 'Approved')
            ->where('start_date', '>=', $start->toDateString())
            ->get(['leave_type', 'start_date'])
            ->each(function ($record) use (&$months) {
                $key = $record->start_date->format('Y-m');
                if (! $months->has($key)) {
                    return;
                }
                $bucket = $months[$key];
                $bucket['total']++;
                $type = strtolower($record->leave_type);
                if (array_key_exists($type, $bucket)) {
                    $bucket[$type]++;
                }
                $months[$key] = $bucket;
            });

        return $months->values()->all();
    }

    private function overtimeSummary(): array
    {
        $rows = DB::table('attendance')
            ->join('employees', 'employees.id', '=', 'attendance.employee_id')
            ->selectRaw('employees.department as department')
            ->selectRaw('AVG(attendance.overtime) as avg_overtime')
            ->selectRaw('SUM(attendance.overtime) as total_overtime')
            ->selectRaw('MAX(attendance.overtime) as max_overtime')
            ->whereNotNull('employees.department')
            ->groupBy('employees.department')
            ->get();

        return $rows->map(fn ($r) => [
            'department' => $r->department,
            'avgOvertime' => round((float) $r->avg_overtime, 1),
            'totalOvertime' => round((float) $r->total_overtime, 1),
            'maxOvertime' => round((float) $r->max_overtime, 1),
        ])->values()->all();
    }

    private function punctualityScore(): array
    {
        $rows = DB::table('attendance')
            ->join('employees', 'employees.id', '=', 'attendance.employee_id')
            ->selectRaw('employees.id as id, employees.first_name as first_name, employees.last_name as last_name, employees.department as department')
            ->selectRaw("SUM(CASE WHEN attendance.status = 'Present' THEN 1 ELSE 0 END) as present_count")
            ->selectRaw("SUM(CASE WHEN attendance.status = 'Late' THEN 1 ELSE 0 END) as late_count")
            ->groupBy('employees.id', 'employees.first_name', 'employees.last_name', 'employees.department')
            ->get();

        return $rows->filter(fn ($r) => ($r->present_count + $r->late_count) > 0)
            ->map(fn ($r) => [
                'name' => trim($r->first_name.' '.$r->last_name),
                'score' => round(($r->present_count / ($r->present_count + $r->late_count)) * 100, 1),
                'department' => $r->department,
            ])
            ->sortByDesc('score')
            ->values()
            ->all();
    }

    /**
     * One score for the whole workforce, 0-100, built from four things the company actually
     * measures: attendance, working hours, overtime and timesheets.
     *
     * It is deliberately not grouped by department. The four inputs come from attendance punches and
     * timesheet weeks, which exist whoever the person works under, so asking an admin to file
     * employees into departments first would be a requirement the number does not have.
     *
     * This is a heuristic proxy, not a measured productivity figure. There is no task or output
     * tracking anywhere in the schema, so a "true" productivity number cannot be derived from the
     * data the system holds. Each part is computed over completed months only, for the same reason
     * the attendance trend skips the month in progress.
     */
    private function workforceProductivity(int $months = 12): array
    {
        // The window is half-open and ends where the current month begins, so the month still in
        // progress is outside it by construction rather than by a filter that might be forgotten.
        $end = Carbon::now()->startOfMonth();
        $start = $end->copy()->subMonths($months)->startOfMonth();

        // 1. Attendance: days attended (on time, late or left early) over days expected. Approved
        //    leave is excluded from the denominator, so an approved absence never costs anyone.
        $att = DB::table('attendance')
            ->selectRaw('COUNT(*) as total')
            ->selectRaw("SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_count")
            ->selectRaw("SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_count")
            ->selectRaw("SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as late_count")
            ->where('date', '>=', $start->toDateString())
            ->where('date', '<', $end->toDateString())
            ->first();

        $attended = (int) $att->present_count + (int) $att->late_count;
        $expected = $attended + (int) $att->absent_count;
        $attendanceScore = $expected > 0 ? ($attended / $expected) * 100 : 0.0;

        // 2. Punctuality: of the days attended, how many were on time rather than late.
        $punctualityScore = $attended > 0 ? ((int) $att->present_count / $attended) * 100 : 0.0;

        // 3. Working hours: hours actually logged against the hours people were scheduled for. This
        //    is what catches short days that still show up as "attended", which attendance alone
        //    scores as a good day.
        $hrs = DB::table('timesheets')
            ->selectRaw('SUM(regular_hours) as regular')
            ->selectRaw('SUM(total_hours) as total')
            ->where('week_start', '>=', $start->toDateString())
            ->where('week_start', '<', $end->toDateString())
            ->first();

        $scheduled = (float) ($hrs->regular ?: 0);
        $logged = (float) ($hrs->total ?: 0);
        // 85% of scheduled hours counts as full marks: nobody is expected to finish every week
        // early, and scoring 100% only at exactly 100% would make the number meaningless.
        $hoursScore = $scheduled > 0 ? min(100, ($logged / $scheduled) / 0.85 * 100) : 0.0;

        // 4. Overtime burden: overtime is capacity the company paid for out of schedule, so a
        //    heavier overtime load lowers the score rather than raising it.
        $ot = DB::table('attendance')
            ->selectRaw('AVG(overtime) as avg_overtime')
            ->selectRaw('COUNT(*) as records')
            ->where('date', '>=', $start->toDateString())
            ->where('date', '<', $end->toDateString())
            ->first();

        // No attendance rows means no average overtime, which is not the same as "zero overtime".
        // Defaulting to 0 here would hand out a perfect 100 on this part for an empty window and
        // inflate the total, so an absent average scores nothing instead.
        $hasPunches = (int) $ot->records > 0;
        $avgOvertime = $hasPunches ? (float) $ot->avg_overtime : 0.0;
        $overtimeScore = $hasPunches ? max(0.0, 100 - ($avgOvertime * 10)) : 0.0;

        // 5. Timesheet compliance: weeks recorded on time against weeks that had to be recorded.
        //    A week still open or waiting on HR is neither good nor bad, so it is left out rather
        //    than counted against the workforce.
        $weeks = DB::table('timesheets')
            ->selectRaw("SUM(CASE WHEN status = 'Pending' THEN 1 ELSE 0 END) as pending_count")
            ->selectRaw("SUM(CASE WHEN status <> 'Pending' THEN 1 ELSE 0 END) as recorded_count")
            ->where('week_start', '>=', $start->toDateString())
            ->where('week_start', '<', $end->toDateString())
            ->first();

        $recorded = (int) $weeks->recorded_count;
        $decidable = $recorded + (int) $weeks->pending_count;
        $timesheetScore = $decidable > 0 ? ($recorded / $decidable) * 100 : 0.0;

        // Attendance and hours are what the workforce directly controls, so they carry the most
        // weight; punctuality, overtime and timesheet discipline adjust around them.
        $productivity = (0.35 * $attendanceScore)
            + (0.25 * $hoursScore)
            + (0.15 * $punctualityScore)
            + (0.15 * $overtimeScore)
            + (0.10 * $timesheetScore);

        return [
            'score' => round(min(100, max(0, $productivity)), 1),
            'components' => [
                ['key' => 'attendance', 'label' => 'Attendance', 'weight' => 0.35, 'score' => round($attendanceScore, 1)],
                ['key' => 'hours', 'label' => 'Working hours', 'weight' => 0.25, 'score' => round($hoursScore, 1)],
                ['key' => 'punctuality', 'label' => 'Punctuality', 'weight' => 0.15, 'score' => round($punctualityScore, 1)],
                ['key' => 'overtime', 'label' => 'Overtime burden', 'weight' => 0.15, 'score' => round($overtimeScore, 1)],
                ['key' => 'timesheets', 'label' => 'Timesheet records', 'weight' => 0.10, 'score' => round($timesheetScore, 1)],
            ],
            'period' => [
                'from' => $start->toDateString(),
                'to' => $end->copy()->subDay()->toDateString(),
                'label' => $months === 1
                    ? $start->format('M Y')
                    : $start->format('M Y').' - '.$end->copy()->subDay()->format('M Y'),
                'months' => $months,
            ],
            'totals' => [
                'daysExpected' => $expected,
                'daysAttended' => $attended,
                'hoursLogged' => round($logged, 1),
                'hoursScheduled' => round($scheduled, 1),
                'avgOvertime' => round($avgOvertime, 2),
                'weeksRecorded' => $recorded,
            ],
        ];
    }
}
