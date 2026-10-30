<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

/**
 * A bundle of rules the HR Admin configures per leave type - gender/tenure eligibility,
 * pay resolution, accrual, advance notice, proof requirements. Replaces the hardcoded string
 * checks that used to live in LeaveController. `code` matches the existing `leaves.leave_type`
 * string values exactly, so nothing on the leaves table needed renaming when this was introduced.
 */
class LeaveType extends Model
{
    use ApiSerializable;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'code', 'name', 'applicable_gender', 'min_tenure_months', 'pay_type',
        'requires_balance', 'accrual_policy', 'accrual_rate', 'max_carryover_days',
        'advance_notice_days', 'retroactive_allowed', 'retroactive_window_days', 'locked_to_today',
        'max_consecutive_days', 'requires_proof', 'proof_threshold_days', 'active',
    ];

    protected function casts(): array
    {
        return [
            'min_tenure_months' => 'integer',
            'requires_balance' => 'boolean',
            'accrual_rate' => 'float',
            'max_carryover_days' => 'integer',
            'advance_notice_days' => 'integer',
            'retroactive_allowed' => 'boolean',
            'retroactive_window_days' => 'integer',
            'locked_to_today' => 'boolean',
            'max_consecutive_days' => 'integer',
            'requires_proof' => 'boolean',
            'proof_threshold_days' => 'integer',
            'active' => 'boolean',
        ];
    }

    /** @return list<string> */
    public static function activeCodes(): array
    {
        return static::where('active', true)->orderBy('id')->pluck('code')->all();
    }
}
