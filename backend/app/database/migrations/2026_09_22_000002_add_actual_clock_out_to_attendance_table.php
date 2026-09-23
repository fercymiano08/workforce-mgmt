<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * `clock_out` now holds the COUNTED end of the day (never later than the shift end plus approved
 * overtime). The moment the person really tapped out is kept here, so time that was not counted
 * can still be counted later if HR approves an overtime request for that day.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            $table->time('actual_clock_out')->nullable()->after('clock_out');
        });

        DB::table('attendance')->whereNotNull('clock_out')->update(['actual_clock_out' => DB::raw('clock_out')]);
    }

    public function down(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            $table->dropColumn('actual_clock_out');
        });
    }
};
