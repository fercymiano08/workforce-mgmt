<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Three corrections to the leave rules, called out directly against the first version:
 *  - Special never had a distinct use case from Vacation/Bereavement once those two got their own
 *    rules - removed entirely rather than left inert.
 *  - Vacation had no max_consecutive_days, so a request could legally run for a year. Bereavement
 *    already had one (5 days); Vacation gets its own, separately, at 30 calendar days.
 *  - Sick leave requires same-day filing. That is a distinct rule from the retroactive-window idea
 *    (which still allows a few days back for every OTHER type that has one) and needed its own flag,
 *    not a repurposed existing field.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leave_types', function (Blueprint $table) {
            $table->boolean('locked_to_today')->default(false)->after('retroactive_window_days');
        });

        DB::table('leave_types')->where('code', 'Sick')->update([
            'locked_to_today' => true,
            'retroactive_allowed' => false,
            'retroactive_window_days' => 0,
        ]);

        DB::table('leave_types')->where('code', 'Vacation')->update(['max_consecutive_days' => 30]);

        DB::table('leave_types')->where('code', 'Special')->delete();
    }

    public function down(): void
    {
        Schema::table('leave_types', function (Blueprint $table) {
            $table->dropColumn('locked_to_today');
        });
    }
};
