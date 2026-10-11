<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * "Emergency" was folded into "Special" and "Funeral" was renamed "Bereavement" when the leave
     * types were overhauled (see Employee::defaultLeaveBalances()) - a panel review walked through
     * each type and flagged both as confusing. This is a one-time relabel of whatever already
     * exists in the database (seeded demo leave requests included) to match. Nothing else about
     * the row changes, and 'Half Day' - never a canonical type - is left exactly as it was.
     */
    public function up(): void
    {
        DB::table('leaves')->where('leave_type', 'Emergency')->update(['leave_type' => 'Special']);
        DB::table('leaves')->where('leave_type', 'Funeral')->update(['leave_type' => 'Bereavement']);
    }

    public function down(): void
    {
        DB::table('leaves')->where('leave_type', 'Bereavement')->update(['leave_type' => 'Funeral']);
        // 'Emergency' rows cannot be told apart from genuine 'Special' rows after the up() merge,
        // so the down migration intentionally does not try to split them back apart.
    }
};
