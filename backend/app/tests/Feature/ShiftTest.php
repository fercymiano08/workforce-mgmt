<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\ShiftDefinition;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ShiftTest extends TestCase
{
    use RefreshDatabase;

    public function test_shift_definitions_require_authentication(): void
    {
        $this->getJson('/api/shifts')->assertUnauthorized();
    }

    public function test_admin_can_list_shift_definitions(): void
    {
        ShiftDefinition::create([
            'id' => 'SFT001',
            'name' => 'Morning',
            'start_time' => '07:00:00',
            'end_time' => '15:00:00',
            'color' => '#4f46e5',
        ]);

        $this->actingAs($this->adminUser())
            ->getJson('/api/shifts')
            ->assertOk()
            ->assertJsonFragment(['id' => 'SFT001']);
    }

    public function test_admin_can_create_a_shift_schedule(): void
    {
        $admin = $this->adminUser();
        $employee = Employee::create([
            'id' => 'EMP20260001',
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'email' => 'juan@workforcepro.com',
        ]);
        ShiftDefinition::create([
            'id' => 'SFT001',
            'name' => 'Morning',
            'start_time' => '07:00:00',
            'end_time' => '15:00:00',
        ]);

        $this->actingAs($admin)
            ->postJson('/api/shifts/schedules', [
                'employeeId' => $employee->id,
                'employeeName' => 'Juan Dela Cruz',
                'shiftId' => 'SFT001',
                'date' => '2030-01-15',
                'status' => 'Scheduled',
            ])
            ->assertCreated()
            ->assertJsonStructure(['data']);
    }

    /**
     * Bulk assign: the replacement for the automated scheduler a panel review asked to remove
     * ("the shift is always Standard anyway - just let HR tick everyone and assign once").
     */
    public function test_admin_can_bulk_assign_the_same_shift_to_several_employees(): void
    {
        $admin = $this->adminUser();
        foreach (['EMP001', 'EMP002', 'EMP003'] as $id) {
            Employee::create(['id' => $id, 'first_name' => 'Person', 'last_name' => $id, 'email' => "$id@workforcepro.com"]);
        }
        ShiftDefinition::create(['id' => 'SFT001', 'name' => 'Morning', 'start_time' => '07:00:00', 'end_time' => '15:00:00']);

        $response = $this->actingAs($admin)
            ->postJson('/api/shifts/schedules/bulk', [
                'employeeIds' => ['EMP001', 'EMP002', 'EMP003'],
                'shiftId' => 'SFT001',
                'date' => '2030-01-15',
                'status' => 'Scheduled',
            ])
            ->assertCreated();

        $this->assertCount(3, $response->json('data.created'));
        $this->assertCount(0, $response->json('data.skipped'));
        $this->assertSame(3, \App\Models\ShiftSchedule::where('date', '2030-01-15')->count());
    }

    public function test_bulk_assign_skips_only_the_employee_with_a_conflict(): void
    {
        $admin = $this->adminUser();
        foreach (['EMP001', 'EMP002'] as $id) {
            Employee::create(['id' => $id, 'first_name' => 'Person', 'last_name' => $id, 'email' => "$id@workforcepro.com"]);
        }
        ShiftDefinition::create(['id' => 'SFT001', 'name' => 'Morning', 'start_time' => '07:00:00', 'end_time' => '15:00:00']);
        \App\Models\ShiftSchedule::create([
            'id' => 'SCH900', 'employee_id' => 'EMP001', 'employee_name' => 'Person EMP001',
            'shift_id' => 'SFT001', 'date' => '2030-01-15', 'status' => 'Scheduled',
        ]);

        $response = $this->actingAs($admin)
            ->postJson('/api/shifts/schedules/bulk', [
                'employeeIds' => ['EMP001', 'EMP002'],
                'shiftId' => 'SFT001',
                'date' => '2030-01-15',
                'status' => 'Scheduled',
            ])
            ->assertCreated();

        $this->assertCount(1, $response->json('data.created'));
        $this->assertCount(1, $response->json('data.skipped'));
        $this->assertSame('EMP001', $response->json('data.skipped.0.employeeId'));
    }

    public function test_bulk_assign_skips_someone_on_approved_leave_that_day(): void
    {
        $admin = $this->adminUser();
        Employee::create(['id' => 'EMP001', 'first_name' => 'Person', 'last_name' => 'One', 'email' => 'e1@workforcepro.com']);
        ShiftDefinition::create(['id' => 'SFT001', 'name' => 'Morning', 'start_time' => '07:00:00', 'end_time' => '15:00:00']);
        \App\Models\Leave::create([
            'id' => 'LVE900', 'employee_id' => 'EMP001', 'employee_name' => 'Person One', 'leave_type' => 'Vacation',
            'start_date' => '2030-01-14', 'end_date' => '2030-01-16', 'days' => 3,
            'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-01',
        ]);

        $response = $this->actingAs($admin)
            ->postJson('/api/shifts/schedules/bulk', [
                'employeeIds' => ['EMP001'],
                'shiftId' => 'SFT001',
                'date' => '2030-01-15',
                'status' => 'Scheduled',
            ])
            ->assertStatus(422);

        $this->assertCount(0, $response->json('data.created'));
        $this->assertStringContainsString('Vacation', $response->json('data.skipped.0.reason'));
    }
}
