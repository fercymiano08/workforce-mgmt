<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * One attendance record per employee per day - enforced by the DATABASE, not just by
 * an application check. A check-then-insert can be beaten by two simultaneous requests
 * (Docker runs several workers per service); a unique index cannot.
 */
return new class extends Migration
{
    public function up(): void
    {
        $duplicates = DB::table('attendance')
            ->select('employee_id', 'date')
            ->groupBy('employee_id', 'date')
            ->havingRaw('count(*) > 1')
            ->count();

        if ($duplicates > 0) {
            throw new RuntimeException("Cannot add the unique index: {$duplicates} employee/date pair(s) already have more than one attendance record. Remove the duplicates first.");
        }

        Schema::table('attendance', function (Blueprint $table) {
            $table->unique(['employee_id', 'date'], 'attendance_employee_date_unique');
        });
    }

    public function down(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            $table->dropUnique('attendance_employee_date_unique');
        });
    }
};