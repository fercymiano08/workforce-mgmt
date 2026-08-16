<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\OvertimeRequest;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class KioskClockOutGuardTest extends TestCase
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

    private function schedule(Employee $employee, string $date, string $start, string $end, string $shiftId = 'SHIFT004'): void
    {
        ShiftDefinition::create(['id' => $shiftId, 'name' => 'Flexible', 'start_time' => $start, 'end_time' => $end]);
        ShiftSchedule::create([
            'id' => 'SCH001', 'employee_id' => $employee->id, 'employee_name' => 'Test '.$employee->id,
            'shift_id' => $shiftId, 'date' => $date, 'status' => 'Scheduled',
        ]);
    }

    private function clockedIn(Employee $employee, string $date, string $clockIn): Attendance
    {
        return Attendance::create([
            'id' => 'ATT001', 'employee_id' => $employee->id, 'date' => $date,
            'clock_in' => $clockIn, 'status' => 'Present', 'location' => 'Main Entrance',
        ]);
    }

    public function test_blocks_clock_out_before_shift_end(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 10:00:00', 'Asia/Manila'));
        $employee = $this->employee();
        $this->schedule($employee, '2026-08-13', '08:00', '17:00');
        $record = $this->clockedIn($employee, '2026-08-13', '08:00');

        $this->putJson("/api/kiosk/attendance/{$record->id}", ['clockOut' => '10:30'])
            ->assertStatus(422)
            ->assertJsonPath('data.shiftEndsAt', '2026-08-13T09:00:00.000000Z');
    }

    public function test_allows_clock_out_at_or_after_shift_end(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 17:30:00', 'Asia/Manila'));
        $employee = $this->employee();
        $this->schedule($employee, '2026-08-13', '08:00', '17:00');
        $record = $this->clockedIn($employee, '2026-08-13', '08:00');

        $this->putJson("/api/kiosk/attendance/{$record->id}", [
            'clockOut' => '17:30', 'regularHours' => 9, 'overtime' => 0.5, 'totalHours' => 9.5, 'breakHours' => 1,
        ])
            ->assertOk()
            ->assertJsonPath('data.clockOut', '17:30');
    }

    public function test_allows_clock_out_when_no_schedule_exists(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 10:00:00', 'Asia/Manila'));
        $employee = $this->employee();
        $record = $this->clockedIn($employee, '2026-08-13', '08:00');

        $this->putJson("/api/kiosk/attendance/{$record->id}", [
            'clockOut' => '10:30', 'regularHours' => 2, 'overtime' => 0, 'totalHours' => 2, 'breakHours' => 0,
        ])
            ->assertOk();
    }

    public function test_blocks_clock_out_before_effective_end_with_approved_overtime(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 18:00:00', 'Asia/Manila'));
        $employee = $this->employee();
        $this->schedule($employee, '2026-08-13', '08:00', '17:00');
        OvertimeRequest::create([
            'id' => 'OT001', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'date' => '2026-08-13', 'expected_hours' => 6, 'approved_hours' => 6,
            'reason' => 'Backlog', 'status' => 'Approved', 'requested_date' => '2026-08-13',
        ]);
        $record = $this->clockedIn($employee, '2026-08-13', '08:00');

        $this->putJson("/api/kiosk/attendance/{$record->id}", ['clockOut' => '18:30'])
            ->assertStatus(422)
            ->assertJsonPath('data.shiftEndsAt', '2026-08-13T15:00:00.000000Z');
    }

    public function test_allows_clock_out_after_approved_overtime_ends(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 23:30:00', 'Asia/Manila'));
        $employee = $this->employee();
        $this->schedule($employee, '2026-08-13', '08:00', '17:00');
        OvertimeRequest::create([
            'id' => 'OT001', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'date' => '2026-08-13', 'expected_hours' => 6, 'approved_hours' => 6,
            'reason' => 'Backlog', 'status' => 'Approved', 'requested_date' => '2026-08-13',
        ]);
        $record = $this->clockedIn($employee, '2026-08-13', '08:00');

        $this->putJson("/api/kiosk/attendance/{$record->id}", [
            'clockOut' => '23:30', 'regularHours' => 9, 'overtime' => 6.5, 'totalHours' => 15.5, 'breakHours' => 1,
        ])
            ->assertOk();
    }

    public function test_blocks_early_clock_out_on_an_overnight_shift(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 23:00:00', 'Asia/Manila'));
        $employee = $this->employee();
        $this->schedule($employee, '2026-08-13', '22:00', '06:00', 'SHIFT003');
        $record = $this->clockedIn($employee, '2026-08-13', '22:00');

        $this->putJson("/api/kiosk/attendance/{$record->id}", ['clockOut' => '23:15'])
            ->assertStatus(422)
            ->assertJsonPath('data.shiftEndsAt', '2026-08-13T22:00:00.000000Z');
    }

    public function test_blocks_clock_out_past_midnight_when_overtime_extends_shift(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 18:00:00', 'Asia/Manila'));
        $employee = $this->employee();
        $this->schedule($employee, '2026-08-13', '17:00', '23:00', 'SHIFT002');
        OvertimeRequest::create([
            'id' => 'OT001', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'date' => '2026-08-13', 'expected_hours' => 2, 'approved_hours' => 2,
            'reason' => 'Backlog', 'status' => 'Approved', 'requested_date' => '2026-08-13',
        ]);
        $record = $this->clockedIn($employee, '2026-08-13', '17:00');

        $this->putJson("/api/kiosk/attendance/{$record->id}", ['clockOut' => '23:30'])
            ->assertStatus(422)
            ->assertJsonPath('data.shiftEndsAt', '2026-08-13T17:00:00.000000Z');
    }
}
