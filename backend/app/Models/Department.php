<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

class Department extends Model
{
    use ApiSerializable;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'name', 'head', 'head_id', 'employee_count', 'budget', 'location', 'description',
    ];

    protected function casts(): array
    {
        return [
            'employee_count' => 'integer',
            'budget' => 'float',
        ];
    }
}
