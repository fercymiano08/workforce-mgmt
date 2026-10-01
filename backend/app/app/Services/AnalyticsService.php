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

    /**
     * Hours-worked scoring thresholds, as a share of the rostered shift length.
     *
     * A rostered 08:00-17:00 shift is nine hours long but includes an unpaid break, so a full honest
     * day lands a little under nine hours and must still score full marks. Half the rostered length
     * is where the score reaches zero: below that, the shift was not meaningfully worked.
     */
    public const FULL_SHIFT_AT = 0.85;
    public const HALF_SHIFT_AT = 0.50;

    /**
     * Overtime, as a percentage of rostered hours, at which the overtime score reaches zero.
     *
     * Expressed as a share of rostered time rather than as an average per attendance row, because an
     * average across every record dilutes a real problem until it is invisible: 22.5 overtime hours
     * spread over 555 records averages 0.04h a row, which reads as a perfect score no matter how
     * many people were actually burning the candle at both ends.
     */
    public const OVERTIME_SHARE_FLOOR = 10.0;

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
     * One score for the whole workforce, 0-100.
     *
     * It is deliberately not grouped by department. Every input comes from attendance punches,
     * rostered shifts and timesheet weeks, which exist whoever the person works under, so asking an
     * admin to file employees into departments first would be a requirement the number does not have.
     *
     * This is a reliability and hours-discipline score, not a measure of how good anyone's work is.
     * There is no task or output tracking anywhere in the schema, so that cannot be derived from
     * the data the system holds. What it can honestly measure is: did they turn up, were they on
     * time, did they work the shift they were rostered for, and did they record their week.
     *
     * Every part is computed per rostered shift or per week rather than as one workforce-wide
     * division, because an average of everything hides the people who are short. A single number
     * can only move if something underneath it can move, and that is the whole design constraint.
     * Computed over completed months only, for the same reason the attendance trend skips the
     * month in progress.
     */
    private function workforceProductivity(int $months = 12): array
    {
        // The window is half-open and ends where the current month begins, so the month still in
        // progress is outside it by construction rather than by a filter that might be forgotten.
        $end = Carbon::now()->startOfMonth();
        $start = $end->copy()->subMonths($months)->startOfMonth();
        $from = $start->toDateString();
        $before = $end->toDateString();

        // 1. Attendance: days attended (on time, late or left early) over days expected. Approved
        //    leave is excluded from the denominator, so an approved absence never costs anyone.
        $att = DB::table('attendance')
            ->selectRaw("SUM(CASE WHEN status = 'Absent' THEN 1 ELSE 0 END) as absent_count")
            ->selectRaw("SUM(CASE WHEN status = 'Present' THEN 1 ELSE 0 END) as present_count")
            ->selectRaw("SUM(CASE WHEN status = 'Late' THEN 1 ELSE 0 END) as late_count")
            ->selectRaw("SUM(CASE WHEN status = 'Early Leave' THEN 1 ELSE 0 END) as early_count")
            ->where('date', '>=', $from)
            ->where('date', '<', $before)
            ->first();

        $attended = (int) $att->present_count + (int) $att->late_count + (int) $att->early_count;
        $expected = $attended + (int) $att->absent_count;
        $attendanceScore = $expected > 0 ? ($attended / $expected) * 100 : 0.0;

        // 2. Punctuality: of the days attended, how many were on time rather than late or cut short.
        $punctualityScore = $attended > 0 ? ((int) $att->present_count / $attended) * 100 : 0.0;

        // 3. Hours worked against hours rostered. Scored shift by shift, because dividing all the
        //    logged hours by all the rostered hours just returns one workforce average and cannot
        //    tell a reliable worker from someone who leaves early every Friday.
        //
        //    The rostered length includes an unpaid break, so a full day is a little under the
        //    rostered span. FULL_SHIFT_AT is that allowance and HALF_SHIFT_AT is where the score
        //    reaches zero - below half a shift, the hours were not meaningfully worked.
        $shiftHours = DB::table('shift_definitions')->get()
            ->mapWithKeys(fn ($d) => [$d->id => max(0.0, (strtotime($d->end_time) - strtotime($d->start_time)) / 3600)]);

        $rostered = DB::table('shift_schedules')
            ->leftJoin('attendance', function ($join) {
                $join->on('attendance.employee_id', '=', 'shift_schedules.employee_id')
                    ->on('attendance.date', '=', 'shift_schedules.date');
            })
            ->where('shift_schedules.date', '>=', $from)
            ->where('shift_schedules.date', '<', $before)
            ->select('shift_schedules.employee_id', 'shift_schedules.shift_id')
            ->selectRaw('attendance.total_hours as logged')
            ->selectRaw('attendance.overtime as overtime')
            ->selectRaw('attendance.status as status')
            ->get();

        $hoursScores = [];
        $overtimeByEmployee = [];
        $rosteredHours = 0.0;
        $loggedHours = 0.0;
        $missedShifts = 0;

        foreach ($rostered as $shift) {
            $length = $shiftHours[$shift->shift_id] ?? 0.0;
            if ($length <= 0) {
                continue;
            }
            $rosteredHours += $length;
            $logged = (float) ($shift->logged ?? 0);
            $loggedHours += $logged;
            $overtimeByEmployee[$shift->employee_id] = ($overtimeByEmployee[$shift->employee_id] ?? 0.0) + (float) ($shift->overtime ?? 0);

            // A rostered shift with no attendance row at all is an unrecorded shift, which is worse
            // than a short one: nothing was claimed, so it counts as half a shift worked.
            $ratio = $logged / $length;
            $hoursScores[] = $ratio >= self::FULL_SHIFT_AT
                ? 100.0
                : max(0.0, ($ratio - self::HALF_SHIFT_AT) / (self::FULL_SHIFT_AT - self::HALF_SHIFT_AT) * 100);
            if ($shift->status === null) {
                $missedShifts++;
            }
        }

        $hoursScore = $hoursScores ? array_sum($hoursScores) / count($hoursScores) : 0.0;

        // 4. Overtime burden, measured against rostered time rather than as a bare average per day.
        //    The old version averaged overtime across every attendance row, so 22.5 overtime hours
        //    spread over 555 records averaged 0.04h and scored 99.6 out of 100 - a flat giveaway that
        //    the part could not move. Overtime as a share of the hours someone was rostered for is
        //    the same information in the units that matter, and it responds to a bad week.
        $totalOvertime = array_sum($overtimeByEmployee);
        $overtimeShare = $rosteredHours > 0 ? ($totalOvertime / $rosteredHours) * 100 : 0.0;
        // Ten percent of rostered time in overtime is the point where the score reaches zero.
        $overtimeScore = $rosteredHours > 0
            ? max(0.0, 100 - ($overtimeShare / self::OVERTIME_SHARE_FLOOR * 100))
            : 0.0;

        // 5. Timesheet records. Measured against weeks that have actually finished: a week still in
        //    the future is not a missed record, and a week left in Draft once it is over is.
        $weeks = DB::table('timesheets')
            ->where('week_start', '>=', $from)
            ->where('week_start', '<', $before)
            ->select('week_end', 'status')->get();

        $closedWeeks = 0;
        $recordedWeeks = 0;
        foreach ($weeks as $week) {
            if (Carbon::parse($week->week_end)->isFuture()) {
                continue;
            }
            $closedWeeks++;
            if ($week->status !== 'Draft') {
                $recordedWeeks++;
            }
        }
        $timesheetScore = $closedWeeks > 0 ? ($recordedWeeks / $closedWeeks) * 100 : 0.0;

        // Attendance and the hours they were rostered to work are what the workforce directly
        // controls, so they carry the most weight. Timesheet recording sits lowest because it is
        // partly an admin habit rather than anything the employee decides on the day.
        $productivity = (0.30 * $attendanceScore)
            + (0.25 * $hoursScore)
            + (0.20 * $punctualityScore)
            + (0.15 * $overtimeScore)
            + (0.10 * $timesheetScore);

        $spread = $hoursScores ? [min($hoursScores), max($hoursScores)] : [0.0, 0.0];

        return [
            'score' => round(min(100, max(0, $productivity)), 1),
            'components' => [
                ['key' => 'attendance', 'label' => 'Attendance', 'weight' => 0.30, 'score' => round($attendanceScore, 1)],
                ['key' => 'hours', 'label' => 'Hours worked', 'weight' => 0.25, 'score' => round($hoursScore, 1)],
                ['key' => 'punctuality', 'label' => 'Punctuality', 'weight' => 0.20, 'score' => round($punctualityScore, 1)],
                ['key' => 'overtime', 'label' => 'Overtime discipline', 'weight' => 0.15, 'score' => round($overtimeScore, 1)],
                ['key' => 'timesheets', 'label' => 'Timesheet records', 'weight' => 0.10, 'score' => round($timesheetScore, 1)],
            ],
            'period' => [
                'from' => $from,
                'to' => $end->copy()->subDay()->toDateString(),
                'label' => $months === 1
                    ? $start->format('M Y')
                    : $start->format('M Y').' - '.$end->copy()->subDay()->format('M Y'),
                'months' => $months,
            ],
            'totals' => [
                'daysExpected' => $expected,
                'daysAttended' => $attended,
                'shiftsRostered' => count($hoursScores),
                'hoursLogged' => round($loggedHours, 1),
                'hoursRostered' => round($rosteredHours, 1),
                'shortestShift' => round($spread[0], 1),
                'longestShift' => round($spread[1], 1),
                'unrecordedShifts' => $missedShifts,
                'overtimeHours' => round($totalOvertime, 2),
                'overtimeShare' => round($overtimeShare, 2),
                'weeksClosed' => $closedWeeks,
                'weeksRecorded' => $recordedWeeks,
            ],
        ];
    }
}
