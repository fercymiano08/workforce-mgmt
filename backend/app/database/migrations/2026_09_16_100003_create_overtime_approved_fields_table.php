<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds the overtime approval fields owned by the Time Off service
 * (approved_hours, approved_at on overtime_requests).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('overtime_requests', function (Blueprint $table) {
            $table->decimal('approved_hours', 5, 2)->nullable()->after('expected_hours');
            $table->timestamp('approved_at')->nullable()->after('comments');
        });
    }

    public function down(): void
    {
        Schema::table('overtime_requests', function (Blueprint $table) {
            $table->dropColumn(['approved_hours', 'approved_at']);
        });
    }
};