<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * "Bereavement" leave is now called "Funeral" leave. Renames the key inside every
 * employee's stored leave_balances JSON, and any leave request already filed under
 * the old name, so nothing shows the old label after the code change.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('leaves')->where('leave_type', 'Bereavement')->update(['leave_type' => 'Funeral']);

        DB::table('employees')->whereNotNull('leave_balances')->orderBy('id')->each(function ($row): void {
            $balances = json_decode($row->leave_balances, true);
            if (! is_array($balances)) {
                return;
            }

            $changed = false;
            foreach ($balances as &$entry) {
                if (is_array($entry) && ($entry['type'] ?? null) === 'Bereavement') {
                    $entry['type'] = 'Funeral';
                    $changed = true;
                }
            }
            unset($entry);

            if ($changed) {
                DB::table('employees')->where('id', $row->id)->update(['leave_balances' => json_encode($balances)]);
            }
        });
    }

    public function down(): void
    {
        DB::table('leaves')->where('leave_type', 'Funeral')->update(['leave_type' => 'Bereavement']);

        DB::table('employees')->whereNotNull('leave_balances')->orderBy('id')->each(function ($row): void {
            $balances = json_decode($row->leave_balances, true);
            if (! is_array($balances)) {
                return;
            }

            $changed = false;
            foreach ($balances as &$entry) {
                if (is_array($entry) && ($entry['type'] ?? null) === 'Funeral') {
                    $entry['type'] = 'Bereavement';
                    $changed = true;
                }
            }
            unset($entry);

            if ($changed) {
                DB::table('employees')->where('id', $row->id)->update(['leave_balances' => json_encode($balances)]);
            }
        });
    }
};
