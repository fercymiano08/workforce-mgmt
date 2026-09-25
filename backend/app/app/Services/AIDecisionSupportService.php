<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\OvertimeRequest;
use App\Models\SecurityEvent;
use App\Models\Setting;
use App\Models\ShiftSchedule;
use App\Support\LocalTime;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * AI decision support for HR.
 *
 * How a briefing is made:
 *   1. facts()     One snapshot of the database on the company's clock (Manila): the last 30 days of attendance,
 *                  today's coverage, pending requests and open kiosk security events. Every number shown comes from here.
 *   2. findings()  Fixed, explainable rules turn the facts into findings (e.g. "3 or more late arrivals in 30 days");
 *      score()     the Workforce Health Score, with a breakdown of every point taken off.
 *   3. Gemini      When an API key is set, Gemini explains each finding in plain language, recommends the next step and
 *                  writes the summary. It cannot add, drop or re-rate a finding, and any text of its that states a number
 *                  that is not in the data is thrown away in favour of the rule's own wording. Without a key, or when
 *                  Gemini cannot be reached, the rule wording is shown: the same findings and the same score.
 *
 * `source` says who wrote the text ('ai' or 'rule-based'); `aiStatus` says why (ok, not_configured, unavailable).
 */
class AIDecisionSupportService
{
    public const WINDOW_DAYS = 30;

    public const LATE_THRESHOLD = 3;            // late arrivals in the window

    public const ABSENT_THRESHOLD = 2;          // absences in the window

    public const LOW_ATTENDANCE_RATE = 90.0;    // % of expected work days attended

    public const LOW_PUNCTUALITY = 80.0;        // % of arrivals on time

    public const MIN_DAYS_FOR_PUNCTUALITY = 5;  // fewer arrivals than this are too few to judge a percentage

    public const HIGH_AVG_OVERTIME = 1.0;       // overtime hours per day worked

    // The same findings get the same Gemini wording for this long: the free tier allows only 20 requests a day per
    // model, so a page view must never cost a request when nothing has changed.
    private const AI_CACHE_MINUTES = 360;

    // The most time, in seconds, every Gemini attempt together may take before the rule-based wording is used instead.
    private const AI_TOTAL_SECONDS = 20;

    // A model that failed with a busy / server error is left alone this long before it is tried again.
    private const AI_BUSY_MINUTES = 3;

    private const SEVERITY_ORDER = ['critical' => 0, 'warning' => 1, 'info' => 2, 'success' => 3];

    public function insights(bool $fresh = false): array
    {
        $facts = $this->facts();
        $items = $this->findings($facts);
        ['score' => $healthScore, 'breakdown' => $breakdown] = $this->score($facts, $items);
        $summary = $this->summary($healthScore, $facts, $items);

        [$aiStatus, $briefing, $aiReason] = $this->aiBriefing($facts, $items, $healthScore, $fresh);
        $source = 'rule-based';
        if ($briefing) {
            foreach ($items as &$item) {
                foreach ($briefing['insights'][$item['id']] ?? [] as $field => $text) {
                    $item[$field] = $text;
                }
            }
            unset($item);
            $summary = $briefing['summary'] ?? $summary;
            $source = 'ai';
        }

        return [
            'source' => $source,
            'aiStatus' => $aiStatus,
            'aiReason' => $aiReason,
            'aiRetryAt' => $aiStatus === 'unavailable' ? $this->quotaResetAt() : null,
            'generatedAt' => now()->toISOString(),
            'window' => ['from' => $facts['window']['from'], 'to' => $facts['window']['to'], 'days' => self::WINDOW_DAYS],
            'healthScore' => $healthScore,
            'scoreBreakdown' => $breakdown,
            'summary' => $summary,
            'insights' => $this->withResolution($items),
            'queue' => $this->approvalQueue(),
        ];
    }

    /**
     * Everything waiting for HR's decision, with what they need to decide it: for leave, the balance left after
     * approving and how many others are already off on those days.
     */
    public function approvalQueue(): array
    {
        $headcount = Employee::where('status', '!=', 'Inactive')->count();
        $today = LocalTime::today()->toDateString();

        $leave = Leave::where('status', 'Pending')->orderBy('applied_date')->orderBy('id')->get()->map(function (Leave $l) use ($headcount, $today) {
            $days = (float) ($l->days ?? ($l->start_date->diffInDays($l->end_date) + 1));
            $balance = collect(Employee::find($l->employee_id)?->leaveBalances() ?? [])->firstWhere('type', $l->leave_type);
            $othersOff = Leave::where('status', 'Approved')
                ->where('employee_id', '!=', $l->employee_id)
                ->whereDate('start_date', '<=', $l->end_date->toDateString())
                ->whereDate('end_date', '>=', $l->start_date->toDateString())
                ->distinct()->count('employee_id');

            return [
                'id' => $l->id,
                'employee' => $l->employee_name,
                'type' => $l->leave_type,
                'start' => $l->start_date->format('Y-m-d'),
                'end' => $l->end_date->format('Y-m-d'),
                'days' => $days,
                'applied' => $l->applied_date?->format('Y-m-d'),
                'reason' => $l->reason,
                // null when the leave type has no limited balance
                'balance' => $balance ? [
                    'remaining' => (float) $balance['remaining'],
                    'afterApproval' => round((float) $balance['remaining'] - $days, 1),
                ] : null,
                'othersOff' => $othersOff,
                'headcount' => $headcount,
                // the leave has already started (or passed) while still undecided
                'alreadyStarted' => $l->start_date->toDateString() <= $today,
            ];
        })->values();

        $overtime = OvertimeRequest::where('status', 'Pending')->orderBy('requested_date')->orderBy('id')->get()->map(
            fn (OvertimeRequest $o) => [
                'id' => $o->id,
                'employee' => $o->employee_name,
                'date' => $o->date->format('Y-m-d'),
                'hours' => (float) $o->expected_hours,
                'applied' => $o->requested_date?->format('Y-m-d'),
                'reason' => $o->reason,
            ]
        )->values();

        $security = SecurityEvent::with('employee')->where('status', 'Open')->orderBy('created_at', 'desc')->get()
            ->map(fn (SecurityEvent $s) => [
                'id' => $s->id,
                'type' => $s->type,
                'label' => $s->type === 'face_mismatch' ? 'Face mismatch' : 'Failed PIN attempt',
                'message' => $s->message,
                'employee' => $s->employee ? trim($s->employee->first_name.' '.$s->employee->last_name) : null,
                'time' => $s->created_at?->toISOString(),
            ])->values();

        return ['leave' => $leave, 'overtime' => $overtime, 'security' => $security];
    }

