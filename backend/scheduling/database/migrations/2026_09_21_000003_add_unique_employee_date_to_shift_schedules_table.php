<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One shift per employee per day - enforced by the database (see the attendance
 * migration for why an application check alone is not enough).
 */
return new class extends Migration
{
    public function up(): void
    {
        $duplicates = DB::table('shift_schedules')
            ->select('employee_id', 'date')
            ->groupBy('employee_id', 'date')
            ->havingRaw('count(*) > 1')
            ->count();

        if ($duplicates > 0) {
            throw new RuntimeException("Cannot add the unique index: {$duplicates} employee/date pair(s) already have more than one shift. Remove the duplicates first.");
        }

        Schema::table('shift_schedules', function (Blueprint $table) {
            $table->unique(['employee_id', 'date'], 'shift_schedules_employee_date_unique');
        });
    }

    public function down(): void
    {
        Schema::table('shift_schedules', function (Blueprint $table) {
            $table->dropUnique('shift_schedules_employee_date_unique');
        });
    }
};