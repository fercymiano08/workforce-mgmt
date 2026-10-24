<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Hours worked on a holiday are no longer counted as plain regular_hours - ShiftHours::count()
 * now moves them into one of these two instead, so the same hour is never paid at both the
 * regular rate and the holiday rate.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            $table->decimal('regular_holiday_hours', 6, 2)->default(0)->after('regular_hours');
            $table->decimal('special_holiday_hours', 6, 2)->default(0)->after('regular_holiday_hours');
        });
    }

    public function down(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            $table->dropColumn(['regular_holiday_hours', 'special_holiday_hours']);
        });
    }
};
