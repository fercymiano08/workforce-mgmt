<?php

namespace App\Console\Commands;

use App\Services\TimesheetGenerationService;
use Illuminate\Console\Command;

class RefreshRecentTimesheets extends Command
{
    protected $signature = 'timesheets:refresh {--weeks=6}';

    protected $description = 'Rebuild the timesheets of the last few weeks from this service\'s copy of attendance, so a change made elsewhere shows up within a minute or two';

    public function handle(TimesheetGenerationService $generator): int
    {
        $count = $generator->regenerateRecent((int) $this->option('weeks'));
        $this->info("Refreshed {$count} timesheet(s).");

        return self::SUCCESS;
    }
}
