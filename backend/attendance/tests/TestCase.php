<?php

namespace Tests;

use App\Models\Department;
use App\Models\Role;
use App\Models\Setting;
use App\Models\User;
use App\Services\KioskDeviceToken;
use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
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
