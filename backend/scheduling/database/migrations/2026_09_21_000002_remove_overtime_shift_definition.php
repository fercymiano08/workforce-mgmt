<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The company has exactly ONE shift: the 8-to-5 Flexible Shift. Overtime is not a
 * shift - it is time added to the end of that shift when an overtime request is
 * approved (the day's effective end becomes 5:00 PM + the approved hours). A
 * separate "Overtime Shift" (5-9 PM) template therefore must not exist, or
 * someone could be scheduled onto it.
 *
 * Removes it from any database that still has it - but only when no schedule
 * uses it, so existing history is never orphaned.
 */
return new class extends Migration
{
    public function up(): void
    {
        $inUse = DB::table('shift_schedules')->where('shift_id', 'SHIFT005')->exists();

        if (! $inUse) {
            DB::table('shift_definitions')->where('id', 'SHIFT005')->delete();
        }
    }

    public function down(): void
    {
        // Intentionally not restored: the Overtime Shift is not part of the design.
    }
};
