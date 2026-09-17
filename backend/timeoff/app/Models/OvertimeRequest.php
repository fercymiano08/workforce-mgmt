<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

class OvertimeRequest extends Model
{
    use ApiSerializable;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'employee_id', 'employee_name', 'date', 'expected_hours',
        'approved_hours', 'reason', 'status', 'requested_date',
        'approved_by', 'comments', 'approved_at',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'requested_date' => 'date:Y-m-d',
            'expected_hours' => 'float',
            'approved_hours' => 'float',
            'approved_at' => 'datetime',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id');
    }
}
