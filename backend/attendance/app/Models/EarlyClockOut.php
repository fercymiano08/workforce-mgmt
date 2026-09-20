<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

/**
 * Documentation for an early clock-out: the reason, the proof, and the
 * HR classification decided AFTER the fact. The punch itself lives on the
 * attendance row - this table never gates or vetoes the punch.
 */
class EarlyClockOut extends Model
{
    use ApiSerializable;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'attendance_id', 'employee_id', 'employee_name', 'date',
        'scheduled_end_time', 'actual_clock_out_time', 'minutes_early',
        'reason_code', 'reason_note', 'proof', 'reason_status',
        'classification', 'classification_note', 'classified_by', 'classified_at', 'notification_sent',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'scheduled_end_time' => 'string',
            'actual_clock_out_time' => 'string',
            'minutes_early' => 'int',
            'proof' => 'array',
            'notification_sent' => 'bool',
            'classified_at' => 'datetime',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id');
    }

    public function attendance()
    {
        return $this->belongsTo(Attendance::class, 'attendance_id');
    }
}