<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Some notification rows written early on carry dashes that were read with the wrong character set: an
 * en dash shows up as "â€“" and a middle dot as "Â·". The code that writes notifications today is fine
 * (new rows are correct), so this only repairs the old rows. Safe to run on every deploy: once repaired
 * there is nothing left to match.
 */
return new class extends Migration
{
    public function up(): void
    {
        $fixes = [
            "\u{e2}\u{20ac}\u{201c}" => "\u{2013}",   // en dash
            "\u{e2}\u{20ac}\u{201d}" => "\u{2014}",   // em dash
            "\u{c2}\u{b7}" => "\u{b7}",               // middle dot
        ];

        foreach (['title', 'message'] as $column) {
            foreach ($fixes as $bad => $good) {
                DB::table('notifications')
                    ->where($column, 'like', '%'.$bad.'%')
                    ->update([$column => DB::raw('REPLACE('.$column.', '.DB::getPdo()->quote($bad).', '.DB::getPdo()->quote($good).')')]);
            }
        }
    }

    public function down(): void
    {
        // Nothing to undo: the old text was a mistake, not data worth restoring.
    }
};
