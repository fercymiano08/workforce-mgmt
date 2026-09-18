<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Pushes one employee row to every service that keeps a local replica of the
 * employees table, immediately after a write - so "HR registers a face, then
 * the employee clocks in 10 seconds later" always sees current data instead
 * of depending on the next periodic snapshot:sync.
 *
 * Reads the row back with the raw query builder (not the Eloquent model) so
 * the payload is exactly the same shape InternalApiController::snapshot()
 * already sends during periodic sync - no separate cast/encoding path to get
 * wrong. Best-effort per target: a target being briefly unreachable never
 * fails the request that triggered this (the write already succeeded in
 * this service's own database) - it just logs a warning, and the scheduled
 * snapshot:sync catches it up within a minute regardless.
 */
class EmployeeReplicationClient
{
    public static function push(string $employeeId): void
    {
        $targets = config('svc.employee_replica_targets', []);
        if (! is_array($targets) || $targets === []) {
            return;
        }

        $row = DB::table('employees')->where('id', $employeeId)->first();
        if (! $row) {
            return;
        }

        $payload = (array) $row;

        foreach ($targets as $url) {
            try {
                $response = Http::timeout(3)
                    ->withHeader('X-Service-Token', (string) config('svc.token'))
                    ->post(rtrim((string) $url, '/').'/api/internal/employees/sync', $payload);

                if ($response->failed()) {
                    throw new \RuntimeException('sync request failed ('.$response->status().')');
                }
            } catch (\Throwable $e) {
                Log::warning('Employee replication push failed for '.$url, ['error' => $e->getMessage()]);
            }
        }
    }
}
