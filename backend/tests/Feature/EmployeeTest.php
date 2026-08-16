<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class EmployeeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seedOrgStructure();
        $this->user = $this->adminUser();
    }

    private function employeePayload(array $overrides = []): array
    {
        return array_merge([
            'firstName' => 'Juan',
            'lastName' => 'Dela Cruz',
            'email' => 'juan@example.com',
            'phone' => '+63 912 345 6789',
            'department' => 'IT & Systems',
            'position' => 'Software Developer',
            'employmentType' => 'Full-time',
            'status' => 'Active',
            'hireDate' => '2026-07-01',
            'salary' => 0,
            'manager' => '',
            'avatar' => '',
            'address' => '123 P. Burgos St, Makati City',
            'dateOfBirth' => '1995-01-01',
            'gender' => '',
            'emergencyContact' => 'Maria Santos',
            'emergencyPhone' => '+63 917 555 1234',
            'assignedShift' => '',
            'skills' => [],
            'password' => 'Password1',
            'faceRegistered' => true,
            'faceImage' => 'data:image/jpeg;base64,abc',
        ], $overrides);
    }

    public function test_employees_require_authentication(): void
    {
        $this->getJson('/api/employees')->assertUnauthorized();
        $this->postJson('/api/employees', $this->employeePayload())->assertUnauthorized();
    }

    public function test_create_employee_success_with_generated_random_id(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson('/api/employees', $this->employeePayload())
            ->assertCreated()
            ->assertJsonPath('data.firstName', 'Juan')
            ->assertJsonPath('data.department', 'IT & Systems')
            ->assertJsonPath('data.position', 'Software Developer');

        $id = $response->json('data.id');
        $this->assertMatchesRegularExpression('/^EMP\d{8}$/', $id, "Unexpected employee id [$id]");
    }

    public function test_created_employee_ids_are_distinct(): void
    {
        $this->actingAs($this->user)->postJson('/api/employees', $this->employeePayload(['email' => 'a@example.com']));
        $this->actingAs($this->user)->postJson('/api/employees', $this->employeePayload(['email' => 'b@example.com']));

        $this->assertSame(2, Employee::query()->distinct('id')->count('id'));
    }

    public function test_create_employee_requires_name_and_email(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/employees', $this->employeePayload(['firstName' => '', 'lastName' => '', 'email' => '']))
            ->assertStatus(422)
            ->assertJsonValidationErrors(['firstName', 'lastName', 'email']);
    }

    public function test_create_employee_rejects_duplicate_email(): void
    {
        $this->actingAs($this->user)->postJson('/api/employees', $this->employeePayload());

        $this->actingAs($this->user)
            ->postJson('/api/employees', $this->employeePayload(['firstName' => 'Pedro']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    public function test_position_must_belong_to_the_selected_department(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/employees', $this->employeePayload([
                'department' => 'IT & Systems',
                'position' => 'Cashier',
            ]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('position');
    }

    public function test_matching_department_and_position_is_accepted(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/employees', $this->employeePayload([
                'department' => 'Sales & Merchandising',
                'position' => 'Cashier',
            ]))
            ->assertCreated();
    }

    public function test_custom_position_not_in_roles_table_is_accepted(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/employees', $this->employeePayload([
                'department' => 'Engineering',
                'position' => 'Software Engineer',
            ]))
            ->assertCreated();
    }

    public function test_future_hire_date_is_rejected(): void
    {
        $future = now()->addDay()->format('Y-m-d');

        $this->actingAs($this->user)
            ->postJson('/api/employees', $this->employeePayload(['hireDate' => $future]))
            ->assertStatus(422)
            ->assertJsonValidationErrors('hireDate');
    }

    public function test_emergency_contact_fields_are_stored(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson('/api/employees', $this->employeePayload())
            ->assertCreated();

        $employee = Employee::findOrFail($response->json('data.id'));
        $this->assertSame('Maria Santos', $employee->emergency_contact);
        $this->assertSame('+63 917 555 1234', $employee->emergency_phone);
    }

    public function test_list_employees_returns_registered_records(): void
    {
        $created = $this->actingAs($this->user)->postJson('/api/employees', $this->employeePayload())->json('data');

        $this->actingAs($this->user)
            ->getJson('/api/employees')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $created['id']);
    }

    public function test_show_employee_returns_the_record(): void
    {
        $id = $this->actingAs($this->user)->postJson('/api/employees', $this->employeePayload())->json('data.id');

        $this->actingAs($this->user)
            ->getJson("/api/employees/{$id}")
            ->assertOk()
            ->assertJsonPath('data.id', $id)
            ->assertJsonPath('data.email', 'juan@example.com');
    }

    public function test_show_unknown_employee_returns_404(): void
    {
        $this->actingAs($this->user)->getJson('/api/employees/DOESNOTEXIST')->assertNotFound();
    }

    public function test_update_employee_changes_fields(): void
    {
        $id = $this->actingAs($this->user)->postJson('/api/employees', $this->employeePayload())->json('data.id');

        $this->actingAs($this->user)
            ->putJson("/api/employees/{$id}", $this->employeePayload(['lastName' => 'Changed']))
            ->assertOk()
            ->assertJsonPath('data.lastName', 'Changed');
    }

    public function test_update_rejects_position_not_matching_department(): void
    {
        $id = $this->actingAs($this->user)->postJson('/api/employees', $this->employeePayload())->json('data.id');

        $this->actingAs($this->user)
            ->putJson("/api/employees/{$id}", $this->employeePayload(['position' => 'Cashier']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('position');
    }

    public function test_delete_employee_removes_the_record(): void
    {
        $id = $this->actingAs($this->user)->postJson('/api/employees', $this->employeePayload())->json('data.id');

        $this->actingAs($this->user)->deleteJson("/api/employees/{$id}")->assertOk()->assertJsonPath('success', true);

        $this->actingAs($this->user)->getJson("/api/employees/{$id}")->assertNotFound();
    }

    public function test_register_face_requires_an_image(): void
    {
        $id = $this->actingAs($this->user)->postJson('/api/employees', $this->employeePayload())->json('data.id');

        $this->actingAs($this->user)
            ->postJson("/api/employees/{$id}/face", [])
            ->assertStatus(422);
    }

    public function test_register_face_marks_the_employee(): void
    {
        $id = $this->actingAs($this->user)->postJson('/api/employees', $this->employeePayload())->json('data.id');

        $this->actingAs($this->user)
            ->postJson("/api/employees/{$id}/face", ['faceImage' => 'data:image/jpeg;base64,xyz'])
            ->assertOk()
            ->assertJsonPath('data.faceRegistered', true);
    }

    public function test_create_employee_creates_a_login_account(): void
    {
        $response = $this->actingAs($this->user)->postJson('/api/employees', $this->employeePayload())->assertCreated();
        $id = $response->json('data.id');

        $login = User::where('email', 'juan@example.com')->first();
        $this->assertNotNull($login, 'A login account should be created for the employee.');
        $this->assertSame($id, $login->employee_id);
        $this->assertSame('Employee', $login->role);
        $this->assertSame('Employee', $login->role_label);
        $this->assertTrue(password_verify('Password1', $login->password));

        $this->postJson('/api/auth/login', ['email' => 'juan@example.com', 'password' => 'Password1'])
            ->assertOk()
            ->assertJsonPath('user.id', $id)
            ->assertJsonPath('user.role', 'Employee');
    }

    public function test_create_employee_requires_a_password(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/employees', $this->employeePayload(['password' => '']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');
    }

    public function test_create_employee_rejects_email_used_by_an_account(): void
    {
        $this->actingAs($this->user)
            ->postJson('/api/employees', $this->employeePayload(['email' => 'admin@workforcepro.com']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    public function test_delete_employee_also_removes_the_login_account(): void
    {
        $id = $this->actingAs($this->user)->postJson('/api/employees', $this->employeePayload())->json('data.id');
        $this->assertNotNull(User::where('email', 'juan@example.com')->first());

        $this->actingAs($this->user)->deleteJson("/api/employees/{$id}")->assertOk();

        $this->assertNull(User::where('email', 'juan@example.com')->first());
    }

    public function test_update_employee_syncs_the_login_account(): void
    {
        $id = $this->actingAs($this->user)->postJson('/api/employees', $this->employeePayload())->json('data.id');

        $this->actingAs($this->user)
            ->putJson("/api/employees/{$id}", $this->employeePayload(['lastName' => 'Changed']))
            ->assertOk();

        $this->assertSame('Juan Changed', User::where('employee_id', $id)->value('name'));
    }
}
