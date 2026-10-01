<?php

namespace App\Console\Commands;

use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Models\Attendance;
use App\Models\EarlyClockOut;
use App\Models\Employee;
use App\Models\Notification;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\ScheduleSetting;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use App\Models\OvertimeRequest;
use App\Models\Timesheet;
use App\Models\User;
use App\Services\EarlyLeaveEnforcer;
use App\Services\ShiftHours;
use App\Services\SystemSettings;
use App\Services\TimesheetGenerationService;
use App\Services\TimesheetWorkflow;
use App\Services\WorkingDays;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Rebuilds the DEMO employees' recent history so it reads like people who really used the system - and so it
 * is fresh on the day it is shown. Run it the day before a presentation: `php artisan demo:refresh`.
 *
 * The demo employees are the ones shipped in database/mock/employees.json and database/demo/core.json; they
 * cannot use the kiosk, so without this their shifts would slowly turn into automatic absences. Everyone
 * registered through the system (e.g. Fercy Miano) is never touched.
 *
 * Nothing is typed in by hand: it goes through the same rules real data does -
 *   schedules  everyone on the company's usual work days (Mon-Sat), except holidays and approved leave
 *   arrival    Present up to the late-grace minutes after the shift start, Late after (the kiosk's rule)
 *   leaving    a few minutes after the (approved-overtime-extended) end; about one day in 17 ends early,
 *              which becomes an Early Leave day plus the early clock-out record HR is alerted about
 *   hours      ShiftHours::count() - paid time from the shift start, lunch deducted, overtime only if approved
 *   timesheets TimesheetGenerationService, Monday-Sunday weeks, moved through TimesheetWorkflow
 *              (older weeks approved, last week waiting for review, this week still a draft)
 *   leave      a sparse, deterministic scatter of fresh Approved leave requests across the rebuilt
 *              window (roughly one every 3 weeks per person), topped up with a few guaranteed ones
 *              in the last 10 days - without this, Leave Trends and Leave Type Composition on the
 *              Workforce Analytics page only ever showed whatever was in the original one-time seed,
 *              which falls further into the past every day the system is live, and the sparse scatter
 *              alone can legitimately miss "This Week" or the first days of "This Month" by chance
 *   overtime   the same idea for Approved overtime requests (roughly one scheduled day in 12), which
 *              attendance's own hours (above) already reads to decide how late someone worked
 * Arrival times vary per person and day but are the same on every run for the same day (no randomness).
 * Leave and overtime use the same deterministic-per-person-per-stretch approach, and never touch a
 * request that already exists - re-running this never adds a second one over the same days.
 *
 * By default today is left mid-shift: the people are at their desks and have not clocked out yet. Pass
 * --close-today to treat today as a finished workday instead, so today's clock-outs are written too.
 */
class RefreshDemoData extends Command
{
    use GeneratesSequentialIds;

    protected $signature = 'demo:refresh
        {--weeks=4 : full weeks of history before the current one}
        {--close-today : also write today\'s clock-outs, treating today as a finished workday rather than a shift in progress}';

    protected $description = "Rebuild the demo employees' schedules, attendance and timesheets up to today";

    public function handle(TimesheetGenerationService $timesheets, TimesheetWorkflow $workflow, WorkingDays $workingDays): int
    {
        $ids = $this->demoEmployeeIds();
        if ($ids === []) {
            $this->warn('No demo employees in this database.');

            return self::SUCCESS;
        }

        $tz = ShiftHours::timezone();
        $now = Carbon::now($tz);
        $today = $now->toDateString();
        $from = $now->copy()->startOfWeek(Carbon::MONDAY)->subWeeks(max(1, (int) $this->option('weeks')))->toDateString();

        // Say out loud what is about to be overwritten, and how much of it there is. --weeks only
        // controls what gets rebuilt, not what gets replaced: everything up to today goes, so a run
        // meant to add a week silently discards months on the same accounts. Someone reading the
        // output afterwards has no way to know that; someone reading it first can still stop.
        $this->info(sprintf(
            'Rebuilding %d demo employee(s) from %s. This REPLACES their whole attendance, early clock-out, timesheet and schedule history up to %s (not just the %d week(s) being rebuilt). Employees registered through the system are not touched.',
            count($ids),
            $from,
            $today,
            max(1, (int) $this->option('weeks'))
        ));
        $this->line(sprintf(
            '  replacing %d attendance, %d timesheet, %d early clock-out and %d shift rows',
            Attendance::whereIn('employee_id', $ids)->count(),
            Timesheet::whereIn('employee_id', $ids)->count(),
            EarlyClockOut::whereIn('employee_id', $ids)->count(),
            ShiftSchedule::whereIn('employee_id', $ids)->where('date', '<=', $today)->count()
        ));
        // The demo is an office day on the standard shift. Don't take "whichever id sorts
        // first": a fresh seed re-creates Morning/Afternoon/Night before Standard, which
        // would silently move the whole demo onto a different shift than a live database.
        $shift = ShiftDefinition::whereRaw("lower(name) like '%standard%'")
            ->orWhereRaw("lower(name) like '%office%'")
            ->orderBy('id')->first()
            ?? ShiftDefinition::orderBy('id')->first();
        if (! $shift) {
            $this->error('There is no shift to schedule.');

            return self::FAILURE;
        }
        $shiftId = $shift->id;
        $grace = max(0, (int) app(SystemSettings::class)->get('late_grace_minutes', 15));
        $closeToday = (bool) $this->option('close-today');
        $admin = User::where('role', 'Administrator')->value('name') ?: 'Workforce Admin';

        DB::transaction(function () use ($ids, $from, $today, $now, $tz, $shift, $shiftId, $grace, $closeToday, $timesheets, $workflow, $workingDays, $admin): void {
            // Initials instead of borrowed cartoon pictures
            Employee::whereIn('id', $ids)->update(['avatar' => null]);

            // Notifications about the records rebuilt below would describe data that no longer exists (e.g. a
            // timesheet week that is replaced): their attendance, timesheet and early clock-out notices go too -
            // both their own and the admins' ones naming them. Leave, overtime and schedule notices stay true.
            $rebuilt = fn ($q) => $q->where('type', 'like', 'attendance%')->orWhere('type', 'like', 'timesheet%')->orWhere('type', 'like', 'early%');
            Notification::whereIn('employee_id', $ids)->where($rebuilt)->delete();

            // The admin inbox stores one row per notice with no employee_id, so the only handle on who a
            // notice is about is its own text. Deciding that on the name alone is how a real employee's
            // notice gets deleted: "Dela Cruz" appears in a demo person's name, and it also appears in
            // the notice about the different person who happens to share the surname.
            //
            // So an employee id in the text decides it on its own - ids are unique, and a notice that
            // names one is about exactly that person. Only a notice carrying no id at all (the older
            // ones were written with just a name) falls back to the name, and then it has to match the
            // whole name, not a fragment of it.
            $names = Employee::whereIn('id', $ids)->get()->map(fn ($e) => trim($e->first_name.' '.$e->last_name))->all();
            $demoIds = array_map('strtoupper', $ids);
            $aboutDemo = function (string $message) use ($demoIds, $names): bool {
                if (preg_match_all('/\bEMP\d+\b/i', $message, $found)) {
                    foreach ($found[0] as $id) {
                        if (in_array(strtoupper($id), $demoIds, true)) {
                            return true;
                        }
                    }

                    return false;
                }

                foreach ($names as $name) {
                    if ($name === '') {
                        continue;
                    }
                    // Whole word on both sides, so a shared surname or a name that is a prefix of
                    // another one cannot stand in for a person it has nothing to do with.
                    if (preg_match('/(?<![\p{L}\p{N}])'.preg_quote($name, '/').'(?![\p{L}\p{N}])/u', $message)) {
                        return true;
                    }
                }

                return false;
            };
            $staleAdminNotices = Notification::whereNull('employee_id')->where($rebuilt)->get()
                ->filter(fn ($n) => $aboutDemo((string) $n->message));
            $removedAdminNotices = $staleAdminNotices->count();
            $staleAdminNotices->each->delete();

            // Start clean: their whole attendance history, early clock-outs, timesheets, and shifts up to today
            EarlyClockOut::whereIn('employee_id', $ids)->delete();
            Attendance::whereIn('employee_id', $ids)->delete();
            Timesheet::whereIn('employee_id', $ids)->delete();
            ShiftSchedule::whereIn('employee_id', $ids)->where('date', '<=', $today)->delete();

            // 0. Leave and overtime requests roll forward with "today" too - added BEFORE the schedule
            // is built, so a freshly-granted leave day correctly takes that person off the schedule the
            // same way a real approval would (scheduleRows() below reads Leave the same way either way).
            $this->rollingLeave($ids, $from, $today, $workingDays);

            // rollingLeave() is sparse by design (one real approval every few weeks per person), which
            // can legitimately land nowhere in the last few days - purely bad luck, but Workforce
            // Analytics is opened on whatever day it is opened, and "This Week" or the first days of
            // "This Month" must not be empty just because the dice did not favour that exact window.
            // This tops up a small, guaranteed number of recent approvals so there is always something
            // real to show, without touching anyone who already has one nearby.
            $this->recentLeaveFloor($ids, $today, $workingDays);

            // 1. Schedules: exactly what automated scheduling would give them (work days, holidays, leave)
            $plan = ['rows' => $this->scheduleRows($ids, $from, $today)];

            // Overtime requests only make sense on a day the person is actually scheduled to work, so
            // this reads the schedule just built rather than recomputing work days and holidays again.
            $this->rollingOvertime($plan['rows']);
            $scheduleNo = $this->maxNumber(ShiftSchedule::class, 'SCH');
            foreach ($plan['rows'] as $row) {
                ShiftSchedule::create([
                    'id' => 'SCH'.str_pad((string) ++$scheduleNo, 3, '0', STR_PAD_LEFT),
                    'employee_id' => $row['employee_id'], 'employee_name' => $row['employee_name'],
                    'shift_id' => $shiftId, 'date' => $row['date'], 'status' => 'Scheduled',
                ]);
            }

            // 2. Attendance for every scheduled day, by the kiosk's rules
            $attendanceNo = $this->maxNumber(Attendance::class, 'ATT');
            $earlyNo = $this->maxNumber(EarlyClockOut::class, 'ECO');
            $enforcer = app(EarlyLeaveEnforcer::class);
            foreach ($plan['rows'] as $row) {
                $date = $row['date'];
                $employeeId = $row['employee_id'];
                $roll = crc32($employeeId.'|'.$date) % 100;
                $isToday = $date === $today;
                $start = ShiftHours::baseStart($date, $shift->start_time, $tz);

                if ($roll < 4) {   // about one day in 25: did not come in
                    if (! $isToday) {
                        Attendance::create([
                            'id' => 'ATT'.str_pad((string) ++$attendanceNo, 3, '0', STR_PAD_LEFT),
                            'employee_id' => $employeeId, 'date' => $date, 'status' => 'Absent',
                            'notes' => 'Recorded automatically: scheduled, no clock-in, no approved leave.',
                        ]);
                    }

                    continue;
                }

                // One arrival in eight is late (16-50 min); the rest arrive 20 min early to 14 min after the start
                $offset = $roll < 16 ? 16 + ($roll * 7) % 35 : -20 + ($roll * 13) % 35;
                $clockIn = $start->copy()->addMinutes($offset);
                if ($isToday && $clockIn->gt($now)) {
                    continue;   // not arrived yet
                }
                $status = $clockIn->gt($start->copy()->addMinutes($grace)) ? 'Late' : 'Present';

                $record = [
                    'id' => 'ATT'.str_pad((string) ++$attendanceNo, 3, '0', STR_PAD_LEFT),
                    'employee_id' => $employeeId, 'date' => $date, 'status' => $status,
                    'clock_in' => $clockIn->format('H:i:s'), 'location' => 'Main Entrance',
                ];

                // Leaving: a few minutes after the (approved-overtime-extended) end; today they are still at work
                // unless --close-today says the day is over.
                $effectiveEnd = ShiftHours::effectiveEnd($employeeId, $date, $shift->start_time, $shift->end_time, $tz);
                $out = $effectiveEnd?->copy()->addMinutes(($roll * 3) % 12);
                $closed = $out && (! $isToday || $closeToday);

                // About one day in 17 they have to leave before the end. The kiosk never refuses the punch, it
                // asks why, and the day is scored as Early Leave with a record HR can review.

                // This rebuilds HISTORY on every deploy, so the record is created already marked as
                // alerted. Firing the policy here would page HR about a punch that happened weeks
                // ago, brand new and unread, on every single deploy - which is what kept the
                // notification badge pinned at its highest number no matter what was read. The
                // early clock-out still exists for HR to classify; it just does not arrive as news.
                $earlyRoll = crc32($employeeId.'|'.$date.'|early') % 100;
                $isEarly = $closed && $earlyRoll < 6;
                if ($isEarly) {
                    $out = $out->copy()->subMinutes(60 + ($earlyRoll * 7) % 46);
                    $record['status'] = 'Early Leave';
                }

                if ($closed) {
                    $hours = ShiftHours::count($clockIn, $out, ShiftHours::baseEnd($date, $shift->start_time, $shift->end_time, $tz), $effectiveEnd, null, $start);
                    $record += [
                        'clock_out' => $hours['countedOut']->format('H:i:s'), 'actual_clock_out' => $out->format('H:i:s'),
                        'regular_hours' => $hours['regular'], 'overtime' => $hours['overtime'],
                        'total_hours' => $hours['total'], 'break_hours' => $hours['break'],
                    ];
                }
                $attendance = Attendance::create($record);

                if ($isEarly) {
                    $reason = $this->earlyReason($employeeId);
                    $enforcer->applyAtPunch(EarlyClockOut::create([
                        'id' => 'ECO'.str_pad((string) ++$earlyNo, 3, '0', STR_PAD_LEFT),
                        'attendance_id' => $attendance->id,
                        'employee_id' => $employeeId, 'employee_name' => $row['employee_name'], 'date' => $date,
                        'scheduled_end_time' => $effectiveEnd->format('H:i:s'),
                        'actual_clock_out_time' => $out->format('H:i:s'),
                        'minutes_early' => (int) abs($effectiveEnd->diffInMinutes($out)),
                        'reason_code' => $reason['code'], 'reason_note' => $reason['note'],
                        'proof' => [], 'reason_status' => 'PROVIDED',
                        'classification' => 'PENDING_REVIEW', 'notification_sent' => true,
                    ]));
                }
            }

            // 3. Timesheets from that attendance, Monday-Sunday, moved through the real workflow
            $thisMonday = $now->copy()->startOfWeek(Carbon::MONDAY);
            $lastMonday = $thisMonday->copy()->subWeek()->toDateString();
            for ($week = Carbon::parse($from); $week->lt($thisMonday->copy()->addWeek()); $week->addWeek()) {
                foreach ($ids as $id) {
                    $sheet = $timesheets->syncForEmployee($id, $week->toDateString());
                    if (! $sheet || $week->gte($thisMonday)) {
                        continue;   // this week stays a draft
                    }
                    $name = trim((string) $sheet->employee_name);
                    $sheet = $workflow->submit($sheet, $name);
                    if ($week->toDateString() !== $lastMonday) {
                        $workflow->approve($sheet, $admin);   // last week is left waiting for review
                    }
                }
            }
        });

        $this->info('Demo data rebuilt for '.count($ids).' demo employees, '.$from.' to '.$today
            .($closeToday ? ' (today closed).' : ' (today still in progress).'));

        return self::SUCCESS;
    }

    /**
     * The same claim for the same person on every early-leave day, so one person does not tell HR
     * a different story each time. Deterministic, like the rest of this command.
     *
     * @return array{code: string, note: string}
     */
    private function earlyReason(string $employeeId): array
    {
        $reasons = [
            ['code' => 'FAMILY_EMERGENCY', 'note' => 'Had to leave early for a family matter.'],
            ['code' => 'PERSONAL_EMERGENCY', 'note' => 'Had to handle an urgent personal matter.'],
            ['code' => 'OTHER', 'note' => 'Left early to attend a scheduled appointment.'],
        ];

        return $reasons[crc32($employeeId.'|early-reason') % count($reasons)];
    }

    /**
     * A fresh, sparse scatter of Approved leave across the rebuilt window - roughly one short leave
     * every 3 weeks per person, on a deterministic week so re-running this never doubles up. Never
     * touches a stretch that already has an approved request over it (hand-entered or from an earlier
     * run), so this only ever fills gaps, never overwrites a real answer.
     *
     * @param  list<string>  $ids
     */
    private function rollingLeave(array $ids, string $from, string $to, WorkingDays $workingDays): void
    {
        $types = ['Vacation', 'Sick', 'Emergency', 'Funeral', 'Special'];
        $leaveNo = $this->maxNumber(Leave::class, 'LVE');
        $toDate = Carbon::parse($to);

        foreach (Employee::whereIn('id', $ids)->get(['id', 'first_name', 'last_name']) as $employee) {
            $name = trim($employee->first_name.' '.$employee->last_name);

            for ($weekStart = Carbon::parse($from)->startOfWeek(Carbon::MONDAY); $weekStart->lte($toDate); $weekStart->addWeeks(3)) {
                $roll = crc32($employee->id.'|leave|'.$weekStart->toDateString()) % 100;
                if ($roll >= 35) {
                    continue;   // most 3-week stretches: no leave for this person
                }

                $start = $weekStart->copy()->addDays($roll % 5);   // a weekday within that week
                $end = $start->copy()->addDays($roll % 3);          // 1-3 calendar days
                if ($start->toDateString() < $from || $end->toDateString() > $to) {
                    continue;   // stays inside the window being rebuilt
                }

                $overlaps = Leave::where('employee_id', $employee->id)
                    ->where('start_date', '<=', $end->toDateString())
                    ->where('end_date', '>=', $start->toDateString())
                    ->exists();
                if ($overlaps) {
                    continue;
                }

                $days = $workingDays->count($employee->id, $start->toDateString(), $end->toDateString())['days'];
                if ($days < 1) {
                    continue;   // landed entirely on a day off or a holiday
                }

                Leave::create([
                    'id' => 'LVE'.str_pad((string) ++$leaveNo, 3, '0', STR_PAD_LEFT),
                    'employee_id' => $employee->id, 'employee_name' => $name,
                    'leave_type' => $types[$roll % count($types)],
                    'start_date' => $start->toDateString(), 'end_date' => $end->toDateString(), 'days' => $days,
                    'reason' => 'Demo data.', 'status' => 'Approved',
                    'applied_date' => $start->copy()->subDays(3)->toDateString(), 'approved_by' => 'Workforce Admin',
                ]);
            }
        }
    }

    /**
     * Tops up the last 10 days with a handful of guaranteed-recent Approved leave requests, one
     * workday long, for whichever of the first 3 demo employees do not already have an approved
     * request ending in that window. Deterministic per person (same "today" -> same result), so
     * this never doubles up on a re-run and never overwrites a request that is already there.
     */
    private function recentLeaveFloor(array $ids, string $to, WorkingDays $workingDays): void
    {
        $toDate = Carbon::parse($to);
        $windowStart = $toDate->copy()->subDays(9)->toDateString();
        $leaveNo = $this->maxNumber(Leave::class, 'LVE');
        $types = ['Vacation', 'Sick', 'Emergency'];

        $guaranteed = 0;
        foreach (Employee::whereIn('id', $ids)->orderBy('id')->get(['id', 'first_name', 'last_name']) as $employee) {
            if ($guaranteed >= 3) {
                break;
            }

            $hasRecent = Leave::where('employee_id', $employee->id)->where('status', 'Approved')
                ->where('end_date', '>=', $windowStart)->where('start_date', '<=', $to)->exists();
            if ($hasRecent) {
                continue;   // already has something real in this window - nothing to top up
            }

            $roll = crc32($employee->id.'|recent-leave|'.$to) % 100;
            $start = $toDate->copy()->subDays($roll % 8);   // somewhere in the last 0-7 days
            $days = $workingDays->count($employee->id, $start->toDateString(), $start->toDateString())['days'];
            if ($days < 1) {
                $start = $start->copy()->addDay();   // landed on a day off - nudge forward one day
                $days = $start->lte($toDate)
                    ? $workingDays->count($employee->id, $start->toDateString(), $start->toDateString())['days']
                    : 0;
            }
            if ($days < 1) {
                continue;   // both candidate days were off - skip rather than force a non-work day
            }

            Leave::create([
                'id' => 'LVE'.str_pad((string) ++$leaveNo, 3, '0', STR_PAD_LEFT),
                'employee_id' => $employee->id, 'employee_name' => trim($employee->first_name.' '.$employee->last_name),
                'leave_type' => $types[$roll % count($types)],
                'start_date' => $start->toDateString(), 'end_date' => $start->toDateString(), 'days' => $days,
                'reason' => 'Demo data.', 'status' => 'Approved',
                'applied_date' => $start->copy()->subDays(2)->toDateString(), 'approved_by' => 'Workforce Admin',
            ]);
            $guaranteed++;
        }
    }

    /**
     * A fresh, sparse scatter of Approved overtime across the days the schedule just built actually
     * has someone working - roughly one scheduled day in 12. Read by ShiftHours::effectiveEnd() when
     * attendance (below) works out how late that day counts as having gone.
     *
     * @param  list<array{employee_id: string, employee_name: string, date: string}>  $scheduleRows
     */
    private function rollingOvertime(array $scheduleRows): void
    {
        $otNo = $this->maxNumber(OvertimeRequest::class, 'OT');

        foreach ($scheduleRows as $row) {
            $roll = crc32($row['employee_id'].'|ot|'.$row['date']) % 100;
            if ($roll >= 8) {
                continue;
            }

            $already = OvertimeRequest::where('employee_id', $row['employee_id'])
                ->where('date', $row['date'])->where('status', 'Approved')->exists();
            if ($already) {
                continue;
            }

            $hours = round(1 + ($roll % 20) / 10, 1);   // 1.0h - 2.9h
            OvertimeRequest::create([
                'id' => 'OT'.str_pad((string) ++$otNo, 3, '0', STR_PAD_LEFT),
                'employee_id' => $row['employee_id'], 'employee_name' => $row['employee_name'],
                'date' => $row['date'], 'expected_hours' => $hours, 'approved_hours' => $hours,
                'reason' => 'Demo data.', 'status' => 'Approved',
                'requested_date' => Carbon::parse($row['date'])->subDay()->toDateString(),
                'approved_by' => 'Workforce Admin', 'approved_at' => Carbon::parse($row['date'])->subDay(),
            ]);
        }
    }

    /**
     * Who works which day between two dates: every demo employee on the company's usual work days, except holidays
     * and days of approved leave.
     *
     * @param  list<string>  $ids
     * @return list<array{employee_id: string, employee_name: string, date: string}>
     */
    private function scheduleRows(array $ids, string $from, string $to): array
    {
        $workDays = ScheduleSetting::current()->usualDays();
        $holidays = Holiday::whereBetween('date', [$from, $to])->get()->map(fn ($h) => $h->date->toDateString())->all();
        $leaves = Leave::whereIn('employee_id', $ids)->where('status', 'Approved')
            ->where('start_date', '<=', $to)->where('end_date', '>=', $from)->get();

        $rows = [];
        foreach (Employee::whereIn('id', $ids)->where('status', '!=', 'Terminated')->orderBy('id')->get() as $employee) {
            for ($day = Carbon::parse($from); $day->toDateString() <= $to; $day->addDay()) {
                $date = $day->toDateString();
                if (! in_array($day->isoWeekday(), $workDays, true) || in_array($date, $holidays, true)) {
                    continue;
                }
                if ($leaves->contains(fn ($l) => $l->employee_id === $employee->id && $l->start_date->toDateString() <= $date && $l->end_date->toDateString() >= $date)) {
                    continue;
                }
                $rows[] = ['employee_id' => $employee->id, 'employee_name' => trim($employee->first_name.' '.$employee->last_name), 'date' => $date];
            }
        }

        return $rows;
    }

    /** @return list<string> the demo employees that exist in this database */
    private function demoEmployeeIds(): array
    {
        $ids = [];
        foreach (['mock/employees.json' => 'employees', 'demo/core.json' => 'employees'] as $file => $key) {
            $path = database_path($file);
            if (is_file($path)) {
                $data = json_decode((string) file_get_contents($path), true);
                foreach (($data[$key] ?? []) as $row) {
                    if (! empty($row['id'])) {
                        $ids[] = $row['id'];
                    }
                }
            }
        }

        return Employee::whereIn('id', array_unique($ids))->pluck('id')->all();
    }

    /** The highest numeric suffix in use for a prefix (ids are sequential, e.g. ATT237). */
    private function maxNumber(string $model, string $prefix): int
    {
        $next = $this->nextIdFor($model, $prefix);

        return ((int) substr($next, strlen($prefix))) - 1;
    }
}
