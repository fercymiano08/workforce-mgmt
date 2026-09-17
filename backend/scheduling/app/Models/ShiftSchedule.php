<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

class ShiftSchedule extends Model
{
    use ApiSerializable;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'employee_id', 'employee_name', 'shift_id', 'date', 'status',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
        ];
    }

    public function shift()
    {
        return $this->belongsTo(ShiftDefinition::class, 'shift_id');
    }
}
