<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\OvertimeRequest;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class KioskTodayScheduleTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function employee(string $id = 'EMP001'): Employee
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

    public function test_returns_shift_details_for_a_scheduled_employee(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 08:00:00')); // a Thursday
        $employee = $this->employee();

        ShiftDefinition::create(['id' => 'SHIFT004', 'name' => 'Flexible', 'start_time' => '08:00', 'end_time' => '17:00']);
        ShiftSchedule::create([
            'id' => 'SCH001', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'shift_id' => 'SHIFT004', 'date' => '2026-08-13', 'status' => 'Scheduled',
        ]);

        $this->getJson("/api/kiosk/schedule/{$employee->id}")
            ->assertOk()
            ->assertJsonPath('data.hasShift', true)
            ->assertJsonPath('data.shiftId', 'SHIFT004')
            ->assertJsonPath('data.shiftName', 'Flexible')
            ->assertJsonPath('data.startTime', '08:00')
            ->assertJsonPath('data.endTime', '17:00');
    }

    public function test_includes_approved_overtime_hours_in_schedule_response(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 08:00:00'));
        $employee = $this->employee();

        ShiftDefinition::create(['id' => 'SHIFT004', 'name' => 'Flexible', 'start_time' => '08:00', 'end_time' => '17:00']);
        ShiftSchedule::create([
            'id' => 'SCH001', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'shift_id' => 'SHIFT004', 'date' => '2026-08-13', 'status' => 'Scheduled',
        ]);
        OvertimeRequest::create([
            'id' => 'OT001', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'date' => '2026-08-13', 'expected_hours' => 4, 'approved_hours' => 6,
            'reason' => 'Backlog', 'status' => 'Approved', 'requested_date' => '2026-08-13',
        ]);
        OvertimeRequest::create([
            'id' => 'OT002', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'date' => '2026-08-13', 'expected_hours' => 1, 'approved_hours' => 2,
            'reason' => 'Support', 'status' => 'Approved', 'requested_date' => '2026-08-13',
        ]);
        OvertimeRequest::create([
            'id' => 'OT003', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'date' => '2026-08-13', 'expected_hours' => 5, 'reason' => 'Draft',
            'status' => 'Pending', 'requested_date' => '2026-08-13',
        ]);

        $this->getJson("/api/kiosk/schedule/{$employee->id}")
            ->assertOk()
            ->assertJsonPath('data.approvedOvertimeHours', 8);
    }

    public function test_returns_no_shift_when_employee_has_no_schedule_today(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 08:00:00'));
        $employee = $this->employee();

        $this->getJson("/api/kiosk/schedule/{$employee->id}")
            ->assertOk()
            ->assertJsonPath('data.hasShift', false);
    }

    public function test_respects_an_explicit_date_parameter(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 08:00:00'));
        $employee = $this->employee();

        ShiftDefinition::create(['id' => 'SHIFT001', 'name' => 'Day Shift', 'start_time' => '08:00', 'end_time' => '17:00']);
        ShiftSchedule::create([
            'id' => 'SCH001', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'shift_id' => 'SHIFT001', 'date' => '2026-08-14', 'status' => 'Scheduled',
        ]);

        $this->getJson("/api/kiosk/schedule/{$employee->id}?date=2026-08-14")
            ->assertOk()
            ->assertJsonPath('data.hasShift', true);

        $this->getJson("/api/kiosk/schedule/{$employee->id}?date=2026-08-13")
            ->assertOk()
            ->assertJsonPath('data.hasShift', false);
    }

    public function test_ignores_a_schedule_for_another_employee(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 08:00:00'));
        $employee = $this->employee();
        $other = $this->employee('EMP002');

        ShiftDefinition::create(['id' => 'SHIFT001', 'name' => 'Day Shift', 'start_time' => '08:00', 'end_time' => '17:00']);
        ShiftSchedule::create([
            'id' => 'SCH001', 'employee_id' => $other->id, 'employee_name' => 'Test EMP002',
            'shift_id' => 'SHIFT001', 'date' => '2026-08-13', 'status' => 'Scheduled',
        ]);

        $this->getJson("/api/kiosk/schedule/{$employee->id}")
            ->assertOk()
            ->assertJsonPath('data.hasShift', false);
    }
}
