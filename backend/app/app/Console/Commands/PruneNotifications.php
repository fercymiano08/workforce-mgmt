<?php

namespace App\Console\Commands;

use App\Models\Notification;
use Illuminate\Console\Command;

/**
 * The bell is a channel for what needs acting on now, not an archive: nothing was
 * ever cleaned up, so the unread badge grew forever and old rows that were
 * resolved weeks ago sat there inflating it. This drops notifications older than
 * the retention window - what needs keeping (who approved what, when) already
 * lives in the audit log and in the records themselves, not in the bell.
 */
class PruneNotifications extends Command
{
    protected $signature = 'notifications:prune {--days=30 : delete notifications older than this many days}';

    protected $description = 'Delete notifications older than the retention window';

    public function handle(): int
    {
        $days = max(1, (int) $this->option('days'));
        $cutoff = now()->subDays($days);

        $deleted = Notification::where('timestamp', '<', $cutoff)->delete();

        $this->info("Deleted {$deleted} notification(s) older than {$days} days.");

        return self::SUCCESS;
    }
}