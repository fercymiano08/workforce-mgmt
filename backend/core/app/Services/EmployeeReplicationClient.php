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
        // Replicas match on face_descriptor; the photo itself stays in core only.
        $payload['face_image'] = null;

        // Fire all pushes at once: sequentially, five slow/down targets meant up
        // to 5 x 3s added to the HR user's save request. The pool caps that at
        // the slowest single target.
        $token = (string) config('svc.token');
        $urls = array_values(array_map(fn ($u) => rtrim((string) $u, '/'), $targets));

        try {
            $responses = Http::pool(function ($pool) use ($urls, $token, $payload) {
                foreach ($urls as $i => $url) {
                    $pool->as((string) $i)->timeout(3)
                        ->withHeader('X-Service-Token', $token)
                        ->post($url.'/api/internal/employees/sync', $payload);
                }
            });
        } catch (\Throwable $e) {
            Log::warning('Employee replication push failed', ['error' => $e->getMessage()]);

            return;
        }

        foreach ($urls as $i => $url) {
            $response = $responses[(string) $i] ?? null;
            if (! $response instanceof \Illuminate\Http\Client\Response || $response->failed()) {
                $reason = $response instanceof \Illuminate\Http\Client\Response
                    ? 'sync request failed ('.$response->status().')'
                    : ($response instanceof \Throwable ? $response->getMessage() : 'no response');
                Log::warning('Employee replication push failed for '.$url, ['error' => $reason]);
            }
        }
    }
}
