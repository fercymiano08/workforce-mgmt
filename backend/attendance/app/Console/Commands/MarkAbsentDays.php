<?php

namespace App\Console\Commands;

use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Models\Attendance;
use App\Models\Leave;
use App\Models\ShiftSchedule;
use App\Services\ShiftHours;
use Illuminate\Console\Command;

/**
 * A day that is over, where the person was scheduled to work but never clocked in and was not on approved
 * leave, is recorded as ABSENT. Without this the Absent numbers on the dashboards, analytics and reports
 * would only ever count the days someone typed in by hand, so absences silently went missing.
 *
 * Safe to run any number of times: a day that already has an attendance record (present, late, absent) is
 * never touched, and today is never marked (the shift may still be coming).
 */
class MarkAbsentDays extends Command
{
    use GeneratesSequentialIds;

    protected $signature = 'attendance:mark-absent {--days=7 : how many past days to check}';

    protected $description = 'Record scheduled days with no clock-in and no approved leave as Absent';

    public function handle(): int
    {
        $today = now(ShiftHours::timezone())->toDateString();
        $from = now(ShiftHours::timezone())->subDays(max(1, (int) $this->option('days')))->toDateString();
        $marked = 0;

        $schedules = ShiftSchedule::where('status', 'Scheduled')
            ->where('date', '>=', $from)->where('date', '<', $today)
            ->get(['employee_id', 'employee_name', 'date']);

        // Someone already recorded for the day (present, late, absent, half day...) is left alone.
        $recorded = Attendance::where('date', '>=', $from)->where('date', '<', $today)
            ->get(['employee_id', 'date'])
            ->mapWithKeys(fn ($a) => [$a->employee_id.'|'.$a->date->toDateString() => true]);

        $leaves = Leave::where('status', 'Approved')->whereDate('end_date', '>=', $from)->whereDate('start_date', '<', $today)
            ->get(['employee_id', 'start_date', 'end_date']);

        foreach ($schedules as $schedule) {
            $date = $schedule->date->toDateString();
            if ($recorded->has($schedule->employee_id.'|'.$date)) {
                continue;
            }
            $onLeave = $leaves->contains(fn ($l) => $l->employee_id === $schedule->employee_id
                && $l->start_date->toDateString() <= $date && $l->end_date->toDateString() >= $date);
            if ($onLeave) {
                continue;
            }

            try {
                Attendance::create([
                    'id' => $this->nextIdFor(Attendance::class, 'ATT'),
                    'employee_id' => $schedule->employee_id,
                    'date' => $date,
                    'status' => 'Absent',
                    'notes' => 'Recorded automatically: scheduled, no clock-in, no approved leave.',
                ]);
                $marked++;
            } catch (\Illuminate\Database\UniqueConstraintViolationException) {
                // recorded by someone else a moment ago
            }
        }

        $this->info("Marked {$marked} absent day(s).");

        return self::SUCCESS;
    }
}
