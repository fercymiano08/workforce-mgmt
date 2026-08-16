<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

class Setting extends Model
{
    use ApiSerializable;

    protected $fillable = [
        'profile', 'appearance', 'notifications', 'security', 'system', 'company', 'kiosk', 'ai_resolved_insights',
    ];

    protected function casts(): array
    {
        return [
            'profile' => 'array',
            'appearance' => 'array',
            'notifications' => 'array',
            'security' => 'array',
            'system' => 'array',
            'company' => 'array',
            'kiosk' => 'array',
            'ai_resolved_insights' => 'array',
        ];
    }

    protected function apiNullToEmpty(): array
    {
        return [
            'profile', 'appearance', 'notifications', 'security', 'system', 'company', 'kiosk',
        ];
    }
}
