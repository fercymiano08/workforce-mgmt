<?php

namespace App\Services;

use App\Models\CoverageRule;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\ScheduleBatch;
use App\Models\ScheduleBatchItem;
use App\Models\ScheduleSetting;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use App\Models\WorkPattern;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;

/**
 * Automated shift scheduling - ONE feature, one flow:
 *
 *   Rules    who works which days (work patterns), holidays, approved leave, minimum coverage
 *   Window   a calendar period to keep scheduled: this week, this week + next, this month, or next month
 *   Plan     what WOULD be created in each week of the window, and what is skipped and why (writes nothing)
 *   Publish  create it, one history entry per week (each can be undone), notify, audit
 *
 * run() does all of it. "Run now" calls it for the whole window; the automatic switch makes the hourly job
 * call the very same run() for the days no run has covered yet. Days that have started are never filled.
 * Nobody is scheduled on a holiday, on approved leave, or twice on one day. Coverage rules only warn.
 */
class ScheduleGenerator
{
    public const TZ = 'Asia/Manila';

    /** The periods the schedule can be kept filled for - calendar periods, counted from today. */
    public const WINDOWS = [
        'week' => '1 week',           // this week, Monday to Sunday
        'two_weeks' => '2 weeks',     // this week and next week
        'month' => '1 month',         // this calendar month
        'next_month' => 'Next month', // the whole of next calendar month
    ];

    /**
     * The saved window as dates. Days before firstOpenDay() are part of the period but are never filled: a
     * shift for a day that has already started (or passed) would only turn into a false absence.
     *
     * @return array{mode: string, from: string, to: string}
     */
    public function window(?string $mode = null): array
    {
        $mode ??= $this->windowMode();
        $today = Carbon::now(self::TZ)->startOfDay();
        $monday = $today->copy()->startOfWeek(Carbon::MONDAY);

        [$from, $to] = match ($mode) {
            'two_weeks' => [$monday, $monday->copy()->addDays(13)],
            'month' => [$today->copy()->startOfMonth(), $today->copy()->endOfMonth()],
            'next_month' => [$today->copy()->addMonthNoOverflow()->startOfMonth(), $today->copy()->addMonthNoOverflow()->endOfMonth()],
            default => [$monday, $monday->copy()->addDays(6)],
        };

        return ['mode' => $mode, 'from' => $from->toDateString(), 'to' => $to->toDateString()];
    }

    public function windowMode(): string
    {
        $mode = (string) ScheduleSetting::current()->window;

        return array_key_exists($mode, self::WINDOWS) ? $mode : 'week';
    }

    /**
     * The first day that can still get a shift: today until today's shift starts (so a new week or month is
     * scheduled on its very first day by the run just after midnight), tomorrow once it has started.
     */
    public function firstOpenDay(): string
    {
        $now = Carbon::now(self::TZ);
        $start = ShiftDefinition::find($this->defaultShiftId())?->start_time;
        $startsAt = $start ? Carbon::parse($now->toDateString().' '.$start, self::TZ) : $now->copy()->startOfDay();

        return ($now->lt($startsAt) ? $now->copy() : $now->copy()->addDay())->toDateString();
    }

    /**
     * Monday-to-Sunday pieces of a date range (the first and last may be partial). Runs and History work per
     * piece, so every entry can be undone on its own.
     *
     * @return list<array{weekStart: string, from: string, to: string}>
     */
    public function weeksBetween(string $from, string $to): array
    {
        $pieces = [];
        for ($day = Carbon::parse($from); $day->toDateString() <= $to; $day = $day->copy()->startOfWeek(Carbon::MONDAY)->addWeek()) {
            $monday = $day->copy()->startOfWeek(Carbon::MONDAY);
            $pieces[] = ['weekStart' => $monday->toDateString(), 'from' => $day->toDateString(), 'to' => min($monday->copy()->addDays(6)->toDateString(), $to)];
        }

        return $pieces;
    }

