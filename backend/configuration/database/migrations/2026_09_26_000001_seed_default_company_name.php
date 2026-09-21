<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * A fresh install used to start with no company details at all, so the Company Information form was blank.
 * Fill in the company NAME only when none is recorded; the address and contact details are left for the
 * administrator to enter (they are never guessed), and anything already saved is kept.
 */
return new class extends Migration
{
    public function up(): void
    {
        $row = DB::table('settings')->first();
        if (! $row) {
            return;
        }

        $company = json_decode($row->company ?? 'null', true) ?: [];
        if (! empty($company['name'])) {
            return;
        }

        $company['name'] = 'Archon Nell Incorporated';
        DB::table('settings')->where('id', $row->id)->update(['company' => json_encode($company)]);
    }

    public function down(): void
    {
        // The name is data the administrator may have edited; nothing to undo.
    }
};
