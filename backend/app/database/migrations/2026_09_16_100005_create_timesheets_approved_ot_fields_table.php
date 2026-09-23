<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the approved overtime hours field owned by the Payroll service
 * (approved_ot_hours on timesheets).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('timesheets', function (Blueprint $table) {
            $table->decimal('approved_ot_hours', 5, 2)->nullable()->after('overtime_hours');
        });
    }

    public function down(): void
    {
        Schema::table('timesheets', function (Blueprint $table) {
            $table->dropColumn('approved_ot_hours');
        });
    }
};