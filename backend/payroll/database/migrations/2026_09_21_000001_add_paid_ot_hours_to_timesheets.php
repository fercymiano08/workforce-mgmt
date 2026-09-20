<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * paid_ot_hours = the overtime that is actually PAYABLE for the week: per day,
 * the smaller of (overtime really worked) and (overtime approved for that day).
 *
 * Before this, payroll paid the whole approved amount even when the employee
 * clocked out on time (approved 2h, worked 0h, still paid 2h), and time worked
 * without any approval was never separated from the paid figure. approved_ot_hours
 * keeps its meaning (what HR approved) so the timesheet can still show
 * "approved vs worked"; only this new column drives pay.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('timesheets', function (Blueprint $table) {
            $table->decimal('paid_ot_hours', 5, 2)->default(0)->after('approved_ot_hours');
        });

        // Backfill existing weeks conservatively: never more than was worked, never
        // more than was approved. (Small table; done in PHP so it is DB-agnostic.)
        DB::table('timesheets')->orderBy('id')->each(function ($row): void {
            DB::table('timesheets')->where('id', $row->id)->update([
                'paid_ot_hours' => round(min((float) ($row->overtime_hours ?? 0), (float) ($row->approved_ot_hours ?? 0)), 2),
            ]);
        });
    }

    public function down(): void
    {
        Schema::table('timesheets', function (Blueprint $table) {
            $table->dropColumn('paid_ot_hours');
        });
    }
};
