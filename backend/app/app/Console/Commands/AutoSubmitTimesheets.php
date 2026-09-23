<?php

namespace App\Console\Commands;

use App\Models\Timesheet;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use App\Services\TimesheetWorkflow;
use Illuminate\Console\Command;

class AutoSubmitTimesheets extends Command
{
    protected $signature = 'timesheets:auto-submit';

    protected $description = 'Submit, on the employee\'s behalf, every finished week they have not submitted by the deadline';

    public function handle(TimesheetWorkflow $workflow): int
    {
        $submitted = 0;

        // Weeks with no hours are left alone: there is nothing for an admin to review.
        Timesheet::where('status', 'Draft')->where('total_hours', '>', 0)->get()->each(function (Timesheet $t) use ($workflow, &$submitted): void {
            if (! $workflow->weekFinished($t) || now()->lt($workflow->dueAt($t))) {
                return;
            }

            $before = $t->toApiArray();
            $t = $workflow->submit($t, 'System', auto: true);
            $submitted++;

            AuditLogger::record('payroll', 
                'timesheet.status_changed',
                'Timesheet',
                $t->id,
                actor: 'System',
                before: $before,
                after: $t->toApiArray(),
                meta: ['status' => 'Submitted', 'employeeId' => $t->employee_id, 'auto' => true],
            );

            $week = $t->week_start->format('M d').' – '.$t->week_end->format('M d');
            NotificationService::notifyEmployee(
                $t->employee_id,
                'timesheet_submitted',
                'Timesheet Submitted Automatically',
                "Your timesheet for the week of {$week} was not submitted by the deadline, so the system submitted it for you.",
                'medium',
                '/my-timesheet'
            );
            NotificationService::notifyAdmins(
                'timesheet_submitted',
                'Timesheet Submitted',
                "{$t->employee_name}'s timesheet for the week of {$week} was submitted automatically.",
                'medium',
                '/timesheets'
            );
        });

        $this->info("Auto-submitted {$submitted} timesheet(s).");

        return self::SUCCESS;
    }
}
