<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Replica of overtime_requests owned by the Time Off service. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('overtime_requests', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('employee_id')->index();
            $table->string('employee_name');
            $table->date('date');
            $table->decimal('expected_hours', 5, 2)->nullable();
            $table->decimal('approved_hours', 5, 2)->nullable();
            $table->text('reason');
            $table->string('status');
            $table->date('requested_date');
            $table->string('approved_by')->nullable();
            $table->text('comments')->nullable();
            $table->timestamp('approved_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('overtime_requests');
    }
};