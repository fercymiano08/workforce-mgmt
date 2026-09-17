<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private function employee(string $id = 'EMP001'): Employee
    {
        return Employee::create([
            'id' => $id,
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'email' => "{$id}@example.com",
            'department' => 'IT & Systems',
            'position' => 'Software Developer',
        ]);
    }

    private function employeeUser(string $employeeId): User
    {
        return User::factory()->create([
            'employee_id' => $employeeId,
            'role' => 'Employee',
            'role_label' => 'Employee',
        ]);
    }

    public function test_employee_cannot_list_all_employees(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        $this->actingAs($user)->getJson('/api/employees')->assertForbidden();
    }

    public function test_employee_cannot_delete_another_employee(): void
    {
        $employee = $this->employee('EMP001');
        $other = $this->employee('EMP002');
        $user = $this->employeeUser($employee->id);

        $this->actingAs($user)->deleteJson("/api/employees/{$other->id}")->assertForbidden();
    }

    public function test_employee_cannot_update_another_employee(): void
    {
        $employee = $this->employee('EMP001');
        $other = $this->employee('EMP002');
        $user = $this->employeeUser($employee->id);

        $this->actingAs($user)
            ->putJson("/api/employees/{$other->id}", ['position' => 'CEO'])
            ->assertForbidden();
    }

    public function test_administrator_can_list_all_employees(): void
    {
        $this->employee();
        $admin = $this->adminUser();

        $this->actingAs($admin)->getJson('/api/employees')->assertOk();
    }

    public function test_departments_and_roles_are_visible_to_any_authenticated_user(): void
    {
        $this->seedOrgStructure();
        $user = $this->employeeUser('EMP001');

        $this->actingAs($user)->getJson('/api/departments')->assertOk();
        $this->actingAs($user)->getJson('/api/roles')->assertOk();
    }

    public function test_employee_cannot_see_another_employees_profile(): void
    {
        $employee = $this->employee('EMP001');
        $other = $this->employee('EMP002');
        $user = $this->employeeUser($employee->id);

        $this->actingAs($user)->getJson("/api/employees/{$other->id}")->assertForbidden();
    }

    public function test_employee_can_read_their_own_profile(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        $this->actingAs($user)
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('data.id', $employee->id);
    }
}