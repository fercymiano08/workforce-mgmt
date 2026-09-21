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

    public function test_the_profile_does_not_expose_salary_or_the_face_template(): void
    {
        $employee = $this->employee();
        $employee->update(['face_image' => 'data:image/jpeg;base64,xyz', 'face_descriptor' => array_fill(0, 128, 0.1), 'face_registered' => true]);

        $response = $this->actingAs($this->employeeUser($employee->id))->getJson('/api/profile')->assertOk();

        $response->assertJsonMissingPath('data.salary')
            ->assertJsonMissingPath('data.faceImage')
            ->assertJsonMissingPath('data.faceDescriptor')
            ->assertJsonPath('data.faceRegistered', true);   // the status is still shown
    }

    public function test_an_invalid_phone_number_is_refused(): void
    {
        $user = $this->employeeUser($this->employee()->id);

        foreach (['abc', '12', 'call me maybe', '<script>alert(1)</script>'] as $bad) {
            $this->actingAs($user)->putJson('/api/profile', ['phone' => $bad])
                ->assertStatus(422)->assertJsonValidationErrors('phone');
        }
        $this->actingAs($user)->putJson('/api/profile', ['emergencyPhone' => 'nope'])
            ->assertStatus(422)->assertJsonValidationErrors('emergencyPhone');
    }

    public function test_common_phone_formats_are_accepted(): void
    {
        $user = $this->employeeUser($this->employee()->id);

        foreach (['+63 917 555 1234', '09175551234', '(02) 8123-4567', '0917-555-1234'] as $ok) {
            $this->actingAs($user)->putJson('/api/profile', ['phone' => $ok])->assertOk();
        }
    }

    public function test_the_photo_must_be_a_reasonably_small_image(): void
    {
        $user = $this->employeeUser($this->employee()->id);

        $this->actingAs($user)->putJson('/api/profile', ['avatar' => 'https://evil.example/x.png'])
            ->assertStatus(422)->assertJsonValidationErrors('avatar');
        $this->actingAs($user)->putJson('/api/profile', ['avatar' => 'data:image/jpeg;base64,'.str_repeat('A', 800000)])
            ->assertStatus(422)->assertJsonValidationErrors('avatar');
    }

    public function test_the_photo_can_be_removed(): void
    {
        $employee = $this->employee();
        $employee->update(['avatar' => 'data:image/jpeg;base64,abc']);

        $this->actingAs($this->employeeUser($employee->id))->putJson('/api/profile', ['avatar' => ''])
            ->assertOk();

        $this->assertEmpty($employee->fresh()->avatar);
    }
}