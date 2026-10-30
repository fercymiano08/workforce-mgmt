<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Adds the Philippine statutory leave types that were missing from the initial
 * seed (Solo Parent, VAWC, Special Leave for Women, Service Incentive Leave).
 * Additive only - existing rows are untouched.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();
        $rows = [
            ['id' => 'LVT008', 'code' => 'SoloParent', 'name' => 'Solo Parent Leave', 'applicable_gender' => 'Any',
                'min_tenure_months' => 0, 'pay_type' => 'PaidWithoutBalance', 'requires_balance' => false,
                'accrual_policy' => 'None', 'accrual_rate' => 0, 'max_carryover_days' => null,
                'advance_notice_days' => 0, 'retroactive_allowed' => false, 'retroactive_window_days' => 0,
                'max_consecutive_days' => 7, 'requires_proof' => true, 'proof_threshold_days' => 0],
            ['id' => 'LVT009', 'code' => 'VAWC', 'name' => 'VAWC Leave', 'applicable_gender' => 'Female',
                'min_tenure_months' => 0, 'pay_type' => 'PaidWithoutBalance', 'requires_balance' => false,
                'accrual_policy' => 'None', 'accrual_rate' => 0, 'max_carryover_days' => null,
                'advance_notice_days' => 0, 'retroactive_allowed' => true, 'retroactive_window_days' => 5,
                'max_consecutive_days' => 10, 'requires_proof' => true, 'proof_threshold_days' => 0],
            ['id' => 'LVT010', 'code' => 'SpecialLeaveWomen', 'name' => 'Special Leave for Women', 'applicable_gender' => 'Female',
                'min_tenure_months' => 6, 'pay_type' => 'PaidWithoutBalance', 'requires_balance' => false,
                'accrual_policy' => 'None', 'accrual_rate' => 0, 'max_carryover_days' => null,
                'advance_notice_days' => 0, 'retroactive_allowed' => true, 'retroactive_window_days' => 5,
                'max_consecutive_days' => 60, 'requires_proof' => true, 'proof_threshold_days' => 0],
            ['id' => 'LVT011', 'code' => 'SIL', 'name' => 'Service Incentive Leave', 'applicable_gender' => 'Any',
                'min_tenure_months' => 12, 'pay_type' => 'PaidWithBalance', 'requires_balance' => true,
                'accrual_policy' => 'Monthly', 'accrual_rate' => 0.42, 'max_carryover_days' => 5,
                'advance_notice_days' => 3, 'retroactive_allowed' => false, 'retroactive_window_days' => 0,
                'max_consecutive_days' => null, 'requires_proof' => false, 'proof_threshold_days' => 0],
        ];

        foreach ($rows as $row) {
            DB::table('leave_types')->insertOrIgnore([
                ...$row,
                'active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        DB::table('leave_types')->whereIn('code', ['SoloParent', 'VAWC', 'SpecialLeaveWomen', 'SIL'])->delete();
    }
};