    /** The snapshot every finding, score and AI sentence is based on - all on the company's clock. */
    public function facts(): array
    {
        $now = LocalTime::now();
        $today = $now->toDateString();
        $from = $now->copy()->subDays(self::WINDOW_DAYS - 1)->toDateString();

        return [
            'today' => $today,
            'window' => ['from' => $from, 'to' => $today, 'days' => self::WINDOW_DAYS],
            'attendance' => $this->attendanceFacts($from, $today),
            'today_coverage' => $this->todayCoverage($now),
            'pending' => [
                'leave' => Leave::where('status', 'Pending')->orderBy('applied_date')->get()->map(fn (Leave $l) => [
                    'id' => $l->id, 'employee' => $l->employee_name, 'type' => $l->leave_type,
                    'start' => $l->start_date->toDateString(), 'end' => $l->end_date->toDateString(),
                    'applied' => $l->applied_date?->toDateString(),
                ])->values()->all(),
                'overtime' => OvertimeRequest::where('status', 'Pending')->orderBy('requested_date')->get()->map(fn (OvertimeRequest $o) => [
                    'id' => $o->id, 'employee' => $o->employee_name, 'date' => $o->date->toDateString(),
                    'hours' => (float) $o->expected_hours, 'applied' => $o->requested_date?->toDateString(),
                ])->values()->all(),
            ],
            'leave_trend' => [
                'last_month_approved' => $this->approvedLeaveCount($now->copy()->subMonthNoOverflow()),
                'this_month_approved' => $this->approvedLeaveCount($now),
            ],
            'security' => $this->securityFacts(),
            'workforce' => [
                'active' => Employee::where('status', 'Active')->count(),
                'on_leave' => Employee::where('status', 'On Leave')->count(),
                'departments' => Employee::where('status', '!=', 'Inactive')->whereNotNull('department')
                    ->distinct()->orderBy('department')->pluck('department')->values()->all(),
            ],
        ];
    }

    /**
     * Per person and in total, over the window. Each day counts once, by its attendance status:
     *   attended = arrived (on time or late; a day they left early still counts as attended)
     *   expected = attended + absent - approved leave is never held against anyone (it has no attendance row)
     *   punctuality = on-time arrivals / arrivals. A day that ended as Early Leave is judged by its clock-in,
     *   the same way the kiosk judges lateness (after the shift start plus the late-grace minutes).
     */
    private function attendanceFacts(string $from, string $to): array
    {
        $rows = Attendance::join('employees', 'employees.id', '=', 'attendance.employee_id')
            ->where('employees.status', '!=', 'Inactive')
            ->whereBetween('attendance.date', [$from, $to])
            ->orderBy('attendance.date')
            ->get(['attendance.employee_id', 'attendance.date', 'attendance.status', 'attendance.clock_in', 'attendance.overtime',
                'employees.first_name', 'employees.last_name', 'employees.department']);

        $lateEarlyLeave = $this->lateEarlyLeaveDays($rows, $from, $to);

        $people = [];
        foreach ($rows as $row) {
            $id = $row->employee_id;
            $date = $row->date->toDateString();
            $p = $people[$id] ??= [
                'id' => $id, 'name' => trim($row->first_name.' '.$row->last_name), 'department' => $row->department,
                'on_time' => 0, 'late' => 0, 'left_early' => 0, 'absent' => 0, 'overtime_hours' => 0.0,
                'last_late' => null, 'last_absent' => null, 'last_overtime' => null,
            ];

            $status = $row->status;
            if ($status === 'Early Leave') {
                $p['left_early']++;
                $status = isset($lateEarlyLeave[$id.'|'.$date]) ? 'Late' : 'Present';
            }
            match ($status) {
                'Present' => $p['on_time']++,
                'Late' => [$p['late']++, $p['last_late'] = $date],
                'Absent' => [$p['absent']++, $p['last_absent'] = $date],
                default => null,   // no other status is recorded by the system
            };
            if ((float) $row->overtime > 0) {
                $p['overtime_hours'] += (float) $row->overtime;
                $p['last_overtime'] = $date;
            }
            $people[$id] = $p;
        }

        $totals = ['on_time' => 0, 'late' => 0, 'left_early' => 0, 'absent' => 0, 'overtime_hours' => 0.0, 'last_absent' => null];
        foreach ($people as $id => $p) {
            $attended = $p['on_time'] + $p['late'];
            $people[$id] += [
                'attended' => $attended,
                'expected' => $attended + $p['absent'],
                'attendance_rate_pct' => $attended + $p['absent'] > 0 ? round($attended / ($attended + $p['absent']) * 100, 1) : null,
                'punctuality_pct' => $attended > 0 ? round($p['on_time'] / $attended * 100, 1) : null,
                'avg_overtime_per_day' => $attended > 0 ? round($p['overtime_hours'] / $attended, 1) : 0.0,
            ];
            $people[$id]['overtime_hours'] = round($p['overtime_hours'], 2);
            foreach (['on_time', 'late', 'left_early', 'absent', 'overtime_hours'] as $k) {
                $totals[$k] += $p[$k];
            }
            if ($p['last_absent'] && $p['last_absent'] > (string) $totals['last_absent']) {
                $totals['last_absent'] = $p['last_absent'];
            }
        }
        $attended = $totals['on_time'] + $totals['late'];
        $expected = $attended + $totals['absent'];
        $totals += [
            'attended' => $attended,
            'expected' => $expected,
            'attendance_rate_pct' => $expected > 0 ? round($attended / $expected * 100, 1) : null,
            'punctuality_pct' => $attended > 0 ? round($totals['on_time'] / $attended * 100, 1) : null,
        ];
        $totals['overtime_hours'] = round($totals['overtime_hours'], 1);

        uasort($people, fn ($a, $b) => strcmp($a['name'], $b['name']));

        return ['totals' => $totals, 'per_employee' => array_values($people)];
    }

