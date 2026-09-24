<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Automated shift scheduling no longer runs at a chosen weekday and hour: it keeps a window (1 week, 2 weeks
 * or 1 month) scheduled and checks every hour. The run-time columns are gone.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schedule_settings', function (Blueprint $table) {
            $table->dropColumn(['run_day', 'run_hour']);
        });
    }

    public function down(): void
    {
        Schema::table('schedule_settings', function (Blueprint $table) {
            $table->unsignedTinyInteger('run_day')->default(5);
            $table->unsignedTinyInteger('run_hour')->default(17);
        });
    }
};
