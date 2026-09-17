<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('attendance', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('employee_id')->index();
            $table->date('date');
            $table->time('clock_in')->nullable();
            $table->time('clock_out')->nullable();
            $table->string('status');
            $table->decimal('overtime', 6, 2)->default(0);
            $table->decimal('regular_hours', 6, 2)->default(0);
            $table->decimal('total_hours', 6, 2)->default(0);
            $table->decimal('break_hours', 6, 2)->default(0);
            $table->string('location')->default('Office');
            $table->text('notes')->nullable();
            $table->timestamps();

            $table->index(['employee_id', 'date']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('attendance');
    }
};
