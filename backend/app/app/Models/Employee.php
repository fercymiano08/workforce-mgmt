<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

class Employee extends Model
{
    use ApiSerializable {
        toApiArray as private serializableToApiArray;
    }

    public $incrementing = false;
    protected $keyType = 'string';

    protected static function booted(): void
    {
        // Someone who no longer works here keeps no upcoming shifts (they would only turn into false no-shows).
        static::saved(function (Employee $employee): void {
            if ($employee->wasChanged('status') && $employee->status === 'Terminated') {
                \App\Services\ScheduleCleanup::forTerminatedEmployee($employee);
            }
        });
    }

    protected $fillable = [
        'id', 'first_name', 'last_name', 'email', 'phone', 'department', 'position',
        'employment_type', 'status', 'hire_date', 'manager', 'avatar',
        'address', 'date_of_birth', 'gender', 'blood_group', 'emergency_contact',
        'emergency_phone', 'skills', 'education', 'face_registered',
        'face_image', 'face_descriptor', 'face_registered_at',
    ];

    protected function casts(): array
    {
        return [
            'hire_date' => 'date:Y-m-d',
            'date_of_birth' => 'date:Y-m-d',
            'skills' => 'array',
            'education' => 'array',
            'face_registered' => 'boolean',
            'face_descriptor' => 'array',
            'face_registered_at' => 'datetime',
        ];
    }

    /**
     * How long, in days, a newly hired employee is on probation. 180 days (six months) is the
     * standard probationary period under the Philippine Labor Code (Article 296) for a regular-track
     * hire, and is used here as the one company-wide default until a real policy document exists.
     */
    public const PROBATION_DAYS = 180;

    /**
     * The canonical employment-type choices Employee Registration and the admin edit form offer.
     * "Probationary" is NOT one of these: it is not a type anyone picks, it is a status derived from
     * how long ago hireDate was (see isProbationary()), so it can never go stale against the date it
     * is supposed to describe.
     *
     * @return list<string>
     */
    public static function employmentTypes(): array
    {
        return ['Regular', 'Contractual', 'Part-time'];
    }

    /**
     * Still within the first PROBATION_DAYS since hireDate. Null hireDate is treated as "not new".
     * hireDate is always validated as today or earlier, so a plain (absolute) day diff is enough.
     */
    public function isProbationary(): bool
    {
        if (! $this->hire_date) {
            return false;
        }

        return $this->hire_date->copy()->startOfDay()->diffInDays(now()->startOfDay()) < self::PROBATION_DAYS;
    }

    /** The day probation ends, for display ("Probationary until Mar 4, 2027"). Null if not applicable. */
    public function probationEndsAt(): ?string
    {
        if (! $this->hire_date) {
            return null;
        }

        return $this->hire_date->copy()->addDays(self::PROBATION_DAYS)->toDateString();
    }

    /**
     * How long, in days, an employee is shown as "newly hired" on their own dashboard and in the
     * admin roster. No client policy document exists for this yet (unlike PROBATION_DAYS, which
     * tracks a statutory minimum), so 30 days is used as a reasonable placeholder until one does.
     */
    public const NEWLY_HIRED_DAYS = 30;

    /** Still within the first NEWLY_HIRED_DAYS since hireDate. Null hireDate is treated as "not new". */
    public function isNewlyHired(): bool
    {
        if (! $this->hire_date) {
            return false;
        }

        return $this->hire_date->copy()->startOfDay()->diffInDays(now()->startOfDay()) < self::NEWLY_HIRED_DAYS;
    }

    /**
     * The canonical leave types a request may be filed under: every active row of LeaveType,
     * the Workforce Admin's config table. Requests were previously validated against a hardcoded
     * array; now the server-side source of truth is the same table the admin edits, so adding or
     * retiring a type takes effect everywhere (the form, the balance check, the analytics charts)
     * without a code deploy.
     *
     * @return list<string>
     */
    public static function leaveTypes(): array
    {
        return LeaveType::activeCodes();
    }

    /**
     * Total approved leave days consumed per type, read from the balance ledger's Usage entries
     * rather than recomputed from Leave rows - the ledger is the authoritative history now.
     *
     * @return array<string, float>
     */
    public function usedLeaveDays(): array
    {
        return LeaveBalanceLedger::where('employee_id', $this->id)
            ->where('entry_type', 'Usage')
            ->get()
            ->groupBy('leave_type_code')
            ->map(fn ($rows) => (float) abs($rows->sum('days_delta')))
            ->all();
    }

    /**
     * Leave balances in the shape the frontend Leave page expects:
     * [{ type, total, used, remaining }, ...]. Only balance-requiring active types are included -
     * a type like Maternity or Unpaid genuinely has no balance to show. Derived entirely from the
     * ledger (SUM of positive vs. negative entries), never from a stored total.
     *
     * @return list<array{type: string, total: float, used: float, remaining: float}>
     */
    public function leaveBalances(): array
    {
        $types = LeaveType::where('requires_balance', true)->where('active', true)->get();
        if ($types->isEmpty()) {
            return [];
        }

        // One query for every type's ledger rows, not one per type - toApiArray() calls this for
        // every employee on a list endpoint (e.g. GET /employees), so this was the difference
        // between 2 queries per employee and up to 2x(number of balance-requiring types).
        $rowsByType = LeaveBalanceLedger::where('employee_id', $this->id)
            ->whereIn('leave_type_code', $types->pluck('code'))
            ->get()
            ->groupBy('leave_type_code');

        return $types->map(function (LeaveType $type) use ($rowsByType) {
            $rows = $rowsByType->get($type->code, collect());
            $total = (float) $rows->where('days_delta', '>', 0)->sum('days_delta');
            $used = (float) abs($rows->where('days_delta', '<', 0)->sum('days_delta'));

            return [
                'type' => $type->code,
                'total' => $total,
                'used' => $used,
                'remaining' => max($total - $used, 0),
            ];
        })->values()->all();
    }

    public function toApiArray(): array
    {
        return array_merge($this->serializableToApiArray(), [
            'leaveBalances' => $this->leaveBalances(),
            'probationary' => $this->isProbationary(),
            'probationEndsAt' => $this->probationEndsAt(),
            'newlyHired' => $this->isNewlyHired(),
        ]);
    }
}
