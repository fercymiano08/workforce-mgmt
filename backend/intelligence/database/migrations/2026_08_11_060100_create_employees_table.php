<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('employees', function (Blueprint $table) {
            $table->string('id')->primary();
            $table->string('first_name');
            $table->string('last_name');
            $table->string('email')->unique();
            $table->string('phone')->nullable();
            $table->string('department')->nullable();
            $table->string('position')->nullable();
            $table->string('employment_type')->default('Full-time');
            $table->string('status')->default('Active');
            $table->date('hire_date')->nullable();
            $table->decimal('salary', 12, 2)->default(0);
            $table->string('manager')->nullable();
            $table->text('avatar')->nullable();
            $table->text('address')->nullable();
            $table->date('date_of_birth')->nullable();
            $table->string('gender')->nullable();
            $table->string('blood_group')->nullable();
            $table->string('emergency_contact')->nullable();
            $table->string('emergency_phone')->nullable();
            $table->json('skills')->nullable();
            $table->json('education')->nullable();
            $table->boolean('roster_added')->default(false);
            $table->boolean('face_registered')->default(false);
            $table->longText('face_image')->nullable();
            $table->timestamp('face_registered_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('employees');
    }
};
