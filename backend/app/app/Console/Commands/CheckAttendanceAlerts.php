<?php

namespace App\Console\Commands;

use App\Services\AttendanceAlerts;
use Illuminate\Console\Command;

/**
 * Runs every minute, so the admins' attendance alerts (possible no-show, incomplete record, unauthorized overtime,
 * staffing shortage) appear about a minute after the situation arises - whether or not anyone has the dashboard
 * open. Each situation is flagged once a day.
 */
class CheckAttendanceAlerts extends Command
{
    protected $signature = 'attendance:check-alerts';

    protected $description = 'Raise the attendance alerts that are due now';

    public function handle(AttendanceAlerts $alerts): int
    {
        $result = $alerts->scan();
        $this->info('No-shows: '.$result['absentFlagged'].', incomplete: '.$result['incompleteFlagged']
            .', unauthorized overtime: '.$result['unauthorizedOtFlagged'].', shortage: '.($result['shortageFlagged'] ? 'yes' : 'no'));

        return self::SUCCESS;
    }
}
