<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Renames the operator role label from "Workforce Admin" to "HR Admin"
 * in existing rows (the code/seeder already use the new label).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('users')
            ->where('role_label', 'Workforce Admin')
            ->update(['role_label' => 'HR Admin']);
    }

    public function down(): void
    {
        DB::table('users')
            ->where('role_label', 'HR Admin')
            ->update(['role_label' => 'Workforce Admin']);
    }
};