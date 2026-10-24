<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Period totals of the two attendance minute fields, same pattern as regular_hours/overtime_hours. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('timesheets', function (Blueprint $table) {
            $table->unsignedInteger('late_minutes')->default(0)->after('break_hours');
            $table->unsignedInteger('undertime_minutes')->default(0)->after('late_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('timesheets', function (Blueprint $table) {
            $table->dropColumn(['late_minutes', 'undertime_minutes']);
        });
    }
};
