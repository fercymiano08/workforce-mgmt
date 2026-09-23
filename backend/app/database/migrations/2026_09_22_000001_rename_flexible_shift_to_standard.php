<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The single 8-to-5 shift is now called "Standard Shift" (it was "Flexible Shift",
 * which wrongly suggested people could work any hours). Only the label changes - the
 * id, times and every schedule pointing at it stay exactly as they are.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('shift_definitions')->where('name', 'Flexible Shift')->update(['name' => 'Standard Shift']);
    }

    public function down(): void
    {
        DB::table('shift_definitions')->where('name', 'Standard Shift')->update(['name' => 'Flexible Shift']);
    }
};
