<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\LeaveType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Admin CRUD for leave type configuration - the rules used to be hardcoded string comparisons;
 * now they're rows an admin can create/edit/deactivate, and the API must enforce that only an
 * Administrator can touch them, that deactivating never deletes, and that the employee-facing
 * eligibility annotation reflects gender/tenure correctly.
 */
class LeaveTypeTest extends TestCase
{
    use RefreshDatabase;

    public function test_an_employee_cannot_manage_leave_types(): void
    {
        $employee = $this->otpEmployeeUser();

        $this->actingAs($employee)->getJson('/api/leave-types')->assertStatus(403);
        $this->actingAs($employee)->postJson('/api/leave-types', ['code' => 'Study'])->assertStatus(403);
    }

    public function test_an_administrator_can_create_a_new_leave_type(): void
    {
        $payload = [
            'code' => 'Study', 'name' => 'Study Leave', 'applicableGender' => 'Any',
            'minTenureMonths' => 12, 'payType' => 'PaidWithoutBalance', 'requiresBalance' => false,
            'accrualPolicy' => 'None', 'accrualRate' => 0, 'maxCarryoverDays' => null,
            'advanceNoticeDays' => 14, 'retroactiveAllowed' => false, 'retroactiveWindowDays' => 0,
            'maxConsecutiveDays' => 10, 'requiresProof' => false, 'proofThresholdDays' => 0,
        ];

        $response = $this->actingAs($this->adminUser())
            ->postJson('/api/leave-types', $payload)
            ->assertCreated();

        $response->assertJsonPath('data.code', 'Study');
        $response->assertJsonPath('data.active', true);
        $this->assertSame(1, LeaveType::where('code', 'Study')->count());
    }

    public function test_a_duplicate_code_is_refused(): void
    {
        $this->actingAs($this->adminUser())
            ->postJson('/api/leave-types', [
                'code' => 'Vacation', 'name' => 'Duplicate Vacation', 'applicableGender' => 'Any',
                'minTenureMonths' => 0, 'payType' => 'PaidWithBalance', 'requiresBalance' => true,
                'accrualPolicy' => 'None', 'accrualRate' => 0, 'advanceNoticeDays' => 0,
                'retroactiveAllowed' => false, 'retroactiveWindowDays' => 0,
                'requiresProof' => false, 'proofThresholdDays' => 0,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('code');
    }

    public function test_deactivating_a_type_never_deletes_it_and_hides_it_from_the_canonical_list(): void
    {
        $type = LeaveType::where('code', 'Special')->first();

        $this->actingAs($this->adminUser())
            ->deleteJson('/api/leave-types/'.$type->id)
            ->assertOk()
            ->assertJsonPath('data.active', false);

        $this->assertNotNull(LeaveType::find($type->id), 'Deactivating must not delete the row.');
        $this->assertNotContains('Special', Employee::leaveTypes(), 'An inactive type must drop out of the canonical list.');
    }

    public function test_a_deactivated_type_can_be_reactivated(): void
    {
        $type = LeaveType::where('code', 'Special')->first();
        $type->update(['active' => false]);

        $this->actingAs($this->adminUser())
            ->putJson('/api/leave-types/'.$type->id, ['active' => true])
            ->assertOk()
            ->assertJsonPath('data.active', true);

        $this->assertContains('Special', Employee::leaveTypes());
    }

    public function test_eligible_types_endpoint_annotates_gender_and_tenure_reasons(): void
    {
        $user = $this->otpEmployeeUser();
        Employee::create([
            'id' => 'EMP-OTP', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz',
            'email' => 'juan@example.com', 'gender' => 'Male', 'status' => 'Active',
            'hire_date' => now()->subDays(10)->toDateString(),
        ]);

        $response = $this->actingAs($user)
            ->getJson('/api/leave-types/eligible/EMP-OTP')
            ->assertOk();

        $types = collect($response->json('data'))->keyBy('code');

        $this->assertFalse($types['Maternity']['eligible']);
        $this->assertNotEmpty($types['Maternity']['ineligibilityReasons']);

        $this->assertFalse($types['Vacation']['eligible'], 'Still inside the 6-month tenure window.');
        $this->assertTrue($types['Sick']['eligible'], 'Sick has no tenure requirement.');
        $this->assertTrue($types['Paternity']['eligible']);
    }

    public function test_an_employee_cannot_read_another_employees_eligible_types(): void
    {
        Employee::create(['id' => 'EMP-OTHER', 'first_name' => 'A', 'last_name' => 'B', 'email' => 'ab@x.com', 'status' => 'Active']);

        $this->actingAs($this->otpEmployeeUser())
            ->getJson('/api/leave-types/eligible/EMP-OTHER')
            ->assertStatus(403);
    }
}
