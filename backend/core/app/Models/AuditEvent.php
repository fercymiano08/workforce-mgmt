<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

/**
 * Append-only record of security/HR-relevant actions across the platform.
 * Read-only from the API: there are no update or delete endpoints for this
 * model by design, and the table has no updated_at column so rows cannot be
 * rewritten in place.
 */
class AuditEvent extends Model
{
    use ApiSerializable {
        toApiArray as protected baseApiArray;
    }

    public $timestamps = false;

    protected $fillable = [
        'service', 'event', 'entity_type', 'entity_id',
        'actor', 'actor_id', 'before', 'after', 'meta',
    ];

    protected function casts(): array
    {
        return [
            'before' => 'array',
            'after' => 'array',
            'meta' => 'array',
            'created_at' => 'datetime',
        ];
    }

    /** The shared serializer drops created_at; for an audit trail the timestamp is the point. */
    public function toApiArray(): array
    {
        return [...$this->baseApiArray(), 'createdAt' => $this->created_at?->toIso8601String()];
    }
}