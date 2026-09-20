<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * HR-relevant context recorded at classification time: why the system
     * auto-classified a record as UNPAID (rolling early-out threshold) or why
     * a medical certificate became required. Never overwrites the employee's
     * own reason_note - it is a separate field.
     */
    public function up(): void
    {
        Schema::table('early_clock_outs', function (Blueprint $table) {
            $table->text('classification_note')->nullable()->after('classification');
        });
    }

    public function down(): void
    {
        Schema::table('early_clock_outs', function (Blueprint $table) {
            $table->dropColumn('classification_note');
        });
    }
};