    /**
     * For each day in a range: has a run covered it, was that run undone, and when was it last scheduled for
     * everyone. A day is "done" once any run covered it - even with nothing to add, or later undone - so the
     * automatic switch never repeats a day. ("restored" entries only put specific people back, so they do
     * not decide whether a day was undone or when everyone was last scheduled.)
     *
     * @return array<string, array{covered: bool, undone: bool, scheduledAt: ?string}>
     */
    public function coverage(string $from, string $to): array
    {
        $batches = ScheduleBatch::where('start_date', '<=', $to)->where('end_date', '>=', $from)
            ->orderBy('created_at')->orderBy('id')->get(['source', 'status', 'start_date', 'end_date', 'created_at']);

        $days = [];
        for ($day = Carbon::parse($from); $day->toDateString() <= $to; $day->addDay()) {
            $d = $day->toDateString();
            $covering = $batches->filter(fn ($b) => $b->start_date->toDateString() <= $d && $b->end_date->toDateString() >= $d);
            $full = $covering->where('source', '!=', 'restored');
            $days[$d] = [
                'covered' => $covering->isNotEmpty(),
                'undone' => $full->last()?->status === 'Undone',
                'scheduledAt' => $full->max('created_at')?->toDateTimeString(),
            ];
        }

        return $days;
    }

    /**
     * Where each week of the window stands, for the screen: past, scheduled, partly scheduled, undone, or not
     * scheduled yet - and how many shifts it holds.
     *
     * @return list<array<string, mixed>>
     */
    public function windowStatus(): array
    {
        $window = $this->window();
        $open = $this->firstOpenDay();

        return array_map(function ($piece) use ($open) {
            $shifts = ShiftSchedule::whereBetween('date', [$piece['from'], $piece['to']])->count();
            if ($piece['to'] < $open) {
                return $piece + ['status' => 'past', 'openFrom' => null, 'shifts' => $shifts];
            }
            $openFrom = max($piece['from'], $open);
            $days = collect($this->coverage($openFrom, $piece['to']));
            $status = $days->every(fn ($d) => $d['covered'])
                ? ($days->contains(fn ($d) => $d['undone']) ? 'undone' : 'scheduled')
                : ($days->contains(fn ($d) => $d['covered']) ? 'partly' : 'not_scheduled');

            return $piece + ['status' => $status, 'openFrom' => $openFrom, 'shifts' => $shifts];
        }, $this->weeksBetween($window['from'], $window['to']));
    }

    /**
     * The single entry point. Run now fills every open day of the window (skipping what already exists). The
     * automatic job ($onlyNewDays) fills only days no run has covered yet, so it never repeats a day, refills
     * shifts an admin deleted, or redoes an undone week. The one exception is people hired after their days
     * were scheduled: they are added, so a new employee does not wait for the next period.
     *
     * @return array{preview: bool, window: array<string, string>, weeks: list<array<string, mixed>>, totals: array<string, int>}
     */
    public function run(bool $preview, string $source, string $actor, bool $onlyNewDays = false): array
    {
        $shiftId = $this->defaultShiftId();
        $window = $this->window();
        $start = max($window['from'], $this->firstOpenDay());

        $jobs = [];   // [from, to, only these employees (null = everyone)]
        if ($start <= $window['to']) {
            foreach ($this->weeksBetween($start, $window['to']) as $piece) {
                if (! $onlyNewDays) {
                    $jobs[] = [$piece['from'], $piece['to'], null];
                    continue;
                }
                $days = $this->coverage($piece['from'], $piece['to']);
                foreach ($this->runsOf($days, fn ($d) => ! $d['covered']) as [$a, $b]) {
                    $jobs[] = [$a, $b, null];
                }
                foreach ($this->runsOf($days, fn ($d) => $d['covered'] && ! $d['undone']) as [$a, $b]) {
                    $since = collect($days)->filter(fn ($d, $k) => $k >= $a && $k <= $b)->max('scheduledAt');
                    $newcomers = $since ? Employee::where('status', '!=', 'Inactive')->where('created_at', '>', $since)->pluck('id')->all() : [];
                    if ($newcomers !== []) {
                        $jobs[] = [$a, $b, $newcomers];
                    }
                }
            }
        }

        $results = [];
        $perEmployee = [];
        foreach ($jobs as [$from, $to, $onlyEmployees]) {
            $plan = $shiftId ? $this->plan($from, $to, $shiftId, $onlyEmployees) : $this->emptyPlan($from, $to, '');
            if ($onlyEmployees !== null && $plan['rows'] === []) {
                continue;   // a newcomer who is off or already scheduled: nothing to record
            }
            $summary = $preview || ! $shiftId ? $this->summary($plan) : $this->commit($plan, $source, $actor, $perEmployee);
            $results[] = ['weekStart' => Carbon::parse($from)->startOfWeek(Carbon::MONDAY)->toDateString(), 'newcomersOnly' => $onlyEmployees !== null] + $summary;
        }

        if (! $preview && $results !== []) {
            $this->notifyAfterRun($results, $perEmployee);
        }

        $totals = ['weeks' => count($results)];
        foreach (['created', 'skippedExisting', 'skippedOnLeave', 'skippedHoliday', 'skippedOffDay'] as $key) {
            $totals[$key] = array_sum(array_column($results, $key));
        }
        $totals['coverageShortages'] = array_sum(array_map(fn ($r) => count($r['coverageShortages']), $results));

        return ['preview' => $preview, 'shiftId' => $shiftId, 'window' => $window, 'weeks' => $results, 'totals' => $totals];
    }

