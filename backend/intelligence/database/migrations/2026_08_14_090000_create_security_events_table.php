<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('security_events', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('type'); // face_mismatch | pin_failed
            $table->string('message');
            $table->json('detail')->nullable();
            $table->string('employee_id')->nullable()->index();
            $table->string('status')->default('Open'); // Open | Resolved | Flagged
            $table->timestamp('resolved_at')->nullable();
            $table->string('resolved_by')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('security_events');
    }
};
