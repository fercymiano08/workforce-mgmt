<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProfileTest extends TestCase
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
            'salary' => 50000,
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

    public function test_profile_requires_authentication(): void
    {
        $this->getJson('/api/profile')->assertUnauthorized();
    }

    public function test_employee_can_view_their_own_profile(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        $this->actingAs($user)
            ->getJson('/api/profile')
            ->assertOk()
            ->assertJsonPath('data.id', $employee->id)
            ->assertJsonPath('data.email', $employee->email);
    }

    public function test_administrator_has_no_profile_to_view(): void
    {
        $admin = $this->adminUser();

        $this->actingAs($admin)->getJson('/api/profile')->assertNotFound();
    }

    public function test_employee_can_update_their_own_contact_details_and_photo(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        $this->actingAs($user)
            ->putJson('/api/profile', [
                'phone' => '+63 917 555 1234',
                'address' => '123 New Street',
                'emergencyContact' => 'Maria Santos',
                'emergencyPhone' => '+63 917 555 5678',
                'avatar' => 'data:image/jpeg;base64,abc',
            ])
            ->assertOk()
            ->assertJsonPath('data.phone', '+63 917 555 1234')
            ->assertJsonPath('data.address', '123 New Street')
            ->assertJsonPath('data.avatar', 'data:image/jpeg;base64,abc');
    }

    public function test_employee_cannot_change_hr_controlled_fields_via_self_service_profile(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        $this->actingAs($user)
            ->putJson('/api/profile', [
                'firstName' => 'Hacked',
                'salary' => 999999,
                'department' => 'Executive',
                'phone' => '+63 917 555 1234',
            ])
            ->assertOk();

        $fresh = $employee->fresh();
        $this->assertSame('Juan', $fresh->first_name);
        $this->assertEquals(50000, $fresh->salary);
        $this->assertSame('IT & Systems', $fresh->department);
        $this->assertSame('+63 917 555 1234', $fresh->phone);
    }
}