    /** @return array<string, true> "employeeId|date" of the Early Leave days whose clock-in was late */
    private function lateEarlyLeaveDays($rows, string $from, string $to): array
    {
        $early = $rows->where('status', 'Early Leave')->filter(fn ($r) => $r->clock_in);
        if ($early->isEmpty()) {
            return [];
        }

        $grace = max(0, (int) app(SystemSettings::class)->get('late_grace_minutes', 15));
        $starts = ShiftSchedule::with('shift')->whereIn('employee_id', $early->pluck('employee_id')->unique()->all())
            ->whereBetween('date', [$from, $to])->get()
            ->mapWithKeys(fn ($s) => [$s->employee_id.'|'.$s->date->toDateString() => $s->shift?->start_time]);

        $late = [];
        foreach ($early as $row) {
            $key = $row->employee_id.'|'.$row->date->toDateString();
            $start = $starts[$key] ?? null;
            // Without the day's shift there is no start to be late for: counted as on time.
            if ($start && Carbon::parse($row->date->toDateString().' '.$row->clock_in)
                ->gt(Carbon::parse($row->date->toDateString().' '.$start)->addMinutes($grace))) {
                $late[$key] = true;
            }
        }

        return $late;
    }

    /**
     * Today's shifts: who clocked in, who is overdue (the absent-grace time after their shift start has passed - the
     * same rule as the "Possible No-Show" alert), and who is not due yet. People on approved leave are not counted.
     */
    private function todayCoverage(Carbon $now): array
    {
        $today = $now->toDateString();
        $onLeave = array_flip(Leave::where('status', 'Approved')
            ->whereDate('start_date', '<=', $today)->whereDate('end_date', '>=', $today)
            ->pluck('employee_id')->all());
        $clockedIn = array_flip(Attendance::where('date', $today)->whereNotNull('clock_in')->pluck('employee_id')->all());
        $schedules = ShiftSchedule::with('shift')->where('date', $today)->where('status', 'Scheduled')->get()
            ->reject(fn ($s) => isset($onLeave[$s->employee_id]))
            ->unique('employee_id');
        $names = Employee::whereIn('id', $schedules->pluck('employee_id')->all())->get(['id', 'first_name', 'last_name'])
            ->mapWithKeys(fn ($e) => [$e->id => trim($e->first_name.' '.$e->last_name)]);
        $grace = app(AttendanceAlerts::class)->absentGraceMinutes();

        $in = 0;
        $notDueYet = 0;
        $overdue = [];
        foreach ($schedules as $s) {
            if (isset($clockedIn[$s->employee_id])) {
                $in++;

                continue;
            }
            $start = $s->shift?->start_time ? Carbon::parse($today.' '.$s->shift->start_time, $now->getTimezone()) : null;
            if ($start && $now->gte($start->copy()->addMinutes($grace))) {
                $overdue[] = ['id' => $s->employee_id, 'name' => $names[$s->employee_id] ?? $s->employee_name, 'due' => $start->format('g:i A')];
            } else {
                $notDueYet++;
            }
        }

        return [
            'scheduled' => $schedules->count(),
            'clocked_in' => $in,
            'not_due_yet' => $notDueYet,
            'overdue' => $overdue,
            'absent_grace_minutes' => $grace,
        ];
    }

    private function securityFacts(): array
    {
        $open = SecurityEvent::with('employee')->where('status', 'Open')->orderBy('created_at')->get();
        $tz = LocalTime::timezone();

        return [
            'open_face_mismatch' => $open->where('type', 'face_mismatch')->count(),
            'open_pin_failed' => $open->where('type', 'pin_failed')->count(),
            'latest_open_id' => $open->last()?->id,
            'open_events' => $open->map(fn (SecurityEvent $s) => [
                'id' => $s->id,
                'type' => $s->type,
                // face_mismatch: someone tried to clock in as this person and the face did not match
                'attempted_as' => $s->employee ? trim($s->employee->first_name.' '.$s->employee->last_name) : null,
                'time' => $s->created_at?->copy()->setTimezone($tz)->format('M j, g:i A'),
            ])->values()->all(),
        ];
    }

