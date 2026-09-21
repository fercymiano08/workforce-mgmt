<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

class Timesheet extends Model
{
    use ApiSerializable;

    public $incrementing = false;
    protected $keyType = 'string';
    public $timestamps = true;

    protected $fillable = [
        'id', 'employee_id', 'employee_name', 'department', 'date', 'week_start',
        'week_end', 'regular_hours', 'overtime_hours', 'approved_ot_hours', 'paid_ot_hours',
        'break_hours', 'total_hours', 'status', 'submitted_date', 'submitted_at', 'submitted_by',
        'auto_submitted', 'approved_by', 'reviewed_at', 'status_reason', 'needs_refresh',
        'reminded_at', 'nudged_at', 'exported_at', 'history', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'week_start' => 'date:Y-m-d',
            'week_end' => 'date:Y-m-d',
            'regular_hours' => 'float',
            'overtime_hours' => 'float',
            'approved_ot_hours' => 'float',
            'paid_ot_hours' => 'float',
            'break_hours' => 'float',
            'total_hours' => 'float',
            'submitted_date' => 'date:Y-m-d',
            'submitted_at' => 'datetime',
            'auto_submitted' => 'boolean',
            'reviewed_at' => 'datetime',
            'needs_refresh' => 'boolean',
            'reminded_at' => 'datetime',
            'nudged_at' => 'datetime',
            'exported_at' => 'datetime',
            'history' => 'array',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id');
    }
}
