<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * The system cannot schedule anyone without at least one shift template: the
 * Assign Shift form has nothing to pick and schedule generation is refused
 * (`shiftId` must exist). Shift definitions have no create/delete screen, so
 * they can only come from the database itself.
 *
 * This puts the one standard template (the 8-to-5 Flexible Shift) in place on any database that does not
 * have them (a fresh install, a Docker start, or one whose demo seed was never
 * run). It never touches an existing row, so it is safe to run repeatedly.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        foreach ([
            ['id' => 'SHIFT004', 'name' => 'Flexible Shift', 'start_time' => '08:00:00', 'end_time' => '17:00:00', 'color' => '#3B82F6'],
        ] as $shift) {
            DB::table('shift_definitions')->insertOrIgnore($shift + ['created_at' => $now, 'updated_at' => $now]);
        }
    }

    public function down(): void
    {
        // Reference data: intentionally left in place.
    }
};