    /** Approved leave starting in the given month (on the company's calendar). */
    private function approvedLeaveCount(Carbon $month): int
    {
        return Leave::where('status', 'Approved')
            ->whereBetween('start_date', [$month->copy()->startOfMonth()->toDateString(), $month->copy()->endOfMonth()->toDateString()])
            ->count();
    }

    /** @return list<array> the findings, most urgent first */
    public function findings(array $facts): array
    {
        $insights = [];
        $days = self::WINDOW_DAYS;
        $t = $facts['attendance']['totals'];

        if ($t['expected'] === 0) {
            $insights[] = $this->make('not-enough-data', 'info', 'Workforce', 'Not enough data yet',
                "No attendance has been recorded in the last {$days} days, so reliable insights cannot be generated yet.",
                'Log a few days of attendance first, then come back here for recommendations.',
                '0 records', null);
        } elseif ($t['attendance_rate_pct'] < self::LOW_ATTENDANCE_RATE) {
            $rate = $t['attendance_rate_pct'];
            $insights[] = $this->make('low-attendance', 'critical', 'Attendance', "Attendance rate is {$rate}%",
                "{$t['attended']} of {$t['expected']} expected work days in the last {$days} days were attended ({$rate}%); {$t['absent']} were absences. The target is ".self::LOW_ATTENDANCE_RATE.'%.',
                'Review the absences on the Attendance page and follow up with the people flagged below.',
                "{$rate}% · last {$days} days", $t['last_absent'],
                'navigate_attendance', 'View Absences', ['status' => 'Absent', 'period' => 'Last 30 Days']);
        } else {
            $rate = $t['attendance_rate_pct'];
            $insights[] = $this->make('healthy-attendance', 'success', 'Attendance', 'Attendance is strong',
                "{$t['attended']} of {$t['expected']} expected work days in the last {$days} days were attended ({$rate}%), above the ".self::LOW_ATTENDANCE_RATE.'% target.',
                'Keep the current pattern going; no action needed right now.',
                "{$rate}% · last {$days} days", null);
        }

        foreach ($facts['attendance']['per_employee'] as $p) {
            $name = $p['name'];
            $link = ['search' => $name, 'period' => 'Last 30 Days'];

            if ($p['late'] >= self::LATE_THRESHOLD) {
                $insights[] = $this->make("late-{$p['id']}", 'warning', 'Punctuality', "Repeated late arrivals - {$name}",
                    "{$name} arrived late on {$p['late']} of the {$p['attended']} days they came in during the last {$days} days (most recently ".$this->day($p['last_late']).').',
                    "Have a brief one-on-one with {$name} to understand the cause and reinforce the start time.",
                    "{$p['late']} late · last {$days} days", $p['last_late'],
                    'navigate_attendance', 'View Late Arrivals', $link + ['status' => 'Late'], $p);
            }

            if ($p['absent'] >= self::ABSENT_THRESHOLD) {
                $insights[] = $this->make("absent-{$p['id']}", 'warning', 'Attendance', "Repeated absences - {$name}",
                    "{$name} was absent on {$p['absent']} of their {$p['expected']} expected work days in the last {$days} days (most recently ".$this->day($p['last_absent']).').',
                    "Check in with {$name} - repeated absences can signal illness, burnout or personal issues that need support.",
                    "{$p['absent']} absent · last {$days} days", $p['last_absent'],
                    'navigate_attendance', 'View Absences', $link + ['status' => 'Absent'], $p);
            }

            // Only below the repeated-lateness line (so one person is not flagged twice for the same late days), and
            // only with enough days behind the percentage.
            if ($p['late'] < self::LATE_THRESHOLD && $p['attended'] >= self::MIN_DAYS_FOR_PUNCTUALITY
                && $p['punctuality_pct'] !== null && $p['punctuality_pct'] < self::LOW_PUNCTUALITY) {
                $insights[] = $this->make("punctuality-{$p['id']}", 'info', 'Punctuality', "Punctuality below target - {$name}",
                    "{$name} arrived on time on {$p['on_time']} of the {$p['attended']} days they came in ({$p['punctuality_pct']}%), below the ".self::LOW_PUNCTUALITY.'% target.',
                    "Remind {$name} of the start time and check again next week.",
                    "{$p['punctuality_pct']}% on time", $p['last_late'],
                    'navigate_attendance', 'View Late Arrivals', $link + ['status' => 'Late'], $p);
            }

            if ($p['avg_overtime_per_day'] > self::HIGH_AVG_OVERTIME) {
                $insights[] = $this->make("overtime-{$p['id']}", 'warning', 'Overtime', "Heavy overtime load - {$name}",
                    "{$name} worked {$p['overtime_hours']}h of approved overtime over the {$p['attended']} days they came in during the last {$days} days - {$p['avg_overtime_per_day']}h a day on average, above the ".self::HIGH_AVG_OVERTIME.'h comfort line.',
                    "Review {$name}'s workload. Sustained overtime risks burnout and raises labor costs.",
                    "{$p['avg_overtime_per_day']}h/day avg", $p['last_overtime'],
                    'navigate_attendance', 'View Attendance', $link, $p);
            }
        }

        $this->addTodayCoverage($insights, $facts);
        $this->addApprovalQueue($insights, $facts);
        $this->addLeaveTrend($insights, $facts);
        $this->addWorkforce($insights, $facts);
        $this->addSecurity($insights, $facts);

        usort($insights, fn ($a, $b) => self::SEVERITY_ORDER[$a['severity']] <=> self::SEVERITY_ORDER[$b['severity']]);

        return $insights;
    }

