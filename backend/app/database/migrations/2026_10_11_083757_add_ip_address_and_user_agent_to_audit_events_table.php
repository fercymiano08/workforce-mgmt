<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * A professional audit log records where an action came from, not just who and what. Both
     * columns are filled in automatically by AuditLogger::record() from the current request, so no
     * call site anywhere in the app needs to change.
     */
    public function up(): void
    {
        Schema::table('audit_events', function (Blueprint $table) {
            $table->string('ip_address', 45)->nullable()->after('actor_id'); // 45 fits a full IPv6 address
            $table->string('user_agent', 255)->nullable()->after('ip_address');
        });
    }

    public function down(): void
    {
        Schema::table('audit_events', function (Blueprint $table) {
            $table->dropColumn(['ip_address', 'user_agent']);
        });
    }
};
