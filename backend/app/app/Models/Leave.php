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
        static::saved(function (Leave $leave): void {
            // An approved leave takes the person off the schedule for those days (whichever screen approved it).
            if ($leave->status === 'Approved' && ($leave->wasRecentlyCreated || $leave->wasChanged(['status', 'start_date', 'end_date']))) {
                \App\Services\ScheduleCleanup::forApprovedLeave($leave);
            }

            // The ledger's Usage entry (written at approval) is permanent unless reversed. If this
            // record WAS Approved and either stops being Approved, or stays Approved but its paid
            // portion changes (edited dates/type), the previously-deducted days must be credited
            // back before anything else - otherwise an admin un-approving or correcting a decision
            // leaves the employee silently, permanently overcharged.
            if (! $leave->wasRecentlyCreated && $leave->getOriginal('status') === 'Approved' && $leave->getOriginal('pay_type') === 'PaidWithBalance') {
                $originalType = $leave->getOriginal('leave_type');
                $originalPaidDays = (float) $leave->getOriginal('paid_days');
                $reversedAway = $leave->status !== 'Approved';
                $reversedByEdit = $leave->status === 'Approved' && ($leave->wasChanged('leave_type') || $leave->wasChanged('paid_days'));

                if (($reversedAway || $reversedByEdit) && $originalPaidDays > 0) {
                    \App\Services\LeaveLedger::write(
                        $leave->employee_id,
                        $originalType,
                        'Adjustment',
                        $originalPaidDays,
                        $leave->id,
                        'Reversal: leave '.($reversedAway ? "status changed to {$leave->status}" : 'edited while Approved'),
                        'SYSTEM',
                    );
                }
            }
        });
    }

    protected $fillable = [
        'id', 'employee_id', 'employee_name', 'leave_type', 'start_date', 'end_date', 'days',
        'pay_type', 'paid_days', 'unpaid_days',
        'reason', 'status', 'applied_date', 'approved_by', 'comments', 'documents',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date:Y-m-d',
            'end_date' => 'date:Y-m-d',
            'applied_date' => 'date:Y-m-d',
            'days' => 'float',
            'paid_days' => 'float',
            'unpaid_days' => 'float',
            'documents' => 'array',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id');
    }
}
