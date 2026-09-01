<?php

namespace Tests;

use App\Models\Department;
use App\Models\Role;
use App\Models\User;
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
            'role_label' => 'HR Manager / Admin',
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
