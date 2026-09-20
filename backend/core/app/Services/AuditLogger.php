<?php

namespace App\Services;

use App\Models\AuditEvent;

/**
 * Local writer for core-owned audit events. Core owns the audit_events table,
 * so its own controllers log directly through this service. Peer services log
 * through the machine-to-machine endpoint instead (see InternalApiController
 * recordAudit), which funnels through this same class.
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