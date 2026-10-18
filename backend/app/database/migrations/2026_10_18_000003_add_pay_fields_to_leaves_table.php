<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * How a leave request resolved, snapshotted once at submission and never recomputed - the
 * literal paid/unpaid answer the panel asked for, instead of "Unpaid" being just another string.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('leaves', function (Blueprint $table) {
            $table->string('pay_type', 30)->nullable()->after('days');
            $table->decimal('paid_days', 6, 2)->nullable()->after('pay_type');
            $table->decimal('unpaid_days', 6, 2)->nullable()->after('paid_days');
        });
    }

    public function down(): void
    {
        Schema::table('leaves', function (Blueprint $table) {
            $table->dropColumn(['pay_type', 'paid_days', 'unpaid_days']);
        });
    }
};