    /**
     * The Workforce Health Score: 100 minus points taken off for five things, each in proportion to how bad it is
     * (so a bigger team does not score worse just for having more people):
     *   Attendance    2 points per % below 100% attended (up to 40)
     *   Punctuality   0.5 points per % below 100% on time (up to 25)
     *   People flagged  20 points x the share of employees with a repeated-late / absence / punctuality / overtime finding
     *   Security      8 for open face mismatches, 3 for open failed PIN attempts
     *   Approvals     2 for anything waiting, 3 more when a request has waited over a week
     *
     * @return array{score: int, breakdown: list<array{label: string, points: float, detail: string}>}
     */
    public function score(array $facts, array $items): array
    {
        $t = $facts['attendance']['totals'];
        $rows = [];
        $take = function (string $label, float $points, string $detail) use (&$rows): void {
            $rows[] = ['label' => $label, 'points' => round(min($points, 1000), 1), 'detail' => $detail];
        };

        // Nothing recorded yet: attendance and punctuality cannot count against anyone
        if ($t['expected'] > 0) {
            $rate = $t['attendance_rate_pct'];
            $take('Attendance', min(40, (100 - $rate) * 2), "{$rate}% of expected work days attended");
        }
        if ($t['attended'] > 0) {
            $punctuality = $t['punctuality_pct'];
            $take('Punctuality', min(25, (100 - $punctuality) * 0.5), "{$punctuality}% of arrivals on time");
        }

        $people = count($facts['attendance']['per_employee']);
        $flagged = collect($items)->filter(fn ($i) => preg_match('/^(late|absent|punctuality|overtime)-/', $i['id']))
            ->map(fn ($i) => explode('-', $i['id'], 2)[1])->unique()->count();
        $take('People flagged', $people > 0 ? min(20, $flagged / $people * 20) : 0, "{$flagged} of {$people} employees have a repeated late, absence, punctuality or overtime finding");

        $s = $facts['security'];
        $take('Security', ($s['open_face_mismatch'] > 0 ? 8 : 0) + ($s['open_pin_failed'] > 0 ? 3 : 0),
            "{$s['open_face_mismatch']} open face mismatch, {$s['open_pin_failed']} open failed PIN");

        $waiting = array_merge($facts['pending']['leave'], $facts['pending']['overtime']);
        $oldest = collect($waiting)->pluck('applied')->filter()->min();
        $stale = $oldest && Carbon::parse($oldest)->lt(Carbon::parse($facts['today'])->subDays(7));
        $take('Approvals', $waiting === [] ? 0 : 2 + ($stale ? 3 : 0),
            count($waiting).' waiting'.($stale ? ', one for over a week' : ''));

        $rows = array_values(array_filter($rows, fn ($r) => $r['points'] > 0));

        return ['score' => max(0, min(100, (int) round(100 - array_sum(array_column($rows, 'points'))))), 'breakdown' => $rows];
    }

    private function addTodayCoverage(array &$insights, array $facts): void
    {
        $c = $facts['today_coverage'];
        if ($c['scheduled'] === 0) {
            return;
        }

        $overdue = count($c['overdue']);
        if ($overdue > 0) {
            $names = array_column($c['overdue'], 'name');
            $who = $overdue <= 3 ? $this->listNames($names) : implode(', ', array_slice($names, 0, 3))." and ".($overdue - 3).' more';
            $insights[] = $this->make('no-show-today', 'warning', 'Scheduling', 'Possible no-shows today',
                "{$who} ".($overdue === 1 ? 'has' : 'have')." not clocked in, and it is more than {$c['absent_grace_minutes']} minutes past the start of their shift. {$c['clocked_in']} of {$c['scheduled']} scheduled employees have clocked in.",
                'Contact them now to confirm whether they will report, and arrange cover if they will not.',
                "{$overdue} of {$c['scheduled']} not in", $facts['today'].'#'.implode(',', array_column($c['overdue'], 'id')),
                'navigate_attendance', "View Today's Attendance", ['period' => 'Today']);

            return;
        }

        $insights[] = $this->make('coverage-today', 'success', 'Scheduling', 'Today\'s shifts are covered',
            "{$c['clocked_in']} of {$c['scheduled']} scheduled employees have clocked in".($c['not_due_yet'] > 0 ? "; {$c['not_due_yet']} ".($c['not_due_yet'] === 1 ? 'is' : 'are').' not due yet' : '').'.',
            'No action needed right now.',
            "{$c['clocked_in']} of {$c['scheduled']} in", null);
    }

