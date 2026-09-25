<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "My hours are wrong because something stopped me recording them."
 *
 * One table for all three emergencies, because they are the same problem wearing different clothes:
 *   unapproved_overtime - worked past the shift with no approved request in time
 *   missed_punch        - the kiosk/internet was down, nothing was recorded
 *   missing_clockout    - clocked in and never got a clock-out
 *
 * The employee states WHAT HAPPENED (claimed_time + a reason in their own words). They never state
 * how many hours they are owed - `derived_hours` is worked out from the scheduled shift by
 * AttendanceAdjustmentService, and only the approver can turn that into a real change.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance_adjustments', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('employee_id')->index();
            $table->string('employee_name');

            // The employee's manager at the moment they filed, resolved from the roster and frozen
            // here. Null when the roster names no manager - in that case the request goes straight
            // to an admin rather than sitting in a queue nobody can action.
            $table->string('manager_of_record')->nullable();
            $table->date('date');
            $table->string('type');

            // What the employee says happened - a clock time, never an hours figure.
            $table->time('claimed_time')->nullable();
            $table->text('reason');

            // Proof the employee attaches (photos of the error, a task ticket, a chat screenshot).
            $table->json('proof')->nullable();

            // The shift the numbers were derived from, kept so the derivation stays explainable
            // later even if the roster is edited after the fact.
            $table->time('shift_start')->nullable();
            $table->time('shift_end')->nullable();

            // System-computed, never taken from the request body.
            // `derived_hours` is what the day is worth once the correction lands; `derived_overtime`
            // is only the part of it that costs money, and it is what the second signature keys off.
            $table->decimal('derived_hours', 5, 2)->default(0);
            $table->decimal('derived_overtime', 5, 2)->default(0);
            $table->decimal('recorded_hours', 5, 2)->default(0);

            $table->string('status'); // Pending | Approved | Rejected | Cancelled

            // Overtime is money, so it takes a second signature (see the service).
            $table->boolean('requires_second_approval')->default(false);
            $table->string('manager_approved_by')->nullable();
            $table->timestamp('manager_approved_at')->nullable();
            $table->string('admin_approved_by')->nullable();
            $table->timestamp('admin_approved_at')->nullable();

            $table->string('decided_by')->nullable();
            $table->timestamp('decided_at')->nullable();
            $table->text('decision_note')->nullable();

            $table->date('requested_date');
            $table->timestamps();

            $table->index(['employee_id', 'date']);
            $table->index(['status', 'type']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance_adjustments');
    }
};
