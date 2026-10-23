<?php

namespace App\Console\Commands;

use App\Models\Analytics;
use App\Models\Setting;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Wipes every employee and everything derived from employees - attendance, schedules, leaves,
 * the leave ledger, overtime, timesheets, notifications, and the audit/security trail - leaving
 * only the admin login and the org structure (departments, roles, leave types, settings,
 * holidays, shift definitions) in place, ready for a from-scratch demo.
 *
 * Also flips settings.system.demo_seeding_disabled on, so DatabaseSeeder refuses to reseed the
 * demo employees back in on the next deploy just because the table is empty again - that flag,
 * not SEED_DEMO_DATA, is what made the wipe stick last time.
 *
 * One-way: there is no undo once this runs against a database with no other backup.
 */
class ResetToAdminOnly extends Command
{
    protected $signature = 'system:reset-to-admin-only {--force : Skip the confirmation prompt}';

    protected $description = 'Deletes all employee, attendance, schedule, leave, timesheet, notification and audit data, keeping only the admin account and org structure.';

    private const WIPE_TABLES = [
        'attendance_adjustments',
        'early_clock_outs',
        'attendance',
        'leave_balance_ledger',
        'leaves',
        'overtime_requests',
        'timesheets',
        'shift_schedules',
        'notifications',
        'security_events',
        'two_factor_challenges',
        'personal_access_tokens',
        'audit_events',
        'employees',
    ];

    public function handle(): int
    {
        if (! $this->option('force') && ! $this->confirm(
            'This permanently deletes every employee, attendance, schedule, leave, timesheet, '
            .'notification and audit record, and every non-admin login. Continue?'
        )) {
            $this->info('Cancelled.');

            return self::SUCCESS;
        }

        DB::transaction(function () {
            foreach (self::WIPE_TABLES as $table) {
                DB::table($table)->truncate();
            }

            Analytics::query()->update([
                'attendance_trend' => json_encode([]),
                'department_productivity' => json_encode([]),
                'leave_trend' => json_encode([]),
                'overtime_summary' => json_encode([]),
                'punctuality_score' => json_encode([]),
            ]);

            DB::table('users')->where('email', '!=', 'admin@workforcepro.com')->delete();

            $setting = Setting::find(1);
            $system = $setting?->system ?? [];
            $system['demo_seeding_disabled'] = true;
            Setting::updateOrCreate(['id' => 1], ['system' => $system]);
        });

        $this->info('Done. Only the admin account, departments, roles, leave types, holidays and settings remain.');
        $this->info('Demo seeding is now permanently disabled - a future deploy will not bring it back.');

        return self::SUCCESS;
    }
}