    private function addApprovalQueue(array &$insights, array $facts): void
    {
        $leave = $facts['pending']['leave'];
        $overtime = $facts['pending']['overtime'];
        $count = count($leave) + count($overtime);

        if ($count === 0) {
            $insights[] = $this->make('queue-clear', 'success', 'Workforce', 'Approval queue is clear',
                'There are no pending leave or overtime requests right now.',
                'No action needed - everything is up to date.', '0 pending', null);

            return;
        }
        $oldest = collect(array_merge($leave, $overtime))->pluck('applied')->filter()->min();
        $insights[] = $this->make('pending-approvals', 'warning', 'Workforce', 'Approval queue needs attention',
            count($leave).' leave request'.(count($leave) === 1 ? '' : 's').' and '.count($overtime).' overtime request'.(count($overtime) === 1 ? '' : 's').' are waiting for a decision'
                .($oldest ? ' - the oldest was filed on '.$this->day($oldest) : '').'.',
            'Decide them in the Decision Queue so employees can plan and schedules stay accurate.',
            "{$count} pending", implode(',', array_merge(array_column($leave, 'id'), array_column($overtime, 'id'))),
            'scroll_to_queue', 'Open Decision Queue', ['pendingLeave' => count($leave), 'pendingOvertime' => count($overtime)]);
    }

    private function addLeaveTrend(array &$insights, array $facts): void
    {
        $last = $facts['leave_trend']['last_month_approved'];
        $now = $facts['leave_trend']['this_month_approved'];
        if ($last > 0 && $now >= $last * 1.5 && $now - $last >= 2) {
            $insights[] = $this->make('leave-spike', 'info', 'Leave', 'Leave is trending up',
                "Approved leave starting this month is {$now}, up from {$last} last month.",
                'Check staffing coverage for the coming weeks if the trend continues.',
                "{$last} → {$now} approved", substr($facts['today'], 0, 7).'#'.$now,
                'navigate_leave', 'Review Leave Requests');
        }
    }

    private function addWorkforce(array &$insights, array $facts): void
    {
        $w = $facts['workforce'];
        if ($w['active'] + $w['on_leave'] === 0) {
            return;
        }

        $departments = count($w['departments']);
        $insights[] = $this->make('workforce-size', 'success', 'Workforce',
            "{$w['active']} active employee".($w['active'] === 1 ? '' : 's'),
            "{$w['active']} employee".($w['active'] === 1 ? ' is' : 's are').' active across '.$departments.' department'.($departments === 1 ? '' : 's')
                .($w['on_leave'] > 0 ? ", and {$w['on_leave']} ".($w['on_leave'] === 1 ? 'is' : 'are').' on leave' : '').'.',
            'Use the Analytics dashboard for a breakdown by department.',
            "{$w['active']} active", null);
    }

    private function addSecurity(array &$insights, array $facts): void
    {
        $s = $facts['security'];
        $face = $s['open_face_mismatch'];
        $pin = $s['open_pin_failed'];
        if ($face + $pin === 0) {
            return;
        }

        $parts = [];
        if ($face > 0) {
            $targets = collect($s['open_events'])->where('type', 'face_mismatch')->pluck('attempted_as')->filter()->unique()->values()->all();
            $parts[] = "{$face} face mismatch".($face === 1 ? '' : 'es').($targets ? ' (someone tried to clock in as '.$this->listNames($targets).')' : '');
        }
        if ($pin > 0) {
            $parts[] = "{$pin} failed kiosk PIN attempt".($pin === 1 ? '' : 's');
        }
        $open = $face + $pin;

        $insights[] = $this->make('security-intruder-alert', $face > 0 ? 'critical' : 'warning', 'Security',
            $face > 0 ? 'Unrecognized faces at the entrance kiosk' : 'Failed kiosk access attempts',
            implode(' and ', $parts).' '.($open === 1 ? 'is' : 'are').' still open.',
            $face > 0
                ? 'Review each event in the Decision Queue, ask the employee named whether it was them, and escalate anything you cannot explain.'
                : 'Review the attempts in the Decision Queue and change the kiosk PIN if you suspect someone is guessing it.',
            "{$open} open", $s['latest_open_id'],
            'scroll_to_queue', 'Review in Decision Queue', ['count' => $open]);
    }

    /**
     * @param  ?string  $fingerprint  what the finding is about right now (e.g. the date of the latest late arrival):
     *                                "Mark as handled" holds until it changes, so a new occurrence brings the finding back.
     * @param  array  $person  the numbers behind a per-employee finding (only used to check Gemini's wording)
     */
    private function make(
        string $id,
        string $severity,
        string $category,
        string $title,
        string $message,
        string $recommendation,
        ?string $metric,
        ?string $fingerprint,
        ?string $applyAction = null,
        ?string $applyLabel = null,
        ?array $applyPayload = null,
        array $person = [],
    ): array {
        return [
            'id' => $id,
            'severity' => $severity,
            'category' => $category,
            'title' => $title,
            'message' => $message,
            'recommendation' => $recommendation,
            'metric' => $metric,
            'resolveKey' => $fingerprint === null ? $id : $id.'@'.$fingerprint,
            'applyAction' => $applyAction,
            'applyLabel' => $applyLabel,
            'applyPayload' => $applyPayload,
            'basis' => $person,
        ];
    }

    private function withResolution(array $insights): array
    {
        $resolved = array_flip($this->resolvedInsightKeys());

        return array_map(function (array $insight) use ($resolved) {
            unset($insight['basis']);
            // Good news is never "handled" - there is nothing to act on.
            $insight['resolved'] = $insight['severity'] !== 'success' && isset($resolved[$insight['resolveKey']]);

            return $insight;
        }, array_values($insights));
    }

    private function resolvedInsightKeys(): array
    {
        $stored = Setting::query()->firstOrCreate([])->ai_resolved_insights ?? [];

        return is_array($stored) ? array_values(array_filter($stored, 'is_string')) : [];
    }

