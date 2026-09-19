<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /*
    |--------------------------------------------------------------------------
    | EARLY CLOCK OUT (attendance-owned)
    |--------------------------------------------------------------------------
    | Records reality first, policy later. When an employee clocks out before
    | their scheduled end (plus approved overtime), the punch is stored on the
    | attendance row immediately - never blocked - and this table keeps the
    | documentation side: reason, proof, snapshot of the scheduled end, and the
    | post-hoc classification made by HR. This is deliberately separate from
    | Timeoff's leaves table: an early clock-out is a REPORT, not a REQUEST.
    |--------------------------------------------------------------------------
    */
    public function up(): void
    {
        Schema::create('early_clock_outs', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('attendance_id')->index();
            $table->string('employee_id')->index();
            $table->string('employee_name')->nullable();
            $table->date('date');
            $table->time('scheduled_end_time')->nullable(); // frozen at punch time
            $table->time('actual_clock_out_time');
            $table->integer('minutes_early')->default(0);
            $table->string('reason_code')->nullable(); // SICK|FAMILY_EMERGENCY|PERSONAL_EMERGENCY|APPROVED_LEAVE|OTHER
            $table->text('reason_note')->nullable();
            $table->json('proof')->nullable(); // uploaded attachments, like leaves.documents
            $table->string('reason_status')->default('PENDING'); // PROVIDED|PENDING
            $table->string('classification')->default('PENDING_REVIEW'); // PENDING_REVIEW|EXCUSED_SICK|EXCUSED_EMERGENCY|EXCUSED_EARLY_LEAVE|UNPAID
            $table->string('classified_by')->nullable();
            $table->timestamp('classified_at')->nullable();
            $table->boolean('notification_sent')->default(false);
            $table->timestamps();

            $table->index(['employee_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('early_clock_outs');
    }
};