<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Weekly totals of the two attendance holiday-hours fields, same pattern as regular_hours/overtime_hours. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('timesheets', function (Blueprint $table) {
            $table->decimal('regular_holiday_hours', 6, 2)->default(0)->after('regular_hours');
            $table->decimal('special_holiday_hours', 6, 2)->default(0)->after('regular_holiday_hours');
        });
    }

    public function down(): void
    {
        Schema::table('timesheets', function (Blueprint $table) {
            $table->dropColumn(['regular_holiday_hours', 'special_holiday_hours']);
        });
    }
};
