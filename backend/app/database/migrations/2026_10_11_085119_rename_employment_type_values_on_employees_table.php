<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * "Full-time"/"Part-time"/"Contract" never matched how the Philippines actually classifies
     * employment (Regular, Contractual, Probationary), which a panel review flagged directly. The
     * registration form, the admin edit form and validation now only offer Regular/Contractual/
     * Part-time - "Probationary" is a status computed from hireDate (see Employee::isProbationary()),
     * not a type anyone picks - so this is a one-time relabel of whatever already exists in the
     * database (seeded demo employees included) to match. Nothing else about the row changes.
     */
    public function up(): void
    {
        DB::table('employees')->where('employment_type', 'Full-time')->update(['employment_type' => 'Regular']);
        DB::table('employees')->where('employment_type', 'Contract')->update(['employment_type' => 'Contractual']);
    }

    public function down(): void
    {
        DB::table('employees')->where('employment_type', 'Regular')->update(['employment_type' => 'Full-time']);
        DB::table('employees')->where('employment_type', 'Contractual')->update(['employment_type' => 'Contract']);
    }
};
