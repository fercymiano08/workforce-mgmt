<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('timesheets', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('employee_id')->index();
            $table->string('employee_name');
            $table->string('department');
            $table->date('date');
            $table->date('week_start');
            $table->date('week_end');
            $table->decimal('regular_hours', 6, 2)->default(0);
            $table->decimal('overtime_hours', 6, 2)->default(0);
            $table->decimal('break_hours', 6, 2)->default(0);
            $table->decimal('total_hours', 6, 2)->default(0);
            $table->string('status');
            $table->date('submitted_date')->nullable();
            $table->string('approved_by')->nullable();
            $table->text('notes')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('timesheets');
    }
};
