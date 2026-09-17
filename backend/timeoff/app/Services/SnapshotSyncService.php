<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Pulls the tables this service depends on from its owner services over HTTP
 * and refreshes the local replicas. The dependency list lives in config/svc.php
 * (SVC_DEPENDENCIES). Failures are logged and swallowed so a temporarily
 * unreachable owner degrades gracefully instead of taking this service down.
 */
class SnapshotSyncService
{
    public function sync(): void
    {
        foreach (config('svc.dependencies', []) as $dep) {
            $url = (string) ($dep['url'] ?? '');
            $tables = $dep['tables'] ?? [];

            if ($url === '' || ! is_array($tables) || $tables === []) {
                continue;
            }

            try {
                $response = Http::timeout(20)
                    ->withHeader('X-Service-Token', (string) config('svc.token'))
                    ->get(rtrim($url, '/').'/api/internal/snapshot');

                if ($response->failed()) {
                    throw new \RuntimeException('snapshot request failed ('.$response->status().')');
                }

                $payload = $response->json('data');
                if (! is_array($payload)) {
                    throw new \RuntimeException('unexpected snapshot payload');
                }

                DB::transaction(function () use ($payload, $tables): void {
                    foreach ($tables as $table) {
                        if (! array_key_exists($table, $payload)) {
                            continue;
                        }

                        DB::table($table)->truncate();
                        foreach (array_chunk((array) $payload[$table], 200) as $chunk) {
                            foreach ($chunk as $row) {
                                DB::table($table)->insert((array) $row);
                            }
                        }
                    }
                });
            } catch (\Throwable $e) {
                Log::warning('Snapshot sync failed for '.$url, ['error' => $e->getMessage()]);
            }
        }
    }
}