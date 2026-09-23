<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('analytics', function (Blueprint $table) {
            $table->id();
            $table->json('attendance_trend')->nullable();
            $table->json('department_productivity')->nullable();
            $table->json('leave_trend')->nullable();
            $table->json('overtime_summary')->nullable();
            $table->json('punctuality_score')->nullable();
            $table->json('payroll_discrepancy')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('analytics');
    }
};
