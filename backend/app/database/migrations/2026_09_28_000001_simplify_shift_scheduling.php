<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Automated shift scheduling became one on-demand flow (period -> shift requirement -> generate -> review -> approve),
 * so everything the earlier "keep the window scheduled by itself" version needed is removed: the automatic switch,
 * the window and default shift, per-department work patterns, coverage rules and the history of runs.
 *
 * Kept: schedule_settings (the company's usual work days, which leave counting reads, plus the weekly-hours limit
 * the generator respects) and holidays (leave counting and the generator both skip them).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('schedule_settings', function (Blueprint $table) {
            foreach (['auto_enabled', 'window', 'shift_id'] as $column) {
                if (Schema::hasColumn('schedule_settings', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
        Schema::table('schedule_settings', function (Blueprint $table) {
            $table->unsignedSmallInteger('max_weekly_hours')->default(48);
        });

        foreach (['schedule_batch_items', 'schedule_batches', 'coverage_rules', 'work_patterns'] as $tableName) {
            Schema::dropIfExists($tableName);
        }
    }

    public function down(): void
    {
        Schema::table('schedule_settings', function (Blueprint $table) {
            $table->dropColumn('max_weekly_hours');
            $table->boolean('auto_enabled')->default(false);
            $table->string('window', 20)->default('week');
            $table->string('shift_id', 20)->nullable();
        });
    }
};
