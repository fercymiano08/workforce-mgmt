<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A SICK early clock-out cannot be verified at the kiosk, so it must be backed by
 * proof (a medical certificate) within a deadline. proof_due_at is that deadline;
 * when it passes with no proof attached, the record automatically becomes unexcused.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('early_clock_outs', function (Blueprint $table) {
            $table->timestamp('proof_due_at')->nullable()->after('reason_status');
        });
    }

    public function down(): void
    {
        Schema::table('early_clock_outs', function (Blueprint $table) {
            $table->dropColumn('proof_due_at');
        });
    }
};
