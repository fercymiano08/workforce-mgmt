<?php

namespace Tests;

use App\Models\Department;
use App\Models\Role;
use App\Models\Setting;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use App\Models\User;
use App\Services\KioskDeviceToken;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;
use Illuminate\Support\Carbon;

abstract class TestCase extends BaseTestCase
{
    /** The fixed day the kiosk tests run on (a Monday). */
    protected const KIOSK_TEST_DATE = '2026-09-21';

    /**
     * Pins "now" to $time on KIOSK_TEST_DATE in the kiosk's timezone (Asia/Manila).
     * The server - not the terminal - decides the clock-in time and Present/Late,
     * so a kiosk clock-in test must control the clock. Returns the date key.
     */
    protected function freezeKioskClock(string $time = '08:00:00'): string
    {
        $this->travelTo(Carbon::parse(self::KIOSK_TEST_DATE.' '.$time, 'Asia/Manila'));

        return self::KIOSK_TEST_DATE;
    }

    /** Gives the employee a scheduled shift on the given date (default: the kiosk test day). */
    protected function scheduleShift(string $employeeId, string $start = '08:00:00', string $end = '17:00:00', ?string $date = null): void
    {
        ShiftDefinition::firstOrCreate(['id' => 'SHIFT-T'.substr($start, 0, 2).substr($end, 0, 2)], [
            'name' => "Test Shift {$start}-{$end}",
            'start_time' => $start,
            'end_time' => $end,
            'color' => '#3B82F6',
        ]);

        $date ??= self::KIOSK_TEST_DATE;

        ShiftSchedule::create([
            'id' => 'SCH-'.$employeeId.'-'.$date,
            'employee_id' => $employeeId,
            'employee_name' => 'Test Employee',
            'shift_id' => 'SHIFT-T'.substr($start, 0, 2).substr($end, 0, 2),
            'date' => $date,
            'status' => 'Scheduled',
        ]);
    }

    protected function adminUser(): User
    {
        return User::factory()->create([
            'employee_id' => null,
            'name' => 'John Delgado',
            'email' => 'admin@workforcepro.com',
            'role' => 'Administrator',
            'role_label' => 'Workforce Admin',
            'avatar_seed' => 'John',
        ]);
    }

    protected function otpEmployeeUser(): User
    {
        return User::factory()->create([
            'employee_id' => 'EMP-OTP',
            'name' => 'Juan Dela Cruz',
            'email' => 'employee@workforcepro.com',
            'role' => 'Employee',
            'role_label' => 'Employee',
            'avatar_seed' => 'Juan',
        ]);
    }

    /**
     * Sets a kiosk PIN (1234) and returns the headers of a device that has unlocked
     * with it. Pass $active = false for a kiosk that an admin has switched off.
     *
     * @return array{'X-Kiosk-Token': string}
     */
    protected function kioskDeviceHeaders(bool $active = true): array
    {
        $setting = Setting::firstOrNew(['id' => 1]);
        $setting->kiosk = array_merge($setting->kiosk ?? [], [
            'pinHash' => hash('sha256', 'wfp-kiosk:1234'),
            'active' => $active,
            'enabledAt' => now()->toISOString(),
        ]);
        $setting->save();

        return ['X-Kiosk-Token' => KioskDeviceToken::issue()['token']];
    }

    protected function seedOrgStructure(): void
    {
        Department::create([
            'id' => 'DEPT001',
            'name' => 'IT & Systems',
            'head' => null,
            'head_id' => null,
            'employee_count' => 0,
            'budget' => 0,
            'location' => 'Pasig City',
            'description' => 'Test department',
        ]);

        Department::create([
            'id' => 'DEPT002',
            'name' => 'Sales & Merchandising',
            'head' => null,
            'head_id' => null,
            'employee_count' => 0,
            'budget' => 0,
            'location' => 'Makati City',
            'description' => 'Test department',
        ]);

        Role::create(['id' => 'ROLE001', 'department_id' => 'DEPT001', 'name' => 'Software Developer']);
        Role::create(['id' => 'ROLE002', 'department_id' => 'DEPT002', 'name' => 'Cashier']);
    }
}
