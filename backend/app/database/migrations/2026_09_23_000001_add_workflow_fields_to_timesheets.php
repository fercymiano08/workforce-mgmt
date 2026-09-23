<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * What a professional timesheet workflow has to remember: who submitted it and when (or that the
 * system did), who reviewed it and when, why it was sent back, whether attendance changed after it
 * was locked, when the employee/admin were reminded, and when it went to payroll. `history` keeps
 * every step in order so the whole life of a timesheet can be shown as a timeline.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('timesheets', function (Blueprint $table) {
            $table->timestamp('submitted_at')->nullable()->after('submitted_date');
            $table->string('submitted_by', 150)->nullable()->after('submitted_at');
            $table->boolean('auto_submitted')->default(false)->after('submitted_by');
            $table->timestamp('reviewed_at')->nullable()->after('approved_by');
            $table->text('status_reason')->nullable()->after('reviewed_at');
            $table->boolean('needs_refresh')->default(false)->after('status_reason');
            $table->timestamp('reminded_at')->nullable()->after('needs_refresh');
            $table->timestamp('nudged_at')->nullable()->after('reminded_at');
            $table->timestamp('exported_at')->nullable()->after('nudged_at');
            $table->json('history')->nullable()->after('exported_at');
        });

        // Timesheets that already went through review keep an honest trail of what we know.
        DB::table('timesheets')->whereIn('status', ['Submitted', 'Approved', 'Rejected'])->orderBy('id')->each(function ($row): void {
            $history = [];
            if ($row->submitted_date) {
                $history[] = ['event' => 'submitted', 'by' => null, 'at' => $row->submitted_date.'T00:00:00+00:00', 'note' => null];
            }
            if (in_array($row->status, ['Approved', 'Rejected'], true)) {
                $history[] = ['event' => strtolower($row->status), 'by' => $row->approved_by, 'at' => null, 'note' => null];
            }
            DB::table('timesheets')->where('id', $row->id)->update(['history' => json_encode($history)]);
        });
    }

    public function down(): void
    {
        Schema::table('timesheets', function (Blueprint $table) {
            $table->dropColumn([
                'submitted_at', 'submitted_by', 'auto_submitted', 'reviewed_at', 'status_reason',
                'needs_refresh', 'reminded_at', 'nudged_at', 'exported_at', 'history',
            ]);
        });
    }
};
