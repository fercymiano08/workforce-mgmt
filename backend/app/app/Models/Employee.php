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
        'face_image', 'face_descriptor', 'face_registered_at', 'leave_balances',
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
            'leave_balances' => 'array',
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
     * Default annual leave entitlement per leave type (calendar days).
     *
     * A panel review walked through these one by one: "Emergency" was redundant with "Sick" (folded
     * in here - genuinely urgent personal matters now file under "Special"), "Funeral" read as
     * morbid and unclear ("Bereavement" is the standard HR term), and there was no way at all to
     * request Maternity or Paternity leave - both now exist as their own type, gender-checked in
     * LeaveController (see assertEligible there for all of the type-specific rules).
     *
     * Maternity (105 days) and Paternity (7 days) follow RA 11210 and RA 8187 respectively - the
     * statutory minimums, used here as the default until a real company policy exists.
     *
     * @return array<string, int>
     */
    public static function defaultLeaveBalances(): array
    {
        return [
            'Vacation' => 20,
            'Sick' => 10,
            'Special' => 5,
            'Bereavement' => 5,
            'Maternity' => 105,
            'Paternity' => 7,
            'Unpaid' => 30,
        ];
    }

    /**
     * The canonical leave types a request may be filed under.
     *
     * Kept beside the entitlement map rather than in the controller so there is exactly one
     * definition of "a leave type exists here": every allowance above is a key of this list, and
     * every type allowed through validation is a key of it too. Adding a new type means adding
     * it in one place and the form, the balance check and the analytics charts all follow.
     *
     * Requests were previously validated as a bare string, so any text at all could be filed and
     * stored. A 'Half Day' request reached the database that way: it has no balance here, so it
     * skipped the allowance check entirely, and no chart had a bucket for it, so approved leave
     * existed while appearing on no report at all.
     *
     * @return list<string>
     */
    public static function leaveTypes(): array
    {
        return array_keys(self::defaultLeaveBalances());
    }

    /**
     * Total approved leave days consumed per type.
     *
     * @return array<string, float>
     */
    public function usedLeaveDays(): array
    {
        return Leave::where('employee_id', $this->id)
            ->where('status', 'Approved')
            ->get()
            ->groupBy('leave_type')
            ->map(fn ($rows) => (float) $rows->sum(fn ($l) => $l->days ?? ($l->start_date->diffInDays($l->end_date) + 1)))
            ->all();
    }

    /**
     * Leave balances in the shape the frontend Leave page expects:
     * [{ type, total, used, remaining }, ...].
     *
     * @return list<array{type: string, total: float, used: float, remaining: float}>
     */
    public function leaveBalances(): array
    {
        $totals = $this->normalizedLeaveBalancesMap();
        $used = $this->usedLeaveDays();

        $balances = [];
        foreach ($totals as $type => $total) {
            $total = (float) $total;
            $u = (float) ($used[$type] ?? 0);
            $balances[] = [
                'type' => $type,
                'total' => $total,
                'used' => $u,
                'remaining' => max($total - $u, 0),
            ];
        }

        return $balances;
    }

    /**
     * Canonical {Type: total} map from the stored leave_balances column.
     *
     * The column normally stores the canonical map, but some environments have
     * historically persisted the API output shape (a list of
     * {type,total,used,remaining} objects) instead. Both shapes are accepted
     * here so mis-shapen data can never gray out the balance cards again.
     *
     * @return array<string, float>
     */
    private function normalizedLeaveBalancesMap(): array
    {
        $stored = $this->leave_balances;

        if (is_array($stored) && ! array_is_list($stored)) {
            return $stored;
        }

        $map = [];
        if (is_array($stored)) {
            foreach ($stored as $row) {
                if (is_array($row) && isset($row['type'])) {
                    $map[$row['type']] = (float) ($row['total'] ?? 0);
                }
            }
        }

        return $map !== [] ? $map : self::defaultLeaveBalances();
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
