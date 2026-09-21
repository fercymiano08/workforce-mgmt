<?php

namespace App\Console\Commands;

use App\Models\ScheduleBatch;
use App\Models\ScheduleSetting;
use App\Services\NotificationService;
use App\Services\ScheduleGenerator;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * The "automatic" in automatic scheduling. Runs every hour; when automatic scheduling is on and it is the
 * chosen day and hour (Manila time), it schedules the coming week(s) for every active employee following the
 * work patterns, holidays, approved leave and existing shifts, then tells the admins what it did. It runs
 * once per target week: a week that already has an automatic run (even one that was undone) is left alone.
 */
class AutoGenerateSchedules extends Command
{
    protected $signature = 'schedules:auto-generate';

    protected $description = 'Prepare next week\'s schedule automatically (when switched on in the scheduling rules)';

    public function handle(ScheduleGenerator $generator): int
    {
        $setting = ScheduleSetting::current();
        if (! $setting->auto_enabled) {
            $this->info('Automatic scheduling is off.');

            return self::SUCCESS;
        }

        $now = Carbon::now(ScheduleGenerator::TZ);
        if ($now->isoWeekday() !== $setting->run_day || $now->hour < $setting->run_hour) {
            $this->info('Not the scheduled time yet.');

            return self::SUCCESS;
        }

        $start = $now->copy()->startOfWeek(Carbon::MONDAY)->addWeek();
        $end = $start->copy()->addWeeks(max(1, $setting->weeks_ahead))->subDay();

        if (ScheduleBatch::where('source', 'automatic')->whereDate('start_date', $start->toDateString())->exists()) {
            $this->info('This week was already scheduled automatically.');

            return self::SUCCESS;
        }

        $shiftId = $generator->defaultShiftId();
        if (! $shiftId) {
            $this->warn('There is no shift definition to schedule.');

            return self::SUCCESS;
        }

        $plan = $generator->plan($start->toDateString(), $end->toDateString(), $shiftId, null, true);
        $result = $generator->commit($plan, 'automatic', 'System');

        $skipped = [];
        if ($result['skippedOnLeave']) {
            $skipped[] = $result['skippedOnLeave'].' for approved leave';
        }
        if ($result['skippedHoliday']) {
            $skipped[] = $result['skippedHoliday'].' for holidays';
        }
        if ($result['skippedExisting']) {
            $skipped[] = $result['skippedExisting'].' already scheduled';
        }
        $coverage = count(array_unique(array_column($result['coverageShortages'], 'date')));

        NotificationService::notifyAdmins(
            'schedule_generated',
            'Schedule Prepared Automatically',
            "{$result['created']} shifts were created for {$result['employees']} employees ({$start->format('M d')} – {$end->format('M d, Y')})"
                .($skipped ? '; skipped: '.implode(', ', $skipped) : '').'.'
                .($coverage ? " {$coverage} day(s) are below minimum coverage." : '')
                .' Review or undo it on the Shifts page.',
            $coverage ? 'high' : 'medium',
            '/shifts'
        );

        $this->info("Scheduled {$result['created']} shifts ({$start->toDateString()} to {$end->toDateString()}).");

        return self::SUCCESS;
    }
}
