<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Replica of settings owned by the Configuration service. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('settings', function (Blueprint $table) {
            $table->id();
            $table->json('profile')->nullable();
            $table->json('appearance')->nullable();
            $table->json('notifications')->nullable();
            $table->json('security')->nullable();
            $table->json('system')->nullable();
            $table->json('company')->nullable();
            $table->json('kiosk')->nullable();
            $table->json('ai_resolved_insights')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('settings');
    }
};