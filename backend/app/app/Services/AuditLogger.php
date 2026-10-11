<?php

namespace App\Services;

use App\Models\AuditEvent;

/**
 * The single append-only writer for audit_events, used by every domain.
 */
class AuditLogger
{
    /**
     * @param  array<string, mixed>|null  $before
     * @param  array<string, mixed>|null  $after
     * @param  array<string, mixed>|null  $meta
     */
    public static function record(
        string $service,
        string $event,
        string $entityType,
        string $entityId,
        ?string $actor = null,
        ?string $actorId = null,
        ?array $before = null,
        ?array $after = null,
        ?array $meta = null,
    ): ?AuditEvent {
        // Captured automatically from the current request so no call site above needs to pass it in.
        // Outside an HTTP request (a queued job, a console command) there is no request to read, so
        // both stay null rather than recording something misleading.
        $request = app()->bound('request') ? request() : null;

        return AuditEvent::create([
            'service' => $service,
            'event' => $event,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'actor' => $actor,
            'actor_id' => $actorId,
            'ip_address' => $request?->ip(),
            'user_agent' => $request && $request->userAgent() ? mb_substr($request->userAgent(), 0, 255) : null,
            'before' => $before,
            'after' => $after,
            'meta' => $meta,
        ]);
    }
}