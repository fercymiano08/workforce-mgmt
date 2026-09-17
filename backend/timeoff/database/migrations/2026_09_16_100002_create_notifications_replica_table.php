<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Replica of notifications owned by the Communications service. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('notifications', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('type');
            $table->string('title');
            $table->text('message');
            $table->timestamp('timestamp');
            $table->boolean('read')->default(false);
            $table->string('employee_id')->nullable()->index();
            $table->string('priority')->default('low');
            $table->string('action_url')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('notifications');
    }
};