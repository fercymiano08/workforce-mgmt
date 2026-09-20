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
            'Bereavement' => 5,
            'Unpaid' => 30,
        ];
    }

    /**
     * Total approved leave days consumed per type.
     *
     * The Time-off service owns the leaves table; consumption is reflected in
     * that service's leave-balance projection rather than reconstructed here.
     *
     * @return array<string, float>
     */
    public function usedLeaveDays(): array
    {
        return [];
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
        ]);
    }
}
