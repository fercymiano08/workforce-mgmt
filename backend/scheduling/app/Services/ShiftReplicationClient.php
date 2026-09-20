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

        // Pushed to all targets concurrently: sequentially, each slow target added
        // its own timeout to the request that saved the schedule.
        $token = (string) config('svc.token');
        $urls = array_values(array_map(fn ($u) => rtrim((string) $u, '/'), $targets));

        try {
            $responses = Http::pool(function ($pool) use ($urls, $token, $payload) {
                foreach ($urls as $i => $url) {
                    $pool->as((string) $i)->connectTimeout(1)->timeout(5)
                        ->withHeader('X-Service-Token', $token)
                        ->post($url.'/api/internal/shift-schedules/sync', $payload);
                }
            });
        } catch (\Throwable $e) {
            Log::warning('Shift schedule replication push failed', ['error' => $e->getMessage()]);

            return;
        }

        foreach ($urls as $i => $url) {
            $response = $responses[(string) $i] ?? null;
            if (! $response instanceof \Illuminate\Http\Client\Response || $response->failed()) {
                $reason = $response instanceof \Illuminate\Http\Client\Response
                    ? 'sync request failed ('.$response->status().')'
                    : ($response instanceof \Throwable ? $response->getMessage() : 'no response');
                Log::warning('Shift schedule replication push failed for '.$url, ['error' => $reason]);
            }
        }
    }
}
