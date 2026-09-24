<?php

namespace App\Console\Commands;

use App\Models\ScheduleSetting;
use App\Services\NotificationService;
use App\Services\ScheduleGenerator;
use Illuminate\Console\Command;
use Illuminate\Support\Carbon;

/**
 * The "automatic" in automated shift scheduling. Runs every hour; when the switch is ON it does exactly what
 * the admin's "Run now" button does - ScheduleGenerator::run() - but only for days of the window no run has
 * covered yet. So a new week or month is scheduled by the first run after midnight (its first day included,
 * before the shift starts), a missed hour is caught up on the next one, and days already done (by the admin
 * or by this job, even if undone) are left alone.
 */
class AutoGenerateSchedules extends Command
{
    protected $signature = 'schedules:auto-generate';

    protected $description = 'Automated shift scheduling: keep the chosen window scheduled (when switched on)';

    public function handle(ScheduleGenerator $generator): int
    {
        if (! ScheduleSetting::current()->auto_enabled) {
            $this->info('Automatic scheduling is off.');

            return self::SUCCESS;
        }

        $result = $generator->run(false, 'automatic', 'System', onlyNewDays: true);
        if ($result['weeks'] === []) {
            $this->info('Every open day in the window is already scheduled.');

            return self::SUCCESS;
        }

        $t = $result['totals'];
        // Adding a newly hired person to an already-scheduled week is only worth a message if it created shifts.
        $newWeek = collect($result['weeks'])->contains(fn ($w) => ! $w['newcomersOnly']);
        if (! $newWeek && $t['created'] === 0) {
            $this->info('Nothing new to schedule.');

            return self::SUCCESS;
        }
        $from = Carbon::parse($result['weeks'][0]['startDate']);
        $to = Carbon::parse($result['weeks'][count($result['weeks']) - 1]['endDate']);
        $skipped = array_filter([
            $t['skippedOnLeave'] ? $t['skippedOnLeave'].' for approved leave' : null,
            $t['skippedHoliday'] ? $t['skippedHoliday'].' for holidays' : null,
            $t['skippedExisting'] ? $t['skippedExisting'].' already scheduled' : null,
        ]);

        NotificationService::notifyAdmins(
            'schedule_generated',
            'Schedule Published Automatically',
            "{$t['created']} shifts were created for {$from->format('M d')} – {$to->format('M d, Y')}"
                .($skipped ? '; skipped: '.implode(', ', $skipped) : '').'.'
                .($t['coverageShortages'] ? ' Some days are below minimum coverage.' : '')
                .' Review or undo it in Automated Shift Scheduling > History.',
            $t['coverageShortages'] ? 'high' : 'medium',
            '/shifts'
        );

        $this->info("Scheduled {$t['created']} shifts in {$t['weeks']} week(s).");

        return self::SUCCESS;
    }
}
