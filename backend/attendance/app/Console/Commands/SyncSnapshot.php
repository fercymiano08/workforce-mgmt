<?php

namespace App\Console\Commands;

use App\Services\SnapshotSyncService;
use Illuminate\Console\Command;

class SyncSnapshot extends Command
{
    protected $signature = 'snapshot:sync';

    protected $description = 'Refresh this service\'s local replica tables from the owner services over HTTP';

    public function handle(SnapshotSyncService $sync): int
    {
        $dependencies = config('svc.dependencies', []);

        if ($dependencies === []) {
            $this->warn('No SVC_DEPENDENCIES configured - nothing to sync.');

            return self::SUCCESS;
        }

        $this->info('Refreshing local replicas from owner services...');

        foreach ($dependencies as $dep) {
            $url = (string) ($dep['url'] ?? '');
            $tables = $dep['tables'] ?? [];
            $this->line('  - '.$url.' -> '.implode(', ', (array) $tables));
        }

        $sync->sync();
        $this->info('Snapshot sync finished (see logs for per-owner results).');

        return self::SUCCESS;
    }
}