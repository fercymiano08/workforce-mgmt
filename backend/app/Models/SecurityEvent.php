<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

class SecurityEvent extends Model
{
    use ApiSerializable;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'type', 'message', 'detail', 'employee_id', 'status', 'resolved_at', 'resolved_by',
    ];

    protected function casts(): array
    {
        return [
            'detail' => 'array',
            'resolved_at' => 'datetime',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id');
    }
}
