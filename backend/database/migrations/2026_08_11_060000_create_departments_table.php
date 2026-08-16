<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('departments', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('name');
            $table->string('head')->nullable();
            $table->string('head_id')->nullable();
            $table->unsignedInteger('employee_count')->default(0);
            $table->decimal('budget', 14, 2)->default(0);
            $table->string('location')->nullable();
            $table->text('description')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('departments');
    }
};
