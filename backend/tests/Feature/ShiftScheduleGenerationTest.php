<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Leave;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class ShiftScheduleGenerationTest extends TestCase
{
    use RefreshDatabase;

    private function employee(string $id): Employee
    {
        return Employee::create([
            'id' => $id,
            'first_name' => 'Test',
            'last_name' => $id,
            'email' => "{$id}@example.com",
            'department' => 'IT & Systems',
            'position' => 'Software Developer',
        ]);
    }

    private function shift(): ShiftDefinition
    {
        return ShiftDefinition::create([
            'id' => 'SHIFT001',
            'name' => 'Day Shift',
            'start_time' => '08:00',
            'end_time' => '17:00',
            'color' => '#3B82F6',
        ]);
    }

    public function test_employee_cannot_generate_a_schedule(): void
    {
        $employee = $this->employee('EMP001');
        $shift = $this->shift();
        $user = \App\Models\User::factory()->create([
            'employee_id' => $employee->id, 'role' => 'Employee', 'role_label' => 'Employee',
        ]);

        $this->actingAs($user)->postJson('/api/shifts/schedules/generate', [
            'startDate' => now()->addDay()->toDateString(),
            'endDate' => now()->addDays(2)->toDateString(),
            'shiftId' => $shift->id,
        ])->assertForbidden();
    }

    public function test_generate_schedule_creates_a_row_per_employee_per_weekday(): void
    {
        $admin = $this->adminUser();
        $shift = $this->shift();
        $this->employee('EMP001');
        $this->employee('EMP002');

        $monday = Carbon::parse('next monday');
        $saturday = $monday->copy()->addDays(5);
        $sunday = $monday->copy()->addDays(6);

        $response = $this->actingAs($admin)->postJson('/api/shifts/schedules/generate', [
            'startDate' => $monday->toDateString(),
            'endDate' => $sunday->toDateString(),
            'shiftId' => $shift->id,
        ])->assertOk();

        // 5 weekdays x 2 employees, weekend skipped by default.
        $response->assertJsonPath('data.created', 10);
        $this->assertSame(10, ShiftSchedule::count());
        $this->assertSame(0, ShiftSchedule::whereIn('date', [
            $saturday->toDateString(), $sunday->toDateString(),
        ])->count());
    }

    public function test_generate_schedule_skips_an_employee_already_scheduled_that_day(): void
    {
        $admin = $this->adminUser();
        $shift = $this->shift();
        $employee = $this->employee('EMP001');

        $monday = Carbon::parse('next monday');

        ShiftSchedule::create([
            'id' => 'SCH001', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'shift_id' => $shift->id, 'date' => $monday->toDateString(), 'status' => 'Scheduled',
        ]);

        $response = $this->actingAs($admin)->postJson('/api/shifts/schedules/generate', [
            'startDate' => $monday->toDateString(),
            'endDate' => $monday->toDateString(),
            'shiftId' => $shift->id,
        ])->assertOk();

        $response->assertJsonPath('data.created', 0);
        $response->assertJsonPath('data.skippedExisting', 1);
        $this->assertSame(1, ShiftSchedule::count());
    }

    public function test_generate_schedule_skips_an_employee_on_approved_leave(): void
    {
        $admin = $this->adminUser();
        $shift = $this->shift();
        $employee = $this->employee('EMP001');

        $monday = Carbon::parse('next monday');

        Leave::create([
            'id' => 'LVE001', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'leave_type' => 'Vacation', 'start_date' => $monday->toDateString(), 'end_date' => $monday->toDateString(),
            'reason' => 'Test', 'status' => 'Approved', 'applied_date' => now()->toDateString(),
        ]);

        $response = $this->actingAs($admin)->postJson('/api/shifts/schedules/generate', [
            'startDate' => $monday->toDateString(),
            'endDate' => $monday->toDateString(),
            'shiftId' => $shift->id,
        ])->assertOk();

        $response->assertJsonPath('data.created', 0);
        $response->assertJsonPath('data.skippedOnLeave', 1);
        $this->assertSame(0, ShiftSchedule::count());
    }

    public function test_generate_schedule_can_include_weekends_when_asked(): void
    {
        $admin = $this->adminUser();
        $shift = $this->shift();
        $this->employee('EMP001');

        $saturday = Carbon::parse('next saturday');

        $response = $this->actingAs($admin)->postJson('/api/shifts/schedules/generate', [
            'startDate' => $saturday->toDateString(),
            'endDate' => $saturday->toDateString(),
            'shiftId' => $shift->id,
            'skipWeekends' => false,
        ])->assertOk();

        $response->assertJsonPath('data.created', 1);
        $this->assertSame(1, ShiftSchedule::count());
    }
}
