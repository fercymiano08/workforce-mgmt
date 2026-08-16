<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('overtime_requests', function (Blueprint $table) {
            $table->decimal('approved_hours', 5, 2)->nullable()->after('expected_hours');
            $table->timestamp('approved_at')->nullable()->after('comments');
        });

        Schema::table('timesheets', function (Blueprint $table) {
            $table->decimal('approved_ot_hours', 5, 2)->nullable()->after('overtime_hours');
        });
    }

    public function down(): void
    {
        Schema::table('overtime_requests', function (Blueprint $table) {
            $table->dropColumn(['approved_hours', 'approved_at']);
        });

        Schema::table('timesheets', function (Blueprint $table) {
            $table->dropColumn('approved_ot_hours');
        });
    }
};
