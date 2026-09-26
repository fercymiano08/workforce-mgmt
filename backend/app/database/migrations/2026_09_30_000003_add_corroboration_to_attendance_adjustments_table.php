<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * What the machine evidence said about a claim at the moment it was filed.
 *
 * Approving a correction writes the admin's time into `actual_clock_out`, overwriting the very punch
 * the check is measured against. Without a snapshot the evidence is gone by the time anyone looks at
 * the request, and the audit trail would only ever record a comparison against itself. Frozen here,
 * the claim is judged against the punch that existed when the employee made it, and the audit log
 * carries that same snapshot.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('attendance_adjustments', function (Blueprint $table) {
            // List of {state: pass|warn|fail, label, detail}. `fail` claims are refused outright, so
            // anything stored here is pass or warn - kept for the admin, not to gate a decision.
            $table->json('corroboration')->nullable()->after('proof');
        });
    }

    public function down(): void
    {
        Schema::table('attendance_adjustments', function (Blueprint $table) {
            $table->dropColumn('corroboration');
        });
    }
};
