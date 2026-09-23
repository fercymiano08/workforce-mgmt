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
        return AuditEvent::create([
            'service' => $service,
            'event' => $event,
            'entity_type' => $entityType,
            'entity_id' => $entityId,
            'actor' => $actor,
            'actor_id' => $actorId,
            'before' => $before,
            'after' => $after,
            'meta' => $meta,
        ]);
    }
}