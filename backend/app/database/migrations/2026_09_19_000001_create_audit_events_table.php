<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Append-only audit log.
     *
     * Intentional design facts:
     *  - No updated_at column and $timestamps = false on the model: a row can
     *    never be mutated in place, only ever appended (or read).
     *  - No REST endpoints exist (or will exist) for updating or deleting rows.
     *  - Writes come only from AuditLogger::record(); the frontend has no write path into it.
     */
    public function up(): void
    {
        Schema::create('audit_events', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->string('service', 40)->index();          // owning microservice, e.g. attendance
            $table->string('event', 120)->index();           // e.g. attendance.punch_corrected
            $table->string('entity_type', 40)->index();      // e.g. Attendance
            $table->string('entity_id', 40)->nullable()->index();
            $table->string('actor', 150)->nullable();        // who (name/email)
            $table->string('actor_id', 40)->nullable();      // employee id or user id when known
            $table->json('before')->nullable();              // prior state (snapshot)
            $table->json('after')->nullable();               // new state (snapshot)
            $table->json('meta')->nullable();                // extra context (ip, link ids, etc.)
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('audit_events');
    }
};