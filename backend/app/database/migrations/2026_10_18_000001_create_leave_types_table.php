<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Every rule a leave type carries, configurable by the Workforce Admin instead of hardcoded in
 * LeaveController. Seeded here with the 7 types that already exist as plain strings on `leaves`,
 * translating today's hardcoded checks 1:1 so behavior does not silently change at cutover - the
 * two deliberate exceptions (Unpaid loses its old balance check but gains max_consecutive_days;
 * Sick/Bereavement gain a real requires_proof flag) are called out inline below.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_types', function (Blueprint $table) {
            $table->string('id', 20)->primary();
            $table->string('code', 30)->unique();
            $table->string('name', 100);
            $table->string('applicable_gender', 10)->default('Any'); // Any | Male | Female
            $table->unsignedInteger('min_tenure_months')->default(0);
            $table->string('pay_type', 30); // PaidWithBalance | PaidWithoutBalance | Unpaid
            $table->boolean('requires_balance')->default(false);
            $table->string('accrual_policy', 20)->default('None'); // None | Monthly
            $table->decimal('accrual_rate', 5, 2)->default(0); // days granted per month
            $table->unsignedInteger('max_carryover_days')->nullable(); // null = no cap enforced
            $table->unsignedInteger('advance_notice_days')->default(0);
            $table->boolean('retroactive_allowed')->default(false);
            $table->unsignedInteger('retroactive_window_days')->default(0);
            $table->unsignedInteger('max_consecutive_days')->nullable(); // calendar days, not working days
            $table->boolean('requires_proof')->default(false);
            $table->unsignedInteger('proof_threshold_days')->default(0);
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        $now = now();
        $rows = [
            ['id' => 'LVT001', 'code' => 'Vacation', 'name' => 'Vacation Leave', 'applicable_gender' => 'Any',
                'min_tenure_months' => 6, 'pay_type' => 'PaidWithBalance', 'requires_balance' => true,
                'accrual_policy' => 'Monthly', 'accrual_rate' => 1.67, 'max_carryover_days' => 5,
                'advance_notice_days' => 7, 'retroactive_allowed' => false, 'retroactive_window_days' => 0,
                'max_consecutive_days' => null, 'requires_proof' => false, 'proof_threshold_days' => 0],
            ['id' => 'LVT002', 'code' => 'Sick', 'name' => 'Sick Leave', 'applicable_gender' => 'Any',
                'min_tenure_months' => 0, 'pay_type' => 'PaidWithBalance', 'requires_balance' => true,
                'accrual_policy' => 'Monthly', 'accrual_rate' => 0.83, 'max_carryover_days' => 5,
                'advance_notice_days' => 0, 'retroactive_allowed' => true, 'retroactive_window_days' => 7,
                'max_consecutive_days' => null, 'requires_proof' => true, 'proof_threshold_days' => 2],
            ['id' => 'LVT003', 'code' => 'Special', 'name' => 'Special Leave', 'applicable_gender' => 'Any',
                'min_tenure_months' => 6, 'pay_type' => 'PaidWithBalance', 'requires_balance' => true,
                'accrual_policy' => 'Monthly', 'accrual_rate' => 0.42, 'max_carryover_days' => 0,
                'advance_notice_days' => 0, 'retroactive_allowed' => false, 'retroactive_window_days' => 0,
                'max_consecutive_days' => null, 'requires_proof' => false, 'proof_threshold_days' => 0],
            // Not balance-requiring: paid in full, but bounded by max_consecutive_days instead of an annual ledger.
            ['id' => 'LVT004', 'code' => 'Bereavement', 'name' => 'Bereavement Leave', 'applicable_gender' => 'Any',
                'min_tenure_months' => 0, 'pay_type' => 'PaidWithoutBalance', 'requires_balance' => false,
                'accrual_policy' => 'None', 'accrual_rate' => 0, 'max_carryover_days' => null,
                'advance_notice_days' => 0, 'retroactive_allowed' => true, 'retroactive_window_days' => 2,
                'max_consecutive_days' => 5, 'requires_proof' => true, 'proof_threshold_days' => 0],
            ['id' => 'LVT005', 'code' => 'Maternity', 'name' => 'Maternity Leave', 'applicable_gender' => 'Female',
                'min_tenure_months' => 0, 'pay_type' => 'PaidWithoutBalance', 'requires_balance' => false,
                'accrual_policy' => 'None', 'accrual_rate' => 0, 'max_carryover_days' => null,
                'advance_notice_days' => 0, 'retroactive_allowed' => false, 'retroactive_window_days' => 0,
                'max_consecutive_days' => 105, 'requires_proof' => true, 'proof_threshold_days' => 0],
            ['id' => 'LVT006', 'code' => 'Paternity', 'name' => 'Paternity Leave', 'applicable_gender' => 'Male',
                'min_tenure_months' => 0, 'pay_type' => 'PaidWithoutBalance', 'requires_balance' => false,
                'accrual_policy' => 'None', 'accrual_rate' => 0, 'max_carryover_days' => null,
                'advance_notice_days' => 0, 'retroactive_allowed' => false, 'retroactive_window_days' => 0,
                'max_consecutive_days' => 7, 'requires_proof' => true, 'proof_threshold_days' => 0],
            // Unpaid loses the old 30-day BALANCE check (real unpaid leave shouldn't consume a paid
            // allowance) but gains a max_consecutive_days cap instead, so it stays bounded by
            // something concrete. Deliberately no running annual cap - one long unpaid leave vs.
            // many short ones is not tracked.
            ['id' => 'LVT007', 'code' => 'Unpaid', 'name' => 'Unpaid Leave', 'applicable_gender' => 'Any',
                'min_tenure_months' => 0, 'pay_type' => 'Unpaid', 'requires_balance' => false,
                'accrual_policy' => 'None', 'accrual_rate' => 0, 'max_carryover_days' => null,
                'advance_notice_days' => 0, 'retroactive_allowed' => false, 'retroactive_window_days' => 0,
                'max_consecutive_days' => 30, 'requires_proof' => false, 'proof_threshold_days' => 0],
        ];

        foreach ($rows as $row) {
            DB::table('leave_types')->insert([
                ...$row,
                'active' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_types');
    }
};
