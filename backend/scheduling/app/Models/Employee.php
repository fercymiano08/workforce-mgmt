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

    protected $fillable = [
        'id', 'first_name', 'last_name', 'email', 'phone', 'department', 'position',
        'employment_type', 'status', 'hire_date', 'salary', 'manager', 'avatar',
        'address', 'date_of_birth', 'gender', 'blood_group', 'emergency_contact',
        'emergency_phone', 'skills', 'education', 'face_registered',
        'face_image', 'face_descriptor', 'face_registered_at', 'leave_balances',
    ];

    protected function casts(): array
    {
        return [
            'hire_date' => 'date:Y-m-d',
            'salary' => 'float',
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
     * Default annual leave entitlement per leave type (calendar days).
     *
     * @return array<string, int>
     */
    public static function defaultLeaveBalances(): array
    {
        return [
            'Vacation' => 20,
            'Sick' => 10,
            'Emergency' => 5,
            'Special' => 5,
            'Maternity' => 105, // RA 11210, 105-Day Expanded Maternity Leave Law
            'Paternity' => 7,   // RA 8187, Paternity Leave Act
            'Bereavement' => 5,
            'Unpaid' => 30,
        ];
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
            ->map(fn ($rows) => (float) $rows->sum(fn ($l) => $l->start_date->diffInDays($l->end_date) + 1))
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
        $totals = $this->leave_balances ?: self::defaultLeaveBalances();
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

    public function toApiArray(): array
    {
        return array_merge($this->serializableToApiArray(), [
            'leaveBalances' => $this->leaveBalances(),
        ]);
    }
}
