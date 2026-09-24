<?php

namespace App\Console\Commands;

use App\Models\Attendance;
use App\Models\ShiftSchedule;
use App\Services\TimesheetGenerationService;
use App\Services\ShiftHours;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

class RecountAttendanceHours extends Command
{
    protected $signature = 'attendance:recount-hours {--days=14}';

    protected $description = 'Re-count recent days from the real clock-out, so approving (or withdrawing) an overtime request changes the counted hours';

    public function handle(): int
    {
        $timezone = ShiftHours::timezone();
        $changed = 0;

        Attendance::whereNotNull('clock_out')
            ->whereNotNull('actual_clock_out')
            ->where('date', '>=', now()->subDays((int) $this->option('days'))->toDateString())
            ->get()
            ->each(function (Attendance $row) use ($timezone, &$changed): void {
                $dateKey = $row->date->toDateString();
                $schedule = ShiftSchedule::with('shift')->where('employee_id', $row->employee_id)->where('date', $dateKey)->first();
                if (! $schedule || ! $schedule->shift || ! $row->clock_in) {
                    return;
                }

                $shift = $schedule->shift;
                $hours = ShiftHours::count(
                    Carbon::parse($dateKey.' '.$row->clock_in, $timezone),
                    Carbon::parse($dateKey.' '.$row->actual_clock_out, $timezone),
                    ShiftHours::baseEnd($dateKey, $shift->start_time, $shift->end_time, $timezone),
                    ShiftHours::effectiveEnd($row->employee_id, $dateKey, $shift->start_time, $shift->end_time, $timezone),
                    (int) round(((float) $row->break_hours) * 60),
                    ShiftHours::baseStart($dateKey, $shift->start_time, $timezone),
                );

                $countedOut = $hours['countedOut']->format('H:i:s');
                if ($row->clock_out === $countedOut
                    && (float) $row->total_hours === $hours['total']
                    && (float) $row->overtime === $hours['overtime']) {
                    return;
                }

                $row->update([
                    'clock_out' => $countedOut,
                    'regular_hours' => $hours['regular'],
                    'overtime' => $hours['overtime'],
                    'total_hours' => $hours['total'],
                    'break_hours' => $hours['break'],
                ]);
                (new TimesheetGenerationService())->syncForEmployee($row->employee_id, now()->toDateString());
                $changed++;
            });

        $this->info("Re-counted hours changed on {$changed} record(s).");

        return self::SUCCESS;
    }
}