    private function summary(int $score, array $facts, array $items): string
    {
        if ($facts['attendance']['totals']['expected'] === 0) {
            return 'Not enough data yet - log attendance to unlock reliable recommendations.';
        }

        $open = collect($items)->whereIn('severity', ['critical', 'warning'])->count();
        $flags = $open === 0 ? '' : " {$open} item".($open === 1 ? ' needs' : 's need').' attention.';
        if ($score >= 90) {
            return 'Your workforce is in great shape. Attendance and approvals look healthy.'.$flags;
        }
        if ($score >= 75) {
            return 'Overall things look solid, but a few things need attention.'.$flags;
        }

        return 'There are issues to address - review the flagged insights below.'.$flags;
    }

    private function day(?string $date): string
    {
        return $date ? Carbon::parse($date)->format('M j') : '-';
    }

    private function listNames(array $names): string
    {
        return count($names) <= 1 ? (string) ($names[0] ?? '')
            : implode(', ', array_slice($names, 0, -1)).' and '.end($names);
    }

    /**
     * Gemini's wording for the findings, checked. @return array{0: string, 1: ?array} [aiStatus, briefing]
     */
    private function aiBriefing(array $facts, array $items, int $score, bool $fresh): array
    {
        $key = config('services.gemini.key');
        if (! $key) {
            return ['not_configured', null, null];
        }

        $findings = array_map(fn ($i) => [
            'ref' => $i['id'], 'severity' => $i['severity'], 'category' => $i['category'],
            'title' => $i['title'], 'message' => $i['message'], 'metric' => $i['metric'],
        ], $items);
        $model = (string) config('services.gemini.model', 'gemini-2.5-flash');
        $cacheKey = 'ai-briefing:'.sha1(json_encode([$score, $findings]));

        if (! $fresh && ($cached = Cache::get($cacheKey))) {
            return ['ok', $cached, null];
        }

        $snapshot = [
            'today' => $facts['today'],
            'window' => $facts['window'],
            'health_score' => $score,
            'findings' => $findings,
            'facts' => array_diff_key($facts, ['today' => 1, 'window' => 1]),
        ];

        // Google turns a model away for different reasons - busy (503), out of free quota (429), retired (404) - and each
        // is remembered for as long as it lasts, so a model that cannot answer is not asked again and again. The
        // configured model goes first, then the fallbacks.
        $briefing = null;
        // One overall budget for all the models together, well inside PHP's 30-second limit: several slow models in a row
        // must end in the rule-based wording, never in a crashed page.
        $deadline = microtime(true) + self::AI_TOTAL_SECONDS;
        foreach (array_values(array_unique([$model, ...(array) config('services.gemini.fallback_models', [])])) as $candidate) {
            $remaining = $deadline - microtime(true);
            if ($remaining < 2) {
                break;
            }
            $cooling = Cache::get("gemini-cooldown:{$candidate}");
            // "Regenerate" retries a model that was only busy, but never one that is out of quota or retired
            if ($cooling && ! ($fresh && $cooling === 'busy')) {
                continue;
            }
            try {
                $response = Http::timeout(max(2, (int) min((int) config('services.gemini.timeout', 30), floor($remaining))))
                    ->asJson()
                    ->withQueryParameters(['key' => $key])
                    ->post("https://generativelanguage.googleapis.com/v1beta/models/{$candidate}:generateContent", [
                        'contents' => [['parts' => [['text' => json_encode($snapshot, JSON_UNESCAPED_UNICODE | JSON_THROW_ON_ERROR)]]]],
                        'systemInstruction' => ['parts' => [['text' => $this->systemPrompt()]]],
                        'generationConfig' => ['responseMimeType' => 'application/json', 'temperature' => 0.2],
                    ]);
            } catch (\Throwable) {
                Cache::put("gemini-cooldown:{$candidate}", 'busy', now()->addMinutes(self::AI_BUSY_MINUTES));   // timed out

                continue;
            }

            if ($response->status() === 401 || $response->status() === 403) {
                Cache::put('gemini-cooldown:key', 'key', now()->addMinutes(self::AI_BUSY_MINUTES));

                break;   // the key itself is refused: no other model will differ
            }
            if (! $response->successful()) {
                $this->coolDown($candidate, $response->status(), (string) $response->body());

                continue;
            }

            // Newer models may send "thinking" parts before the answer: only the answer parts are read
            $text = collect(data_get($response->json(), 'candidates.0.content.parts', []))->reject(fn ($part) => ! empty($part['thought']))->pluck('text')->implode('');
            $decoded = json_decode(trim($text), true);
            $briefing = is_array($decoded) ? $this->checkedBriefing($decoded, $items, $facts, $score) : null;
            if ($briefing) {
                break;
            }
        }

        if (! $briefing) {
            return ['unavailable', null, $this->whyUnavailable($model)];
        }

        Cache::put($cacheKey, $briefing, now()->addMinutes(self::AI_CACHE_MINUTES));

        return ['ok', $briefing, null];
    }

    /**
     * Why there is no Gemini wording right now, for the screen: the key was refused, every model is out of its free
     * daily quota, they are busy, or something else (a model that no longer exists, a timeout, unusable output).
     */
    private function whyUnavailable(string $model): string
    {
        if (Cache::get('gemini-cooldown:key')) {
            return 'key';
        }
        $kinds = collect(array_unique([$model, ...(array) config('services.gemini.fallback_models', [])]))
            ->map(fn ($m) => Cache::get("gemini-cooldown:{$m}"))->filter()->unique()->values();

        return match (true) {
            $kinds->contains('busy') && $kinds->contains('quota') => 'mixed',
            $kinds->contains('busy') => 'busy',
            $kinds->contains('quota') => 'quota',
            default => 'unknown',
        };
    }

