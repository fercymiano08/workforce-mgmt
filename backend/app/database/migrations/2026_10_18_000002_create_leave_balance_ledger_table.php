<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Append-only history of every leave-balance change: accrual, usage, manual adjustment,
 * expiration, carryover. The current balance for (employee, type) is always SUM(days_delta) -
 * balance_after is a display-only snapshot, never read as the source of truth. Mirrors
 * AuditEvent's shape (no updated_at; rows are never rewritten in place).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('leave_balance_ledger', function (Blueprint $table) {
            $table->id();
            $table->string('employee_id', 20)->index();
            $table->string('leave_type_code', 30)->index();
            $table->string('entry_type', 20); // Accrual | Usage | Adjustment | Expiration | Carryover
            $table->decimal('days_delta', 6, 2);
            $table->decimal('balance_after', 6, 2);
            $table->string('reference_id', 20)->nullable(); // a Leave id, or null for system jobs
            $table->text('reason')->nullable(); // mandatory (enforced in controller) for Adjustment only
            $table->string('performed_by', 150)->nullable(); // admin name, or literal 'SYSTEM'
            $table->timestamp('created_at')->useCurrent();

            $table->index(['employee_id', 'leave_type_code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('leave_balance_ledger');
    }
};
