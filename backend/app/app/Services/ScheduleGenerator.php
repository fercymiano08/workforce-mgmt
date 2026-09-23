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
 * Generates schedules in two separate steps, so nothing is created until someone (or the automatic job)
 * decides to:
 *
 *   plan()    works out what WOULD be created, and everything that is skipped and why - writes nothing
 *   commit()  creates it, records the run as a batch (so it can be undone), notifies, audits
 *
 * Who works which days: an employee's own work pattern, else their department's, else the usual days
 * (Mon-Fri unless changed). Nobody is scheduled on a holiday, on approved leave, or twice on one day.
 * Coverage rules (a minimum number of scheduled people per department) only produce warnings.
 */
class ScheduleGenerator
{
    public const TZ = 'Asia/Manila';

    // A day where more than this share of the people being scheduled are on approved leave is a staffing risk.
    public const LEAVE_SHORTAGE_THRESHOLD = 0.2;

    /**
     * @param  list<string>|null  $employeeIds  null = everyone active
     * @param  bool  $followPatterns  false = every day of the week (the old "include weekends")
     * @return array<string, mixed>
     */
    public function plan(string $startDate, string $endDate, string $shiftId, ?array $employeeIds = null, bool $followPatterns = true): array
    {
        $employees = filled($employeeIds)
            ? Employee::whereIn('id', $employeeIds)->get()
            : Employee::where('status', '!=', 'Inactive')->get();

        $start = Carbon::parse($startDate)->startOfDay();
        $end = Carbon::parse($endDate)->startOfDay();

        $plan = [
            'startDate' => $start->toDateString(), 'endDate' => $end->toDateString(), 'shiftId' => $shiftId,
            'employees' => $employees->count(), 'rows' => [], 'perDay' => [],
            'skippedExisting' => 0, 'skippedOnLeave' => 0, 'skippedHoliday' => 0, 'skippedOffDay' => 0,
            'holidays' => [], 'shortageDates' => [], 'coverageShortages' => [],
        ];
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
        $daysFor = fn (Employee $e): array => ! $followPatterns
            ? [1, 2, 3, 4, 5, 6, 7]
            : ($empPatterns[$e->id] ?? $deptPatterns[$e->department] ?? $usual);

        $rules = CoverageRule::pluck('min_staff', 'department');
        $planned = [];   // date => department => count of new + existing shifts

        // People already scheduled in a department count towards its coverage, selected or not.
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
            $onLeaveToday = 0;
            foreach ($employees as $employee) {
                if (! in_array($iso, $daysFor($employee), true)) {
                    $plan['skippedOffDay']++;
                    continue;
                }
                $working++;

                $onLeave = $leaves->contains(fn ($l) => $l->employee_id === $employee->id
                    && $l->start_date->toDateString() <= $dateKey && $l->end_date->toDateString() >= $dateKey);
                if ($onLeave) {
                    $onLeaveToday++;
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
                if (($onLeaveToday / $employees->count()) > self::LEAVE_SHORTAGE_THRESHOLD) {
                    $plan['shortageDates'][] = ['date' => $dateKey, 'onLeave' => $onLeaveToday, 'of' => $employees->count()];
                }
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
     * Create what plan() worked out.
     *
     * @param  array<string, mixed>  $plan
     * @return array<string, mixed>
     */
    public function commit(array $plan, string $source, string $actor): array
    {
        $max = (int) ShiftSchedule::where('id', 'like', 'SCH%')->get(['id'])->map(fn ($r) => (int) substr($r->id, 3))->max();
        $createdIds = [];
        $perEmployee = [];
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

        $batchId = null;
        if ($createdIds !== []) {
            $bmax = (int) ScheduleBatch::where('id', 'like', 'BAT%')->get(['id'])->map(fn ($r) => (int) substr($r->id, 3))->max();
            $batchId = 'BAT'.str_pad((string) ($bmax + 1), 3, '0', STR_PAD_LEFT);
            ScheduleBatch::create([
                'id' => $batchId, 'source' => $source, 'created_by' => $actor, 'start_date' => $plan['startDate'], 'end_date' => $plan['endDate'],
                'shift_id' => $plan['shiftId'], 'created_count' => count($createdIds), 'summary' => $summary, 'status' => 'Published',
            ]);
            foreach ($createdIds as $id) {
                ScheduleBatchItem::create(['batch_id' => $batchId, 'schedule_id' => $id]);
            }
        }
        $summary['batchId'] = $batchId;

        $from = Carbon::parse($plan['startDate']);
        $to = Carbon::parse($plan['endDate']);
        foreach ($perEmployee as $employeeId => $count) {
            NotificationService::notifyEmployee(
                $employeeId, 'shift_assigned', 'Schedule Generated',
                "You've been scheduled {$from->format('M d')} – {$to->format('M d, Y')} ({$count} shift".($count === 1 ? '' : 's').').',
                'low', '/my-schedule'
            );
        }

        foreach ($plan['shortageDates'] as $short) {
            $dateKey = $short['date'];
            $already = \App\Models\Notification::where('type', 'staff_shortage')->whereDate('timestamp', now())->where('message', 'like', "%{$dateKey}%")->exists();
            if (! $already) {
                NotificationService::notifyAdmins(
                    'staff_shortage', 'Possible Staffing Shortage',
                    "{$short['onLeave']} of {$short['of']} employees are on approved leave on ".Carbon::parse($dateKey)->format('M d, Y').'.',
                    'high', '/shifts'
                );
            }
        }
        if ($plan['coverageShortages'] !== []) {
            $days = count(array_unique(array_column($plan['coverageShortages'], 'date')));
            NotificationService::notifyAdmins(
                'staff_shortage', 'Below Minimum Coverage',
                "The schedule for {$from->format('M d')} – {$to->format('M d, Y')} leaves {$days} day(s) with a department below its minimum staff. Review it on the Shifts page.",
                'high', '/shifts'
            );
        }


        AuditLogger::record('scheduling', 
            'schedule.generated', 'ScheduleBatch', $batchId ?? 'none', actor: $actor,
            after: ['source' => $source, 'startDate' => $plan['startDate'], 'endDate' => $plan['endDate'], 'created' => count($createdIds)],
            meta: ['batchId' => $batchId],
        );

        return $summary;
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
            'shortageDates' => array_values(array_unique(array_column($plan['shortageDates'], 'date'))),
            'coverageShortages' => $plan['coverageShortages'],
            'perDay' => $plan['perDay'],
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
