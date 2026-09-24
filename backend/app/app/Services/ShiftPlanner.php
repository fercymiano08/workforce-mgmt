<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\ScheduleSetting;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use App\Support\LocalTime;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Automated shift scheduling: rules build a draft, a person approves it. No AI, nothing runs by itself.
 *
 *   1. HR sets a period (start date + 1-4 weeks) and a requirement (how many employees per day, optionally a
 *      department and a position). The shift is always the company's Standard Shift - the only shift there is.
 *   2. plan() builds the draft - writes nothing. For each working day it
 *        a. builds the ELIGIBLE POOL: active, matches the department / position, not on approved leave that day,
 *           not already scheduled that day, and would not go over the weekly hours limit;
 *        b. ranks the pool by FAIRNESS: fewest shifts given so far in this draft first (then fewest hours already
 *           that week, then employee id, so the same input always gives the same draft);
 *        c. assigns the top N (N = employees required) and counts them, so nobody is double-booked.
 *   3. HR reviews the table, may change any cell, then approves: commit() saves the shifts, tells each employee
 *      and records the approval in the audit log.
 *
 * Working days are the company's usual work days (Mon-Sat unless HR changes them) minus holidays.
 */
class ShiftPlanner
{
    public const MAX_WEEKS = 4;

    // The one shift the company works (8:00 AM - 5:00 PM). Overtime extends it; it is never a shift of its own.
    public const STANDARD_SHIFT_ID = 'SHIFT004';

    /**
     * Fills in and checks a request: the usual work days and weekly limit when none are given, and the period.
     *
     * @param  array<string, mixed>  $req  startDate, weeks, required, department?, position?, workDays?, maxWeeklyHours?
     * @return array<string, mixed>
     */
    public function normalize(array $req): array
    {
        $setting = ScheduleSetting::current();
        $start = Carbon::parse($req['startDate'])->startOfDay();
        $weeks = max(1, min(self::MAX_WEEKS, (int) $req['weeks']));

        return [
            'startDate' => $start->toDateString(),
            'endDate' => $start->copy()->addDays($weeks * 7 - 1)->toDateString(),
            'weeks' => $weeks,
            'shift' => $this->standardShift(),
            'required' => max(1, (int) $req['required']),
            'department' => ($req['department'] ?? null) ?: null,
            'position' => ($req['position'] ?? null) ?: null,
            'workDays' => array_values(array_unique(array_map('intval', $req['workDays'] ?? $setting->usualDays()))),
            'maxWeeklyHours' => (float) ($req['maxWeeklyHours'] ?? $setting->weeklyHoursLimit()),
        ];
    }

    /**
     * The Standard Shift, the only shift automated scheduling ever uses.
     *
     * @return array{id: string, name: string, startTime: string, endTime: string}
     */
    public function standardShift(): array
    {
        $shift = ShiftDefinition::find(self::STANDARD_SHIFT_ID) ?? ShiftDefinition::orderBy('id')->first();
        if (! $shift) {
            throw ValidationException::withMessages(['shift' => ['The Standard Shift is missing, so nothing can be scheduled.']]);
        }

        return ['id' => $shift->id, 'name' => $shift->name, 'startTime' => substr((string) $shift->start_time, 0, 5), 'endTime' => substr((string) $shift->end_time, 0, 5)];
    }

    /** Paid hours of a shift: its length minus the unpaid lunch the company's break policy takes off. */
    public function paidHours(string $start, string $end): float
    {
        $minutes = max(0, Carbon::parse($end)->diffInMinutes(Carbon::parse($start), true));
        $minutes -= app(BreakPolicy::class)->deductionFor((int) $minutes);

        return round(max(0, $minutes) / 60, 2);
    }

