<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Role extends Model
{
    use ApiSerializable;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'department_id', 'name',
    ];

    protected $appends = ['department_name'];

    public function department(): BelongsTo
    {
        return $this->belongsTo(Department::class);
    }

    public function getDepartmentNameAttribute(): ?string
    {
        return $this->department?->name;
    }
}
