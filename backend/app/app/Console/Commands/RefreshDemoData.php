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
use App\Models\Timesheet;
use App\Models\User;
use App\Services\ShiftHours;
use App\Services\SystemSettings;
use App\Services\TimesheetGenerationService;
use App\Services\TimesheetWorkflow;
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
 *   hours      ShiftHours::count() - paid time from the shift start, lunch deducted, overtime only if approved
 *   timesheets TimesheetGenerationService, Monday-Sunday weeks, moved through TimesheetWorkflow
 *               (older weeks approved, last week waiting for review, this week still a draft)
 * Arrival times vary per person and day but are the same on every run for the same day (no randomness).
 */
class RefreshDemoData extends Command
{
    use GeneratesSequentialIds;

    protected $signature = 'demo:refresh {--weeks=4 : full weeks of history before the current one}';

    protected $description = "Rebuild the demo employees' schedules, attendance and timesheets up to today";

    public function handle(TimesheetGenerationService $timesheets, TimesheetWorkflow $workflow): int
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
        $shift = ShiftDefinition::orderBy('id')->first();   // the company's standard shift
        if (! $shift) {
            $this->error('There is no shift to schedule.');

            return self::FAILURE;
        }
        $shiftId = $shift->id;
        $grace = max(0, (int) app(SystemSettings::class)->get('late_grace_minutes', 15));
        $admin = User::where('role', 'Administrator')->value('name') ?: 'Workforce Admin';

        DB::transaction(function () use ($ids, $from, $today, $now, $tz, $shift, $shiftId, $grace, $timesheets, $workflow, $admin): void {
            // Initials instead of borrowed cartoon pictures
            Employee::whereIn('id', $ids)->update(['avatar' => null]);

            // Notifications about the records rebuilt below would describe data that no longer exists (e.g. a
            // timesheet week that is replaced): their attendance, timesheet and early clock-out notices go too -
            // both their own and the admins' ones naming them. Leave, overtime and schedule notices stay true.
            $rebuilt = fn ($q) => $q->where('type', 'like', 'attendance%')->orWhere('type', 'like', 'timesheet%')->orWhere('type', 'like', 'early%');
            Notification::whereIn('employee_id', $ids)->where($rebuilt)->delete();
            $names = Employee::whereIn('id', $ids)->get()->map(fn ($e) => trim($e->first_name.' '.$e->last_name))->all();
            $aboutDemo = fn (string $message) => collect($ids)->contains(fn ($id) => str_contains($message, $id))
                || collect($names)->contains(fn ($name) => str_contains($message, $name));
            Notification::whereNull('employee_id')->where($rebuilt)->get()
                ->filter(fn ($n) => $aboutDemo((string) $n->message))
                ->each->delete();

            // Start clean: their whole attendance history, early clock-outs, timesheets, and shifts up to today
            EarlyClockOut::whereIn('employee_id', $ids)->delete();
            Attendance::whereIn('employee_id', $ids)->delete();
            Timesheet::whereIn('employee_id', $ids)->delete();
            ShiftSchedule::whereIn('employee_id', $ids)->where('date', '<=', $today)->delete();

            // 1. Schedules: exactly what automated scheduling would give them (work days, holidays, leave)
            $plan = ['rows' => $this->scheduleRows($ids, $from, $today)];
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
            foreach ($plan['rows'] as $row) {
                $date = $row['date'];
                $roll = crc32($row['employee_id'].'|'.$date) % 100;
                $isToday = $date === $today;
                $start = ShiftHours::baseStart($date, $shift->start_time, $tz);

                if ($roll < 4) {   // about one day in 25: did not come in
                    if (! $isToday) {
                        Attendance::create([
                            'id' => 'ATT'.str_pad((string) ++$attendanceNo, 3, '0', STR_PAD_LEFT),
                            'employee_id' => $row['employee_id'], 'date' => $date, 'status' => 'Absent',
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
                    'employee_id' => $row['employee_id'], 'date' => $date, 'status' => $status,
                    'clock_in' => $clockIn->format('H:i:s'), 'location' => 'Main Entrance',
                ];

                // Leaving: a few minutes after the (approved-overtime-extended) end; today they are still at work
                $effectiveEnd = ShiftHours::effectiveEnd($row['employee_id'], $date, $shift->start_time, $shift->end_time, $tz);
                $out = $effectiveEnd?->copy()->addMinutes(($roll * 3) % 12);
                if (! $isToday && $out) {
                    $hours = ShiftHours::count($clockIn, $out, ShiftHours::baseEnd($date, $shift->start_time, $shift->end_time, $tz), $effectiveEnd, null, $start);
                    $record += [
                        'clock_out' => $hours['countedOut']->format('H:i:s'), 'actual_clock_out' => $out->format('H:i:s'),
                        'regular_hours' => $hours['regular'], 'overtime' => $hours['overtime'],
                        'total_hours' => $hours['total'], 'break_hours' => $hours['break'],
                    ];
                }
                Attendance::create($record);
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

        $this->info('Demo data rebuilt for '.count($ids).' demo employees, '.$from.' to '.$today.'.');

        return self::SUCCESS;
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
        foreach (Employee::whereIn('id', $ids)->where('status', '!=', 'Inactive')->orderBy('id')->get() as $employee) {
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
