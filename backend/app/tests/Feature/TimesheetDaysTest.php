<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** GET /timesheets/employee/{id}/days - the merged Scheduled/Attendance/Leave view the day grid reads. */
class TimesheetDaysTest extends TestCase
{
    use RefreshDatabase;

    public function test_each_day_merges_schedule_attendance_and_leave(): void
    {
        $admin = $this->adminUser();
        Employee::create(['id' => 'EMP-OTP', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'email' => 'juan@x.com', 'status' => 'Active']);
        $shift = ShiftDefinition::create(['id' => 'SHIFT900', 'name' => 'Standard', 'start_time' => '08:00', 'end_time' => '17:00', 'color' => '#000']);

        // Day 1: scheduled and worked.
        ShiftSchedule::create(['id' => 'SCH900', 'employee_id' => 'EMP-OTP', 'employee_name' => 'Juan', 'shift_id' => $shift->id, 'date' => '2030-02-01', 'status' => 'Scheduled']);
        Attendance::create(['id' => 'ATT900', 'employee_id' => 'EMP-OTP', 'date' => '2030-02-01', 'clock_in' => '08:00:00', 'clock_out' => '17:00:00', 'status' => 'Present', 'regular_hours' => 8, 'total_hours' => 8, 'break_hours' => 1]);

        // Day 2: scheduled, no attendance at all (a gap the grid needs to show as such).
        ShiftSchedule::create(['id' => 'SCH901', 'employee_id' => 'EMP-OTP', 'employee_name' => 'Juan', 'shift_id' => $shift->id, 'date' => '2030-02-02', 'status' => 'Scheduled']);

        // Day 3: on approved leave, not scheduled.
        Leave::create(['id' => 'LVE900', 'employee_id' => 'EMP-OTP', 'employee_name' => 'Juan', 'leave_type' => 'Vacation', 'start_date' => '2030-02-03', 'end_date' => '2030-02-03', 'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-01']);

        $response = $this->actingAs($admin)
            ->getJson('/api/timesheets/employee/EMP-OTP/days?from=2030-02-01&to=2030-02-03')
            ->assertOk();

        $days = collect($response->json('data'))->keyBy('date');

        $this->assertSame('08:00', substr($days['2030-02-01']['scheduledStart'], 0, 5));
        $this->assertSame('ATT900', $days['2030-02-01']['attendance']['id']);

        $this->assertSame('08:00', substr($days['2030-02-02']['scheduledStart'], 0, 5));
        $this->assertNull($days['2030-02-02']['attendance']);

        $this->assertNull($days['2030-02-03']['scheduledStart']);
        $this->assertSame('Vacation', $days['2030-02-03']['leaveType']);
    }

    public function test_an_employee_cannot_read_another_employees_days(): void
    {
        Employee::create(['id' => 'EMP-OTHER', 'first_name' => 'A', 'last_name' => 'B', 'email' => 'ab@x.com', 'status' => 'Active']);

        $this->actingAs($this->otpEmployeeUser())
            ->getJson('/api/timesheets/employee/EMP-OTHER/days?from=2030-02-01&to=2030-02-03')
            ->assertStatus(403);
    }
}
