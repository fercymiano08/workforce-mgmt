<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lateness and undertime existed only as a status label ("Late" / "Early Leave") with no actual
 * minute figure - fine for the dashboard, useless for payroll, which needs a number to deduct
 * against. is_rest_day makes "scheduled day off" its own flag instead of something inferred, so it
 * can coexist with holiday_type and a leave day on the same attendance row instead of fighting for
 * one status slot.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            $table->unsignedInteger('late_minutes')->default(0)->after('status');
            $table->unsignedInteger('undertime_minutes')->default(0)->after('late_minutes');
            $table->boolean('is_rest_day')->default(false)->after('undertime_minutes');
        });
    }

    public function down(): void
    {
        Schema::table('attendance', function (Blueprint $table) {
            $table->dropColumn(['late_minutes', 'undertime_minutes', 'is_rest_day']);
        });
    }
};