    /**
     * The draft. Writes nothing.
     *
     * @param  array<string, mixed>  $req  normalized by normalize()
     * @return array<string, mixed>
     */
    public function plan(array $req): array
    {
        $hours = $this->paidHours($req['shift']['startTime'], $req['shift']['endTime']);

        $pool = Employee::where('status', '!=', 'Inactive')
            ->when($req['department'], fn ($q, $d) => $q->where('department', $d))
            ->when($req['position'], fn ($q, $p) => $q->where('position', $p))
            ->orderBy('id')->get();
        $ids = $pool->pluck('id')->all();

        $holidays = Holiday::whereBetween('date', [$req['startDate'], $req['endDate']])->get()
            ->mapWithKeys(fn ($h) => [$h->date->toDateString() => $h->name]);
        $leaves = Leave::whereIn('employee_id', $ids)->where('status', 'Approved')
            ->where('start_date', '<=', $req['endDate'])->where('end_date', '>=', $req['startDate'])
            ->get(['employee_id', 'start_date', 'end_date']);
        $onLeave = fn (string $employeeId, string $date): bool => $leaves->contains(fn ($l) => $l->employee_id === $employeeId
            && $l->start_date->toDateString() <= $date && $l->end_date->toDateString() >= $date);

        // Shifts these people already have in the period's weeks (whole Monday-Sunday weeks, for the hours limit)
        $definitions = ShiftDefinition::all()->keyBy('id');
        $weekFrom = Carbon::parse($req['startDate'])->startOfWeek(Carbon::MONDAY)->toDateString();
        $weekTo = Carbon::parse($req['endDate'])->endOfWeek(Carbon::SUNDAY)->toDateString();
        $existing = [];           // "employee|date" => shift name
        $weekHours = [];          // employee => week's Monday => paid hours already scheduled
        foreach (ShiftSchedule::whereIn('employee_id', $ids)->whereBetween('date', [$weekFrom, $weekTo])->get() as $s) {
            $date = $s->date->toDateString();
            $def = $definitions[$s->shift_id] ?? null;
            $existing[$s->employee_id.'|'.$date] = $def?->name ?? $s->shift_id;
            $monday = Carbon::parse($date)->startOfWeek(Carbon::MONDAY)->toDateString();
            $weekHours[$s->employee_id][$monday] = ($weekHours[$s->employee_id][$monday] ?? 0)
                + ($def ? $this->paidHours($def->start_time, $def->end_time) : 0);
        }

        $days = [];
        $cells = array_fill_keys($ids, []);
        $given = array_fill_keys($ids, 0);            // shifts given so far in THIS draft: the fairness measure
        $shortfalls = [];
        $total = 0;

        for ($day = Carbon::parse($req['startDate']); $day->toDateString() <= $req['endDate']; $day->addDay()) {
            $date = $day->toDateString();
            if (! in_array($day->isoWeekday(), $req['workDays'], true)) {
                continue;   // not a work day: no column
            }
            $days[] = ['date' => $date, 'weekday' => $day->isoWeekday(), 'weekStart' => $day->copy()->startOfWeek(Carbon::MONDAY)->toDateString(), 'holiday' => $holidays[$date] ?? null];
            if ($holidays->has($date)) {
                continue;   // nobody works a holiday
            }
            $monday = $day->copy()->startOfWeek(Carbon::MONDAY)->toDateString();

            $eligible = [];
            foreach ($pool as $e) {
                if (isset($existing[$e->id.'|'.$date])) {
                    $cells[$e->id][$date] = ['state' => 'existing', 'label' => $existing[$e->id.'|'.$date]];
                } elseif ($onLeave($e->id, $date)) {
                    $cells[$e->id][$date] = ['state' => 'leave'];
                } elseif (($weekHours[$e->id][$monday] ?? 0) + $hours <= $req['maxWeeklyHours'] + 1e-9) {
                    $eligible[] = $e;
                } else {
                    $cells[$e->id][$date] = ['state' => 'limit'];   // another shift would go over the weekly hours limit
                }
            }

            // Fairness: fewest shifts so far in this draft, then fewest hours already that week, then id
            usort($eligible, fn ($a, $b) => [$given[$a->id], $weekHours[$a->id][$monday] ?? 0, $a->id] <=> [$given[$b->id], $weekHours[$b->id][$monday] ?? 0, $b->id]);

            $taken = array_slice($eligible, 0, $req['required']);
            foreach ($taken as $e) {
                $cells[$e->id][$date] = ['state' => 'assigned'];
                $given[$e->id]++;
                $weekHours[$e->id][$monday] = ($weekHours[$e->id][$monday] ?? 0) + $hours;
                $total++;
            }
            if (count($taken) < $req['required']) {
                $shortfalls[] = ['date' => $date, 'needed' => $req['required'], 'assigned' => count($taken)];
            }
        }

        // Why people were NOT scheduled on some days - so the review can explain the draft, not just show it
        $name = fn (Employee $e) => trim($e->first_name.' '.$e->last_name);
        $listBy = function (string $state) use ($pool, $cells, $name): array {
            $out = [];
            foreach ($pool as $e) {
                $dates = array_keys(array_filter($cells[$e->id], fn ($c) => $c['state'] === $state));
                if ($dates !== []) {
                    $out[] = ['id' => $e->id, 'name' => $name($e), 'dates' => $dates];
                }
            }
            usort($out, fn ($a, $b) => strcmp($a['name'], $b['name']));

            return $out;
        };
        $counts = array_values($given);

        return [
            'startDate' => $req['startDate'],
            'endDate' => $req['endDate'],
            'weeks' => $req['weeks'],
            'shift' => $req['shift'] + ['hours' => $hours],
            'notes' => [
                'onLeave' => $listBy('leave'),
                'hoursLimited' => $listBy('limit'),
                'alreadyScheduled' => $listBy('existing'),
                'holidays' => $holidays->map(fn ($n, $d) => ['date' => $d, 'name' => $n])->values()->all(),
                'shiftsPerEmployee' => ['min' => $counts ? min($counts) : 0, 'max' => $counts ? max($counts) : 0],
            ],
            'required' => $req['required'],
            'department' => $req['department'],
            'position' => $req['position'],
            'maxWeeklyHours' => $req['maxWeeklyHours'],
            'days' => $days,
            'eligibleEmployees' => $pool->count(),
            'totalAssignments' => $total,
            'shortfalls' => $shortfalls,
            'employees' => $pool->sortBy(fn ($e) => strtolower($e->first_name.' '.$e->last_name))->map(fn ($e) => [
                'id' => $e->id,
                'name' => trim($e->first_name.' '.$e->last_name),
                'department' => $e->department,
                'position' => $e->position,
                'cells' => (object) $cells[$e->id],
            ])->values()->all(),
        ];
    }