    /**
     * The reverse of ScheduleCleanup: when a reason to be off goes away (a leave is cancelled, an employee is
     * reactivated, a holiday is deleted), put people back on days that were ALREADY scheduled and still stand
     * (never into an undone week - the admin meant it to stay empty). Days not scheduled yet are handled by
     * the next run anyway. It is a normal plan, so work days, other leave, holidays and existing shifts are
     * still respected. Recorded in History as "Restored".
     *
     * @param  list<string>|null  $employeeIds  null = everyone
     * @return int shifts created
     */
    public function refill(?array $employeeIds, string $from, string $to, string $because): int
    {
        $shiftId = $this->defaultShiftId();
        $lastScheduled = ScheduleBatch::max('end_date');
        if (! $shiftId || ! $lastScheduled) {
            return 0;
        }
        $from = max($from, $this->firstOpenDay());
        $to = min($to, Carbon::parse($lastScheduled)->toDateString());
        if ($from > $to) {
            return 0;
        }

        $created = 0;
        $perEmployee = [];
        foreach ($this->weeksBetween($from, $to) as $piece) {
            foreach ($this->runsOf($this->coverage($piece['from'], $piece['to']), fn ($d) => $d['covered'] && ! $d['undone']) as [$a, $b]) {
                $plan = $this->plan($a, $b, $shiftId, $employeeIds);
                if ($plan['rows'] !== []) {
                    $created += $this->commit($plan, 'restored', 'System', $perEmployee)['created'];
                }
            }
        }

        foreach ($perEmployee as $employeeId => $n) {
            NotificationService::notifyEmployee(
                $employeeId, 'shift_assigned', 'Schedule Updated',
                "{$n} shift".($n === 1 ? ' was' : 's were')." added back to your schedule because {$because}.",
                'low', '/my-schedule'
            );
        }

        return $created;
    }

    /**
     * Consecutive stretches of days that match a condition, as [from, to] pairs.
     *
     * @param  array<string, array<string, mixed>>  $days
     * @return list<array{0: string, 1: string}>
     */
    private function runsOf(array $days, callable $matches): array
    {
        $runs = [];
        $open = null;
        $last = null;
        foreach ($days as $date => $info) {
            if ($matches($info)) {
                $open ??= $date;
                $last = $date;
            } elseif ($open !== null) {
                $runs[] = [$open, $last];
                $open = null;
            }
        }
        if ($open !== null) {
            $runs[] = [$open, $last];
        }

        return $runs;
    }

