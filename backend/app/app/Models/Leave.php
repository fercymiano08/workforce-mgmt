<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

class Leave extends Model
{
    use ApiSerializable;

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        // An approved leave takes the person off the schedule for those days (whichever screen approved it).
        static::saved(function (Leave $leave): void {
            if ($leave->status === 'Approved' && ($leave->wasRecentlyCreated || $leave->wasChanged(['status', 'start_date', 'end_date']))) {
                \App\Services\ScheduleCleanup::forApprovedLeave($leave);
            }
        });
    }

    protected $fillable = [
        'id', 'employee_id', 'employee_name', 'leave_type', 'start_date', 'end_date', 'days',
        'reason', 'status', 'applied_date', 'approved_by', 'comments', 'documents',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date:Y-m-d',
            'end_date' => 'date:Y-m-d',
            'applied_date' => 'date:Y-m-d',
            'days' => 'float',
            'documents' => 'array',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id');
    }
}
