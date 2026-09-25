<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Corrections now live inside Time & Attendance and follow a simpler flow: the employee files, the Workforce Admin
 * decides and, when approving, enters the final time by hand.
 *
 *   worked_past_shift  worked beyond the end of the shift (a clock-out that failed, or that was not counted)
 *   kiosk_clock_in     the kiosk failed to clock the employee in
 *   kiosk_clock_out    the kiosk failed to clock the employee out
 *
 * Requests already filed under the earlier names keep their meaning (unapproved_overtime -> worked_past_shift, ...).
 * The manager's second signature is gone (the flow is employee -> admin), and the time the admin actually entered is
 * kept next to the time the employee claimed.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['unapproved_overtime' => 'worked_past_shift', 'missed_punch' => 'kiosk_clock_in', 'missing_clockout' => 'kiosk_clock_out'] as $old => $new) {
            DB::table('attendance_adjustments')->where('type', $old)->update(['type' => $new]);
        }

        Schema::table('attendance_adjustments', function (Blueprint $table) {
            $table->time('final_time')->nullable();   // what the admin entered when approving (may differ from claimed_time)
        });

        Schema::table('attendance_adjustments', function (Blueprint $table) {
            foreach (['manager_of_record', 'requires_second_approval', 'manager_approved_by', 'manager_approved_at', 'admin_approved_by', 'admin_approved_at'] as $column) {
                if (Schema::hasColumn('attendance_adjustments', $column)) {
                    $table->dropColumn($column);
                }
            }
        });
    }

    public function down(): void
    {
        Schema::table('attendance_adjustments', function (Blueprint $table) {
            $table->dropColumn('final_time');
            $table->string('manager_of_record')->nullable();
            $table->boolean('requires_second_approval')->default(false);
            $table->string('manager_approved_by')->nullable();
            $table->timestamp('manager_approved_at')->nullable();
            $table->string('admin_approved_by')->nullable();
            $table->timestamp('admin_approved_at')->nullable();
        });

        foreach (['worked_past_shift' => 'unapproved_overtime', 'kiosk_clock_in' => 'missed_punch', 'kiosk_clock_out' => 'missing_clockout'] as $new => $old) {
            DB::table('attendance_adjustments')->where('type', $new)->update(['type' => $old]);
        }
    }
};
