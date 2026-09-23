<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A generated timesheet used to be saved as "Pending", a status nothing else understands: the
 * employee's Submit button and the server both look for "Draft", so those timesheets could never be
 * submitted and never reached the Workforce Admin. Generated timesheets now start as "Draft"; this
 * moves the ones already saved.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('timesheets')->where('status', 'Pending')->update(['status' => 'Draft']);
    }

    public function down(): void
    {
        // Not restored: "Pending" was never a valid status.
    }
};
