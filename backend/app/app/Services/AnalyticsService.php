<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\ShiftSchedule;
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
                $type = strtolower((string) $record->leave_type);
                if (array_key_exists($type, $bucket)) {
                    $bucket[$type]++;
                } else {
                    /*
                      A leave type this chart has no bucket for still counts towards the month's
                      total. It used to be dropped from both, which meant approved leave could exist
                      in the database and appear nowhere on the page, and the headline count and the
                      donut could quietly disagree. It goes into 'other' so nothing approved is ever
                      invisible - 'Half Day' is a real approved request in the data and has no
                      balance or bucket of its own, which is exactly the case this catches.
                    */
                    $bucket['other'] = ($bucket['other'] ?? 0) + 1;
                }
                $bucket['total']++;
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

    // =====================================================================================
    // Workforce Analytics page (This Week / This Month / This Year): six cards, each carrying
    // its own data-source and formula text so the page can explain itself without anyone
    // having to remember the rule separately. Entirely additive - all() and section() above,
    // which the main Dashboard and the AI insights badge both still call, are untouched.
    // =====================================================================================

    public const VALID_WORKFORCE_PERIODS = ['week', 'month', 'year'];

    public function workforceCards(string $period): array
    {
        $range = $this->periodRange($period);
        $buckets = $this->subBuckets($range['key'], $range['start'], $range['containerEnd']);

        return [
            'period' => [
                'key' => $range['key'],
                'from' => $range['start']->toDateString(),
                'to' => $range['end']->toDateString(),
                'label' => $range['label'],
            ],
            'attendanceSummary' => $this->attendanceSummary($range),
            'attendanceRate' => $this->attendanceRate($range, $buckets),
            'leaveTrend' => $this->leaveTrendForPeriod($range, $buckets),
            'overtimeHours' => $this->overtimeHours($range, $buckets),
            'departmentPunctuality' => $this->departmentPunctuality($range),
            'leaveComposition' => $this->leaveComposition($range),
        ];
    }

    /**
     * Resolves week|month|year (anything else falls back to month) to a date window in the
     * company's own timezone. 'end' is capped at today - a card never asks about a day that
     * has not happened yet - while 'containerEnd' keeps the whole period's natural boundary
     * (e.g. Sunday, or the month's last day), so the bucket list below still has its full
     * shape with the as-yet-unhappened part sitting honestly at zero.
     */
    private function periodRange(string $period): array
    {
        $period = in_array($period, ['week', 'year'], true) ? $period : 'month';
        $today = Carbon::now(ShiftHours::timezone())->startOfDay();

        $start = match ($period) {
            'week' => $today->copy()->startOfWeek(Carbon::MONDAY),
            'year' => $today->copy()->startOfYear(),
            default => $today->copy()->startOfMonth(),
        };
        $containerEnd = match ($period) {
            'week' => $start->copy()->addDays(6),
            'year' => $today->copy()->endOfYear()->startOfDay(),
            default => $today->copy()->endOfMonth()->startOfDay(),
        };
        $end = $today->lt($containerEnd) ? $today->copy() : $containerEnd->copy();

        $label = match ($period) {
            'week' => $start->format('M j').' - '.$containerEnd->format('M j, Y'),
            'year' => (string) $start->year,
            default => $start->format('F Y'),
        };

        return ['key' => $period, 'start' => $start, 'end' => $end, 'containerEnd' => $containerEnd, 'label' => $label];
    }

    /**
     * The bucket list a time-axis card is drawn against: one per day for a week, one per
     * calendar week for a month, one per calendar month for a year - so every chart stays
     * readable (4-7 bars) no matter which filter is active, instead of 30 daily bars for
     * "This Month".
     */
    private function subBuckets(string $period, Carbon $start, Carbon $containerEnd): array
    {
        if ($period === 'week') {
            $buckets = [];
            for ($i = 0; $i < 7; $i++) {
                $day = $start->copy()->addDays($i);
                $buckets[] = ['label' => $day->format('D'), 'from' => $day->copy(), 'to' => $day->copy()];
            }

            return $buckets;
        }

        if ($period === 'year') {
            $buckets = [];
            for ($i = 0; $i < 12; $i++) {
                $month = $start->copy()->addMonths($i);
                $buckets[] = ['label' => $month->format('M'), 'from' => $month->copy()->startOfMonth(), 'to' => $month->copy()->endOfMonth()->startOfDay()];
            }

            return $buckets;
        }

        // month: 7-day chunks from the 1st to the month's actual last day (the final chunk is
        // whatever is left, not a full 7).
        $buckets = [];
        $cursor = $start->copy();
        $week = 1;
        while ($cursor->lte($containerEnd)) {
            $to = $cursor->copy()->addDays(6)->min($containerEnd);
            $buckets[] = ['label' => 'Week '.$week, 'from' => $cursor->copy(), 'to' => $to->copy()];
            $cursor = $to->copy()->addDay();
            $week++;
        }

        return $buckets;
    }

    /** Which bucket a date falls into, or null if it is outside every one (should not happen - every bucket list spans its whole container). */
    private static function bucketIndexForDate(array $buckets, string $dateString): ?int
    {
        foreach ($buckets as $i => $b) {
            if ($dateString >= $b['from']->toDateString() && $dateString <= $b['to']->toDateString()) {
                return $i;
            }
        }

        return null;
    }

    /**
     * Card 1: "Attendance Summary". A pie of the whole period, not a trend - how the selected
     * window's attendance actually broke down. The four statuses are already mutually
     * exclusive on every Attendance row (see the class-level note above), so this is a
     * straight count per status, same classification attendanceTrend() above already uses.
     */
    private function attendanceSummary(array $range): array
    {
        $rows = Attendance::whereBetween('date', [$range['start']->toDateString(), $range['end']->toDateString()])
            ->selectRaw('status, COUNT(*) as c')
            ->groupBy('status')
            ->pluck('c', 'status');

        $onTime = (int) ($rows['Present'] ?? 0);
        $late = (int) ($rows['Late'] ?? 0);
        $earlyLeave = (int) ($rows['Early Leave'] ?? 0);
        $absent = (int) ($rows['Absent'] ?? 0);
        $total = $onTime + $late + $earlyLeave + $absent;

        $pct = fn (int $n) => $total > 0 ? round($n / $total * 100, 1) : 0.0;

        return [
            'total' => $total,
            'slices' => [
                ['key' => 'onTime', 'label' => 'Present (On Time)', 'value' => $onTime, 'pct' => $pct($onTime), 'color' => 'emerald'],
                ['key' => 'late', 'label' => 'Present (Late)', 'value' => $late, 'pct' => $pct($late), 'color' => 'amber'],
                ['key' => 'earlyLeave', 'label' => 'Early Leave', 'value' => $earlyLeave, 'pct' => $pct($earlyLeave), 'color' => 'blue'],
                ['key' => 'absent', 'label' => 'Absent', 'value' => $absent, 'pct' => $pct($absent), 'color' => 'red'],
            ],
            'meta' => [
                'dataSource' => 'Attendance records (clock-in/clock-out) for the selected period.',
                'formula' => "Count of each status \u{f7} total attendance records \u{d7} 100. One record = one employee's attendance for one day/shift.",
            ],
        ];
    }

    /**
     * Present days against scheduled days for an arbitrary window - shared by the card's
     * headline number (the full selected period) and its sparkline (one call per sub-bucket).
     *
     * A scheduled day covered by approved leave is excused from the denominator, the same way
     * attendance:mark-absent never turns it into an Absent record (MarkAbsentDays.php) - an
     * approved absence does not cost anyone, here either.
     */
    private function attendanceRateFor(string $from, string $to): array
    {
        if ($from > $to) {
            return ['presentDays' => 0, 'scheduledDays' => 0, 'rate' => 0.0];
        }

        $presentDays = Attendance::whereBetween('date', [$from, $to])
            ->whereIn('status', ['Present', 'Late', 'Early Leave'])
            ->count();

        $schedules = ShiftSchedule::where('status', 'Scheduled')
            ->whereBetween('date', [$from, $to])
            ->get(['employee_id', 'date']);

        if ($schedules->isEmpty()) {
            return ['presentDays' => $presentDays, 'scheduledDays' => 0, 'rate' => 0.0];
        }

        $leaves = Leave::where('status', 'Approved')
            ->whereDate('end_date', '>=', $from)
            ->whereDate('start_date', '<=', $to)
            ->get(['employee_id', 'start_date', 'end_date']);

        $scheduledDays = 0;
        foreach ($schedules as $schedule) {
            $date = $schedule->date->toDateString();
            $onLeave = $leaves->contains(fn ($l) => $l->employee_id === $schedule->employee_id
                && $l->start_date->toDateString() <= $date && $l->end_date->toDateString() >= $date);
            if (! $onLeave) {
                $scheduledDays++;
            }
        }

        $rate = $scheduledDays > 0 ? round($presentDays / $scheduledDays * 100, 1) : 0.0;

        return ['presentDays' => $presentDays, 'scheduledDays' => $scheduledDays, 'rate' => $rate];
    }

    /** Card 2: "Attendance Rate" - the big KPI (ring) plus a small trend line across the period's buckets. */
    private function attendanceRate(array $range, array $buckets): array
    {
        $endString = $range['end']->toDateString();
        $overall = $this->attendanceRateFor($range['start']->toDateString(), $endString);

        $trend = array_map(function ($b) use ($endString) {
            $from = $b['from']->toDateString();
            if ($from > $endString) {
                // A bucket entirely after today has not happened yet - zero, not a query that can only
                // ever return nothing.
                return ['label' => $b['label'], 'rate' => 0.0];
            }
            $to = min($b['to']->toDateString(), $endString);
            $r = $this->attendanceRateFor($from, $to);

            return ['label' => $b['label'], 'rate' => $r['rate']];
        }, $buckets);

        return [
            'rate' => $overall['rate'],
            'presentDays' => $overall['presentDays'],
            'scheduledDays' => $overall['scheduledDays'],
            'trend' => $trend,
            'meta' => [
                'dataSource' => 'Attendance records vs. scheduled shifts for the selected period.',
                'formula' => "(Present days \u{f7} scheduled days) \u{d7} 100. Scheduled days excludes days covered by approved leave - an excused absence is not held against the rate. Out of all scheduled workdays, what % did employees actually show up for?",
            ],
        ];
    }

    /** Card 3: "Leave Trends" - approved leave days (not requests), summed per type per sub-bucket. */
    private function leaveTrendForPeriod(array $range, array $buckets): array
    {
        $types = ['vacation', 'sick', 'emergency', 'special', 'funeral', 'unpaid'];

        $rows = Leave::where('status', 'Approved')
            ->whereBetween('start_date', [$range['start']->toDateString(), $range['end']->toDateString()])
            ->get(['leave_type', 'start_date', 'days']);

        $out = array_map(
            fn ($b) => array_merge(['label' => $b['label'], 'total' => 0.0], array_fill_keys([...$types, 'other'], 0.0)),
            $buckets
        );

        foreach ($rows as $row) {
            $idx = self::bucketIndexForDate($buckets, $row->start_date->toDateString());
            if ($idx === null) {
                continue;
            }
            $type = strtolower((string) $row->leave_type);
            $key = in_array($type, $types, true) ? $type : 'other';
            $days = (float) ($row->days ?? 0);
            $out[$idx][$key] += $days;
            $out[$idx]['total'] += $days;
        }

        foreach ($out as &$bucket) {
            foreach ($bucket as $k => $v) {
                if ($k !== 'label') {
                    $bucket[$k] = round($v, 1);
                }
            }
        }
        unset($bucket);

        return [
            'buckets' => $out,
            'types' => $types,
            'meta' => [
                'dataSource' => 'Approved leave records.',
                'formula' => "Total leave days per period, grouped by leave type (each request's day count, summed).",
            ],
        ];
    }

    /** Card 4: "Overtime Hours" - total overtime logged per sub-bucket, one series. */
    private function overtimeHours(array $range, array $buckets): array
    {
        $rows = Attendance::whereBetween('date', [$range['start']->toDateString(), $range['end']->toDateString()])
            ->whereNotNull('overtime')
            ->where('overtime', '>', 0)
            ->get(['date', 'overtime']);

        $out = array_map(fn ($b) => ['label' => $b['label'], 'hours' => 0.0], $buckets);

        foreach ($rows as $row) {
            $idx = self::bucketIndexForDate($buckets, $row->date->toDateString());
            if ($idx === null) {
                continue;
            }
            $out[$idx]['hours'] += (float) $row->overtime;
        }

        foreach ($out as &$bucket) {
            $bucket['hours'] = round($bucket['hours'], 1);
        }
        unset($bucket);

        return [
            'buckets' => $out,
            'totalHours' => round(array_sum(array_column($out, 'hours')), 1),
            'meta' => [
                'dataSource' => 'Overtime records (the overtime hours logged on each attendance record).',
                'formula' => 'Sum of overtime hours per period.',
            ],
        ];
    }

    /** Card 5: "Department Punctuality" - ranked by department, never by name, so nobody is singled out. */
    private function departmentPunctuality(array $range): array
    {
        $rows = DB::table('attendance')
            ->join('employees', 'employees.id', '=', 'attendance.employee_id')
            ->whereBetween('attendance.date', [$range['start']->toDateString(), $range['end']->toDateString()])
            ->whereNotNull('employees.department')
            ->selectRaw('employees.department as department')
            ->selectRaw("SUM(CASE WHEN attendance.status = 'Present' THEN 1 ELSE 0 END) as on_time")
            ->selectRaw("SUM(CASE WHEN attendance.status IN ('Present','Late','Early Leave') THEN 1 ELSE 0 END) as total_clockins")
            ->groupBy('employees.department')
            ->get();

        $departments = $rows->filter(fn ($r) => (int) $r->total_clockins > 0)
            ->map(fn ($r) => [
                'department' => $r->department,
                'onTime' => (int) $r->on_time,
                'totalClockIns' => (int) $r->total_clockins,
                'rate' => round(((int) $r->on_time / (int) $r->total_clockins) * 100, 1),
            ])
            ->sortByDesc('rate')
            ->values()
            ->all();

        return [
            'departments' => $departments,
            'meta' => [
                'dataSource' => 'Attendance records grouped by department.',
                'formula' => "(On-time clock-ins \u{f7} total clock-ins) \u{d7} 100, per department. Which department clocks in on time the most?",
            ],
        ];
    }

    /** Card 6: "Leave Type Composition" - approved requests only; counted, not summed in days. */
    private function leaveComposition(array $range): array
    {
        $types = ['vacation', 'sick', 'emergency', 'special', 'funeral', 'unpaid'];

        $rows = Leave::where('status', 'Approved')
            ->whereBetween('start_date', [$range['start']->toDateString(), $range['end']->toDateString()])
            ->selectRaw('leave_type, COUNT(*) as c')
            ->groupBy('leave_type')
            ->pluck('c', 'leave_type');

        // A type this donut has no slice of its own for (e.g. 'Half Day' - a real approved request
        // with no bucket of its own, same case leaveTrendForPeriod() above already guards) still has
        // to be counted, or approved leave could exist in the database and be invisible here - same
        // reasoning, same 'other' bucket, so the two cards can never quietly disagree.
        $counts = array_fill_keys([...$types, 'other'], 0);
        foreach ($rows as $type => $count) {
            $key = strtolower((string) $type);
            $key = in_array($key, $types, true) ? $key : 'other';
            $counts[$key] += (int) $count;
        }

        $total = array_sum($counts);
        $slices = collect($counts)
            ->filter(fn ($count) => $count > 0)
            ->map(fn ($count, $type) => [
                'type' => $type,
                'count' => $count,
                'pct' => $total > 0 ? round($count / $total * 100, 1) : 0.0,
            ])
            ->values()
            ->all();

        return [
            'total' => $total,
            'slices' => $slices,
            'meta' => [
                'dataSource' => 'Approved leave records only - pending, rejected and cancelled requests are excluded; they never happened.',
                'formula' => "Count of approved leave requests per type \u{f7} total approved \u{d7} 100.",
            ],
        ];
    }
}