    /**
     * Saves what HR approved. Each assignment is checked again (people and leave change while a draft is on screen):
     * one that is no longer valid is skipped and reported, the rest are saved.
     *
     * @param  array<string, mixed>  $req  normalized by normalize()
     * @param  list<array{employeeId: string, date: string}>  $assignments
     * @return array{created: int, skipped: list<array{employeeId: string, date: string, reason: string}>, shiftId: string, startDate: string, endDate: string}
     */
    public function commit(array $req, array $assignments, string $actor): array
    {
        $days = $this->workingDays($req);
        $employees = Employee::whereIn('id', array_column($assignments, 'employeeId'))->get()->keyBy('id');

        $skipped = [];
        $valid = [];
        $seen = [];
        foreach ($assignments as $a) {
            $key = $a['employeeId'].'|'.$a['date'];
            $employee = $employees[$a['employeeId']] ?? null;
            $reason = match (true) {
                isset($seen[$key]) => 'listed twice',
                ! in_array($a['date'], $days, true) => 'not a working day of this period',
                ! $employee || $employee->status === 'Inactive' => 'no longer an active employee',
                $this->onLeave($a['employeeId'], $a['date']) => 'on approved leave that day',
                ShiftSchedule::where('employee_id', $a['employeeId'])->whereDate('date', $a['date'])->exists() => 'already has a shift that day',
                default => null,
            };
            $seen[$key] = true;
            $reason === null ? $valid[] = $a : $skipped[] = $a + ['reason' => $reason];
        }

        $shift = ShiftDefinition::findOrFail($req['shift']['id']);
        $perEmployee = [];
        $created = 0;

        DB::transaction(function () use ($valid, $employees, $shift, &$perEmployee, &$created, &$skipped): void {
            $max = (int) ShiftSchedule::where('id', 'like', 'SCH%')->get(['id'])->map(fn ($r) => (int) substr($r->id, 3))->max();
            foreach ($valid as $a) {
                $employee = $employees[$a['employeeId']];
                try {
                    ShiftSchedule::create([
                        'id' => 'SCH'.str_pad((string) ++$max, 3, '0', STR_PAD_LEFT),
                        'employee_id' => $employee->id, 'employee_name' => trim($employee->first_name.' '.$employee->last_name),
                        'shift_id' => $shift->id, 'date' => $a['date'], 'status' => 'Scheduled',
                    ]);
                } catch (UniqueConstraintViolationException) {
                    $skipped[] = $a + ['reason' => 'already has a shift that day'];   // scheduled a moment ago by someone else

                    continue;
                }
                $created++;
                $perEmployee[$employee->id] = ($perEmployee[$employee->id] ?? 0) + 1;
            }
        });

        $range = Carbon::parse($req['startDate'])->format('M d').' – '.Carbon::parse($req['endDate'])->format('M d, Y');
        foreach ($perEmployee as $employeeId => $count) {
            NotificationService::notifyEmployee(
                $employeeId, 'shift_assigned', 'Schedule Published',
                "You've been scheduled {$range} ({$count} shift".($count === 1 ? '' : 's').", {$shift->name} ".$this->clock($shift->start_time).' – '.$this->clock($shift->end_time).').',
                'low', '/my-schedule'
            );
        }

        AuditLogger::record('scheduling', 'schedule.automated_approved', 'ShiftDefinition', $shift->id, actor: $actor,
            after: ['startDate' => $req['startDate'], 'endDate' => $req['endDate'], 'created' => $created, 'skipped' => count($skipped)],
            meta: ['shift' => $shift->name, 'required' => $req['required'], 'department' => $req['department'], 'position' => $req['position']]);

        return ['created' => $created, 'skipped' => $skipped, 'shiftId' => $shift->id, 'startDate' => $req['startDate'], 'endDate' => $req['endDate']];
    }

    /** The working days of a period: the chosen weekdays, minus holidays. @return list<string> */
    public function workingDays(array $req): array
    {
        $holidays = Holiday::whereBetween('date', [$req['startDate'], $req['endDate']])->get()->map(fn ($h) => $h->date->toDateString())->all();
        $days = [];
        for ($day = Carbon::parse($req['startDate']); $day->toDateString() <= $req['endDate']; $day->addDay()) {
            if (in_array($day->isoWeekday(), $req['workDays'], true) && ! in_array($day->toDateString(), $holidays, true)) {
                $days[] = $day->toDateString();
            }
        }

        return $days;
    }

    private function onLeave(string $employeeId, string $date): bool
    {
        return Leave::where('employee_id', $employeeId)->where('status', 'Approved')
            ->whereDate('start_date', '<=', $date)->whereDate('end_date', '>=', $date)->exists();
    }

    private function clock(string $time): string
    {
        return Carbon::parse($time)->format('g:i A');
    }

    /** Tomorrow on the company's clock: the earliest a draft can start (today's shifts are added by hand). */
    public static function earliestStart(): string
    {
        return LocalTime::today()->addDay()->toDateString();
    }
}
