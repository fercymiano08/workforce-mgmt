<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Pushes shift_schedules rows to every service that keeps a local replica,
 * immediately after a write - so "HR adds a schedule, then the employee
 * clocks in 10 seconds later" always works instead of depending on the next
 * periodic snapshot:sync. Mirrors EmployeeReplicationClient in core.
 *
 * Takes a list of row IDs rather than one at a time so a bulk operation
 * (generateSchedule can create dozens of rows in one request) sends a single
 * batched POST per target instead of one request per row.
 */
class ShiftReplicationClient
{
    public static function pushSchedules(array $ids): void
    {
        if ($ids === []) {
            return;
        }

        $targets = config('svc.shift_replica_targets', []);
        if (! is_array($targets) || $targets === []) {
            return;
        }

        $rows = DB::table('shift_schedules')->whereIn('id', $ids)->get();
        if ($rows->isEmpty()) {
            return;
        }

        $payload = ['rows' => $rows->map(fn ($row) => (array) $row)->values()->all()];

        foreach ($targets as $url) {
            try {
                $response = Http::timeout(5)
                    ->withHeader('X-Service-Token', (string) config('svc.token'))
                    ->post(rtrim((string) $url, '/').'/api/internal/shift-schedules/sync', $payload);

                if ($response->failed()) {
                    throw new \RuntimeException('sync request failed ('.$response->status().')');
                }
            } catch (\Throwable $e) {
                Log::warning('Shift schedule replication push failed for '.$url, ['error' => $e->getMessage()]);
            }
        }
    }
}
