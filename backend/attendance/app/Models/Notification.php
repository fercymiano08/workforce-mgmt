<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

class Notification extends Model
{
    use ApiSerializable;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'type', 'title', 'message', 'timestamp', 'read', 'employee_id',
        'priority', 'action_url',
    ];

    protected function casts(): array
    {
        return [
            'timestamp' => 'datetime',
            'read' => 'boolean',
        ];
    }
}
