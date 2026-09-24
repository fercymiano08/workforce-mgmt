<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Automated scheduling keeps a CALENDAR period scheduled - this week, this week and next, this month, or next
 * month - instead of a number of weeks counted from tomorrow. The setting becomes a named window.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schedule_settings', function (Blueprint $table) {
            $table->string('window', 20)->default('week')->after('auto_enabled');
        });

        // 1 -> this week, 2 -> two weeks, 3/4 (the old "1 month") -> this month, 0 (the old "next month") -> next month
        foreach (DB::table('schedule_settings')->get(['id', 'weeks_ahead']) as $row) {
            $window = match ((int) $row->weeks_ahead) {
                0 => 'next_month',
                2 => 'two_weeks',
                3, 4 => 'month',
                default => 'week',
            };
            DB::table('schedule_settings')->where('id', $row->id)->update(['window' => $window]);
        }

        Schema::table('schedule_settings', function (Blueprint $table) {
            $table->dropColumn('weeks_ahead');
        });
    }

    public function down(): void
    {
        Schema::table('schedule_settings', function (Blueprint $table) {
            $table->unsignedTinyInteger('weeks_ahead')->default(1);
        });
        foreach (DB::table('schedule_settings')->get(['id', 'window']) as $row) {
            $weeks = ['next_month' => 0, 'two_weeks' => 2, 'month' => 4][$row->window] ?? 1;
            DB::table('schedule_settings')->where('id', $row->id)->update(['weeks_ahead' => $weeks]);
        }
        Schema::table('schedule_settings', function (Blueprint $table) {
            $table->dropColumn('window');
        });
    }
};
