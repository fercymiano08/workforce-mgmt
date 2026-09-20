<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Reports audit events to the Core service's append-only audit_events table.
 * 'remote' (production): POSTs to Core. 'local' (tests): skipped silently.
 */
class AuditClient
{
    /**
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>|null  $after
     * @param  array<string, mixed>|null  $meta
     */
    public static function record(
        string $event,
        string $entityType,
        string $entityId,
        ?string $actor = null,
        ?string $actorId = null,
        ?array $before = null,
        ?array $after = null,
        ?array $meta = null,
    ): void {
        if (config('svc.audit_mode', 'remote') === 'local') {
            return;
        }

        try {
            Http::timeout(5)
                ->withHeader('X-Service-Token', (string) config('svc.token'))
                ->post(rtrim(config('svc.auth.url'), '/').'/api/internal/audit', [
                    'service' => 'payroll',
                    'event' => $event,
                    'entityType' => $entityType,
                    'entityId' => $entityId,
                    'actor' => $actor,
                    'actorId' => $actorId,
                    'before' => $before,
                    'after' => $after,
                    'meta' => $meta,
                ]);
        } catch (\Throwable $e) {
            Log::warning('Audit write failed', ['event' => $event, 'error' => $e->getMessage()]);
        }
    }
}