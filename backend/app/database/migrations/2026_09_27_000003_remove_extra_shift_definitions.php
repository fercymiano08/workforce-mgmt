<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The company has exactly ONE shift: the 8-to-5 Standard Shift (see
 * remove_overtime_shift_definition.php for the earlier half of this cleanup).
 * Morning/Afternoon/Night were leftover template options nobody uses - the client
 * only ever discussed the one 8-to-5 shift. Removes them from any database that
 * still has them, but only when no schedule uses them, so existing history is
 * never orphaned.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['SHIFT001', 'SHIFT002', 'SHIFT003'] as $id) {
            $inUse = DB::table('shift_schedules')->where('shift_id', $id)->exists();
            if (! $inUse) {
                DB::table('shift_definitions')->where('id', $id)->delete();
            }
        }
    }

    public function down(): void
    {
        // Intentionally not restored: Morning/Afternoon/Night are not part of the design.
    }
};