    /**
     * What WOULD be created between two dates for every active employee (or only the given ones) - writes nothing.
     *
     * @param  list<string>|null  $onlyEmployeeIds
     * @return array<string, mixed>
     */
    public function plan(string $startDate, string $endDate, string $shiftId, ?array $onlyEmployeeIds = null): array
    {
        $employees = Employee::where('status', '!=', 'Inactive')
            ->when($onlyEmployeeIds !== null, fn ($q) => $q->whereIn('id', $onlyEmployeeIds))
            ->get();
        $start = Carbon::parse($startDate)->startOfDay();
        $end = Carbon::parse($endDate)->startOfDay();

        $plan = $this->emptyPlan($start->toDateString(), $end->toDateString(), $shiftId);
        $plan['employees'] = $employees->count();
        if ($employees->isEmpty()) {
            return $plan;
        }

        $ids = $employees->pluck('id');
        $existing = ShiftSchedule::whereIn('employee_id', $ids)
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->get(['employee_id', 'date'])
            ->map(fn ($s) => $s->employee_id.'|'.$s->date->toDateString())
            ->flip();

        $leaves = Leave::whereIn('employee_id', $ids)->where('status', 'Approved')
            ->where('start_date', '<=', $end->toDateString())->where('end_date', '>=', $start->toDateString())
            ->get(['employee_id', 'start_date', 'end_date']);

        $holidays = Holiday::whereBetween('date', [$start->toDateString(), $end->toDateString()])->get()
            ->mapWithKeys(fn ($h) => [$h->date->toDateString() => $h->name]);

        $usual = ScheduleSetting::current()->usualDays();
        $deptPatterns = WorkPattern::where('scope', 'department')->get()->mapWithKeys(fn ($p) => [$p->scope_key => array_map('intval', $p->work_days)]);
        $empPatterns = WorkPattern::where('scope', 'employee')->get()->mapWithKeys(fn ($p) => [$p->scope_key => array_map('intval', $p->work_days)]);
        // Who works which days: their own pattern, else their department's, else everyone's usual days
        $daysFor = fn (Employee $e): array => $empPatterns[$e->id] ?? $deptPatterns[$e->department] ?? $usual;

        $rules = CoverageRule::pluck('min_staff', 'department');
        $planned = [];   // date => department => count of new + existing shifts

        // People already scheduled in a department count towards its coverage.
        $deptOf = Employee::pluck('department', 'id');
        if ($rules->isNotEmpty()) {
            ShiftSchedule::whereBetween('date', [$start->toDateString(), $end->toDateString()])->get(['employee_id', 'date'])
                ->each(function ($s) use (&$planned, $deptOf, $rules): void {
                    $dept = $deptOf[$s->employee_id] ?? null;
                    if ($dept !== null && $rules->has($dept)) {
                        $planned[$s->date->toDateString()][$dept][$s->employee_id] = true;
                    }
                });
        }

        for ($day = $start->copy(); $day->lte($end); $day->addDay()) {
            $dateKey = $day->toDateString();
            $iso = $day->isoWeekday();

            if ($holidays->has($dateKey)) {
                $plan['holidays'][$dateKey] = $holidays[$dateKey];
                $plan['skippedHoliday'] += $employees->filter(fn ($e) => in_array($iso, $daysFor($e), true))->count();
                continue;
            }

            $working = 0;
            foreach ($employees as $employee) {
                if (! in_array($iso, $daysFor($employee), true)) {
                    $plan['skippedOffDay']++;
                    continue;
                }
                $working++;

                $onLeave = $leaves->contains(fn ($l) => $l->employee_id === $employee->id
                    && $l->start_date->toDateString() <= $dateKey && $l->end_date->toDateString() >= $dateKey);
                if ($onLeave) {
                    $plan['skippedOnLeave']++;
                    continue;
                }
                if ($existing->has($employee->id.'|'.$dateKey)) {
                    $plan['skippedExisting']++;
                    continue;
                }

                $plan['rows'][] = ['employee_id' => $employee->id, 'employee_name' => trim($employee->first_name.' '.$employee->last_name), 'date' => $dateKey];
                $plan['perDay'][$dateKey] = ($plan['perDay'][$dateKey] ?? 0) + 1;
                if ($employee->department && $rules->has($employee->department)) {
                    $planned[$dateKey][$employee->department][$employee->id] = true;
                }
            }

            if ($working > 0) {
                foreach ($rules as $department => $min) {
                    $have = count($planned[$dateKey][$department] ?? []);
                    if ($have < (int) $min && $employees->contains(fn ($e) => $e->department === $department && in_array($iso, $daysFor($e), true))) {
                        $plan['coverageShortages'][] = ['date' => $dateKey, 'department' => $department, 'have' => $have, 'need' => (int) $min];
                    }
                }
            }
        }

        return $plan;
    }

