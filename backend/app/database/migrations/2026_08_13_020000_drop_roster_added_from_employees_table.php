<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            // Removed: the "registered but not yet on roster" two-step flow
            // was confusing (an employee could be saved successfully and
            // still not show up in the Employees list). Every employee now
            // appears immediately once created.
            $table->dropColumn('roster_added');
        });
    }

    public function down(): void
    {
        Schema::table('employees', function (Blueprint $table) {
            $table->boolean('roster_added')->default(true)->after('education');
        });
    }
};
