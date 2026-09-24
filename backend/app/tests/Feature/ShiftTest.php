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

    public function test_automated_scheduling_assigns_shifts(): void
    {
        Employee::create([
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

        \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2030-01-14 06:00:00', 'Asia/Manila'));

        $this->actingAs($this->adminUser())
            ->postJson('/api/shifts/automation/run')
            ->assertOk()
            ->assertJsonPath('data.totals.created', 5);

        \Illuminate\Support\Carbon::setTestNow();
    }
}