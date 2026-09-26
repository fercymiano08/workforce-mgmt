<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

/**
 * A correction request ("Corrections" in Time & Attendance): the employee says what happened and attaches photo proof;
 * the Workforce Admin decides and, when approving, enters the final time by hand.
 */
class AttendanceAdjustment extends Model
{
    use ApiSerializable;

    protected $table = 'attendance_adjustments';

    public $incrementing = false;

    protected $keyType = 'string';

    /** An employee cannot have two open requests for the same day and the same problem. */
    public const OPEN_STATUSES = ['Pending'];

    public const STATUS_PENDING = 'Pending';

    public const STATUS_APPROVED = 'Approved';

    public const STATUS_REJECTED = 'Rejected';

    public const STATUS_CANCELLED = 'Cancelled';

    /** Worked beyond the end of the shift: a clock-out that failed, or that was never counted. */
    public const TYPE_WORKED_PAST_SHIFT = 'worked_past_shift';

    /** Kiosk failure: it did not clock the employee in. */
    public const TYPE_KIOSK_CLOCK_IN = 'kiosk_clock_in';

    /** Kiosk failure: it did not clock the employee out. */
    public const TYPE_KIOSK_CLOCK_OUT = 'kiosk_clock_out';

    public const TYPES = [self::TYPE_WORKED_PAST_SHIFT, self::TYPE_KIOSK_CLOCK_IN, self::TYPE_KIOSK_CLOCK_OUT];

    protected $fillable = [
        'id', 'employee_id', 'employee_name', 'date', 'type', 'claimed_time', 'final_time', 'reason', 'proof',
        'shift_start', 'shift_end', 'derived_hours', 'derived_overtime', 'recorded_hours', 'status',
        'corroboration', 'decided_by', 'decided_at', 'decision_note', 'requested_date',
    ];

    protected function apiNullToEmpty(): array
    {
        return ['proof', 'corroboration'];
    }

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'requested_date' => 'date:Y-m-d',
            'claimed_time' => 'string',
            'final_time' => 'string',
            'shift_start' => 'string',
            'shift_end' => 'string',
            'derived_hours' => 'float',
            'derived_overtime' => 'float',
            'recorded_hours' => 'float',
            'proof' => 'array',
            'corroboration' => 'array',
            'decided_at' => 'datetime',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id');
    }

    public function isOpen(): bool
    {
        return $this->status === self::STATUS_PENDING;
    }
}
