<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The attendance service gained `actual_clock_out` (the real tap-out, next to the counted `clock_out`).
 * This service keeps a read-only copy of the attendance table, and its copy must have the same columns
 * or the once-a-minute sync from the attendance service fails.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('attendance', 'actual_clock_out')) {
            Schema::table('attendance', function (Blueprint $table) {
                $table->time('actual_clock_out')->nullable()->after('clock_out');
            });
        }
    }

    public function down(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            $table->dropColumn('actual_clock_out');
        });
    }
};