    /**
     * Create what plan() worked out, and record it in the history - also when there was nothing new to add,
     * so the week counts as done and the automatic job does not keep coming back to it.
     *
     * @param  array<string, mixed>  $plan
     * @param  array<string, int>  $perEmployee  shifts created per employee, added to (for one notification per person per run)
     * @return array<string, mixed>
     */
    public function commit(array $plan, string $source, string $actor, array &$perEmployee = []): array
    {
        $max = (int) ShiftSchedule::where('id', 'like', 'SCH%')->get(['id'])->map(fn ($r) => (int) substr($r->id, 3))->max();
        $createdIds = [];
        $skippedRace = 0;

        foreach ($plan['rows'] as $row) {
            try {
                $s = ShiftSchedule::create([
                    'id' => 'SCH'.str_pad((string) ++$max, 3, '0', STR_PAD_LEFT),
                    'employee_id' => $row['employee_id'], 'employee_name' => $row['employee_name'],
                    'shift_id' => $plan['shiftId'], 'date' => $row['date'], 'status' => 'Scheduled',
                ]);
            } catch (UniqueConstraintViolationException) {
                $skippedRace++;   // someone scheduled this person for this day a moment ago
                continue;
            }
            $createdIds[] = $s->id;
            $perEmployee[$row['employee_id']] = ($perEmployee[$row['employee_id']] ?? 0) + 1;
        }

        $summary = $this->summary($plan) + ['created' => count($createdIds), 'skippedExisting' => $plan['skippedExisting'] + $skippedRace];

        $bmax = (int) ScheduleBatch::where('id', 'like', 'BAT%')->get(['id'])->map(fn ($r) => (int) substr($r->id, 3))->max();
        $batchId = 'BAT'.str_pad((string) ($bmax + 1), 3, '0', STR_PAD_LEFT);
        ScheduleBatch::create([
            'id' => $batchId, 'source' => $source, 'created_by' => $actor, 'start_date' => $plan['startDate'], 'end_date' => $plan['endDate'],
            'shift_id' => $plan['shiftId'], 'created_count' => count($createdIds), 'summary' => $summary, 'status' => 'Published',
        ]);
        foreach ($createdIds as $id) {
            ScheduleBatchItem::create(['batch_id' => $batchId, 'schedule_id' => $id]);
        }
        $summary['created'] = count($createdIds);
        $summary['batchId'] = $batchId;

        AuditLogger::record('scheduling',
            'schedule.generated', 'ScheduleBatch', $batchId, actor: $actor,
            after: ['source' => $source, 'startDate' => $plan['startDate'], 'endDate' => $plan['endDate'], 'created' => count($createdIds)],
            meta: ['batchId' => $batchId],
        );

        return $summary;
    }

    /** One message per person and one for the admins per run, however many weeks it covered. */
    private function notifyAfterRun(array $results, array $perEmployee): void
    {
        $from = Carbon::parse($results[0]['startDate']);
        $to = Carbon::parse($results[count($results) - 1]['endDate']);
        $range = $from->format('M d').' – '.$to->format('M d, Y');

        foreach ($perEmployee as $employeeId => $count) {
            NotificationService::notifyEmployee(
                $employeeId, 'shift_assigned', 'Schedule Published',
                "You've been scheduled {$range} ({$count} shift".($count === 1 ? '' : 's').').',
                'low', '/my-schedule'
            );
        }

        $shortDays = count(array_unique(array_merge(...array_map(fn ($r) => array_column($r['coverageShortages'], 'date'), $results))));
        if ($shortDays > 0) {
            NotificationService::notifyAdmins(
                'staff_shortage', 'Below Minimum Coverage',
                "The schedule for {$range} leaves {$shortDays} day(s) with a department below its minimum staff. Review it on the Shifts page.",
                'high', '/shifts'
            );
        }
    }

    /** The numbers people read: the same shape for a preview and for a real run. */
    public function summary(array $plan): array
    {
        return [
            'created' => count($plan['rows']),
            'employees' => $plan['employees'],
            'startDate' => $plan['startDate'], 'endDate' => $plan['endDate'],
            'skippedExisting' => $plan['skippedExisting'], 'skippedOnLeave' => $plan['skippedOnLeave'],
            'skippedHoliday' => $plan['skippedHoliday'], 'skippedOffDay' => $plan['skippedOffDay'],
            'holidays' => $plan['holidays'],
            'coverageShortages' => $plan['coverageShortages'],
            'perDay' => $plan['perDay'],
        ];
    }

    private function emptyPlan(string $start, string $end, string $shiftId): array
    {
        return [
            'startDate' => $start, 'endDate' => $end, 'shiftId' => $shiftId, 'employees' => 0, 'rows' => [], 'perDay' => [],
            'skippedExisting' => 0, 'skippedOnLeave' => 0, 'skippedHoliday' => 0, 'skippedOffDay' => 0,
            'holidays' => [], 'coverageShortages' => [],
        ];
    }

    public function defaultShiftId(): ?string
    {
        $configured = ScheduleSetting::current()->shift_id;
        if ($configured && ShiftDefinition::whereKey($configured)->exists()) {
            return $configured;
        }

        return ShiftDefinition::orderBy('id')->value('id');
    }
}
