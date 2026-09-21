<?php

namespace App\Console\Commands;

use App\Models\Timesheet;
use App\Services\NotificationService;
use App\Services\TimesheetWorkflow;
use Illuminate\Console\Command;

class RemindAboutTimesheets extends Command
{
    protected $signature = 'timesheets:remind';

    protected $description = 'Tell employees their finished week is ready to submit, and tell the admins when reviews are overdue (once each)';

    public function handle(TimesheetWorkflow $workflow): int
    {
        $employees = 0;

        Timesheet::where('status', 'Draft')->where('total_hours', '>', 0)->whereNull('reminded_at')->get()
            ->each(function (Timesheet $t) use ($workflow, &$employees): void {
                if (! $workflow->weekFinished($t)) {
                    return;
                }

                $week = $t->week_start->format('M d').' – '.$t->week_end->format('M d');
                NotificationService::notifyEmployee(
                    $t->employee_id,
                    'timesheet_reminder',
                    'Your Timesheet Is Ready',
                    "Your timesheet for the week of {$week} is ready. Please review and submit it before ".$workflow->dueAt($t)->format('D M j, g:i A').'; after that the system submits it for you.',
                    'medium',
                    '/my-timesheet'
                );
                $t->update(['reminded_at' => now()]);
                $employees++;
            });

        $waiting = Timesheet::where('status', 'Submitted')->whereNull('nudged_at')
            ->where('submitted_at', '<=', now()->subDays(TimesheetWorkflow::NUDGE_AFTER_DAYS))->get();

        if ($waiting->isNotEmpty()) {
            NotificationService::notifyAdmins(
                'timesheet_reminder',
                'Timesheets Waiting For Review',
                $waiting->count().' timesheet'.($waiting->count() === 1 ? ' has' : 's have').' been waiting more than '.TimesheetWorkflow::NUDGE_AFTER_DAYS.' days for review.',
                'medium',
                '/timesheets'
            );
            Timesheet::whereIn('id', $waiting->pluck('id'))->update(['nudged_at' => now()]);
        }

        $this->info("Reminded {$employees} employee(s); nudged the admins about {$waiting->count()} timesheet(s).");

        return self::SUCCESS;
    }
}