    /** When the free tier's daily quota resets: midnight Pacific time, shown in Manila time. */
    private function quotaResetAt(): string
    {
        return Carbon::now('America/Los_Angeles')->addDay()->startOfDay()->setTimezone(LocalTime::timezone())->toISOString();
    }

    /**
     * Remembers why a model just refused, for as long as that lasts. The free tier's DAILY quota resets at midnight
     * Pacific time (3 PM in Manila), a per-minute limit clears in about a minute, a busy model in minutes, and a
     * retired or unsupported one (404 / 400) not until somebody changes the configuration.
     */
    private function coolDown(string $model, int $status, string $body): void
    {
        [$kind, $until] = match (true) {
            $status === 429 && str_contains($body, 'PerDay') => ['quota', Carbon::now('America/Los_Angeles')->addDay()->startOfDay()],
            $status === 429 => ['quota', now()->addMinute()],
            $status === 404 || $status === 400 => ['gone', now()->addDay()],
            default => ['busy', now()->addMinutes(self::AI_BUSY_MINUTES)],
        };
        Cache::put("gemini-cooldown:{$model}", $kind, $until);
    }

    private function systemPrompt(): string
    {
        return <<<'PROMPT'
You are the AI workforce advisor inside a Workforce Management System used by an e-commerce company in the Philippines. You receive a JSON snapshot: "facts" (computed from the company database) and "findings" (what the system's rules detected, each with a "ref"), plus the Workforce Health Score.

Explain the findings to the Workforce Admin and recommend what to do. Respond with ONLY a JSON object:
{
  "summary": "1-2 sentences on overall workforce health",
  "insights": [
    { "ref": "the finding's ref", "title": "short headline", "message": "what the numbers mean", "recommendation": "one concrete next step" }
  ]
}

Rules:
- Write exactly one insight per finding, using its ref. Do not add, merge or drop findings, and do not change their severity.
- Use only numbers, names and dates that appear in the snapshot, written the same way (e.g. 87.6%, not 88%). Never estimate, round or calculate new figures.
- title: at most 8 words. message: 1-2 sentences. recommendation: one action the admin can take in this system (review the Attendance page, decide a request in the Decision Queue, talk to the employee, adjust the schedule).
- A "face_mismatch" security event means someone ELSE tried to clock in as the named employee ("attempted_as") and the face did not match: the named employee is the one being impersonated, not the suspect. "pin_failed" is a wrong kiosk unlock PIN.
- Findings with severity "success" are good news: keep them short and do not invent problems.
- summary: consistent with health_score (90+ healthy, 75-89 minor issues, 50-74 needs attention, below 50 critical); mention the most urgent item, if any.
- Plain professional English, no markdown.
PROMPT;
    }

    /**
     * Keeps only what can be trusted: an insight must name one of the findings, and a title, message, recommendation
     * or summary that states a number not found in the data behind it is dropped (the rule's own text stays).
     */
    private function checkedBriefing(array $decoded, array $items, array $facts, int $score): ?array
    {
        $byId = array_column($items, null, 'id');
        $common = array_merge(
            [(string) self::WINDOW_DAYS, (string) self::LATE_THRESHOLD, (string) self::ABSENT_THRESHOLD,
                (string) self::LOW_ATTENDANCE_RATE, (string) self::LOW_PUNCTUALITY, (string) self::HIGH_AVG_OVERTIME, (string) $score],
            $this->numbersIn($facts['today'].' '.Carbon::parse($facts['today'])->format('M j Y')),
        );

        $out = ['summary' => null, 'insights' => []];
        $everything = array_merge($common, $this->numbersIn(json_encode([$facts, $items])));
        if ($this->trustworthy($decoded['summary'] ?? null, $everything, 400)) {
            $out['summary'] = trim($decoded['summary']);
        }

        foreach ((array) ($decoded['insights'] ?? []) as $raw) {
            $ref = is_array($raw) ? ($raw['ref'] ?? null) : null;
            if (! is_string($ref) || ! isset($byId[$ref]) || isset($out['insights'][$ref])) {
                continue;
            }
            $allowed = array_merge($common, $this->numbersIn(json_encode($byId[$ref])));
            foreach (['title' => 80, 'message' => 400, 'recommendation' => 300] as $field => $max) {
                if ($this->trustworthy($raw[$field] ?? null, $allowed, $max)) {
                    $out['insights'][$ref][$field] = trim($raw[$field]);
                }
            }
        }

        return $out['summary'] === null && $out['insights'] === [] ? null : $out;
    }

    private function trustworthy(mixed $text, array $allowed, int $max): bool
    {
        if (! is_string($text) || trim($text) === '' || mb_strlen($text) > $max) {
            return false;
        }

        return array_diff($this->numbersIn($text), $allowed) === [];
    }

    /** @return list<string> every number in the text, normalised ("87.60" and "87.6" are the same, "09" is "9") */
    private function numbersIn(string $text): array
    {
        preg_match_all('/\d+(?:\.\d+)?/', str_replace(',', '', $text), $m);

        return array_values(array_unique(array_map(fn ($n) => (string) (float) $n, $m[0])));
    }
}
