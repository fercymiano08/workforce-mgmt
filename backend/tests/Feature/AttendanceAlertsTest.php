<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Notification;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class AttendanceAlertsTest extends TestCase
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

    public function test_clocking_in_late_notifies_admins_immediately(): void
    {
        $admin = $this->adminUser();
        $employee = $this->employee();

        $this->actingAs($admin)->postJson('/api/attendance', [
            'employeeId' => $employee->id,
            'date' => now()->toDateString(),
            'clockIn' => '09:15',
            'status' => 'Late',
        ])->assertCreated();

        $this->assertDatabaseHas('notifications', ['type' => 'attendance_late']);
    }

    public function test_kiosk_late_clock_in_notifies_admins(): void
    {
        $this->adminUser();
        $employee = $this->employee();

        $this->postJson('/api/kiosk/attendance', [
            'employeeId' => $employee->id,
            'date' => now()->toDateString(),
            'clockIn' => '09:15',
            'status' => 'Late',
        ])->assertCreated();

        $this->assertDatabaseHas('notifications', ['type' => 'attendance_late']);
    }

    public function test_on_time_clock_in_does_not_notify(): void
    {
        $admin = $this->adminUser();
        $employee = $this->employee();

        $this->actingAs($admin)->postJson('/api/attendance', [
            'employeeId' => $employee->id,
            'date' => now()->toDateString(),
            'clockIn' => '08:00',
            'status' => 'Present',
        ])->assertCreated();

        $this->assertDatabaseMissing('notifications', ['type' => 'attendance_late']);
    }

    public function test_employee_cannot_check_alerts(): void
    {
        $employee = $this->employee();
        $user = \App\Models\User::factory()->create([
            'employee_id' => $employee->id, 'role' => 'Employee', 'role_label' => 'Employee',
        ]);

        $this->actingAs($user)->getJson('/api/attendance/alerts/check')->assertForbidden();
    }

    public function test_check_alerts_flags_a_noshow_after_the_grace_period(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 10:00:00')); // a Thursday
        $admin = $this->adminUser();
        $employee = $this->employee();

        ShiftDefinition::create(['id' => 'SHIFT001', 'name' => 'Day Shift', 'start_time' => '08:00', 'end_time' => '17:00']);
        ShiftSchedule::create([
            'id' => 'SCH001', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'shift_id' => 'SHIFT001', 'date' => '2026-08-13', 'status' => 'Scheduled',
        ]);

        $response = $this->actingAs($admin)->getJson('/api/attendance/alerts/check')->assertOk();

        $response->assertJsonPath('data.absentFlagged', 1);
        $this->assertDatabaseHas('notifications', ['type' => 'attendance_absent']);
    }

    public function test_check_alerts_does_not_flag_within_the_grace_period(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 08:30:00'));
        $admin = $this->adminUser();
        $employee = $this->employee();

        ShiftDefinition::create(['id' => 'SHIFT001', 'name' => 'Day Shift', 'start_time' => '08:00', 'end_time' => '17:00']);
        ShiftSchedule::create([
            'id' => 'SCH001', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'shift_id' => 'SHIFT001', 'date' => '2026-08-13', 'status' => 'Scheduled',
        ]);

        $response = $this->actingAs($admin)->getJson('/api/attendance/alerts/check')->assertOk();

        $response->assertJsonPath('data.absentFlagged', 0);
        $this->assertDatabaseMissing('notifications', ['type' => 'attendance_absent']);
    }

    public function test_check_alerts_does_not_flag_someone_who_already_clocked_in(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 10:00:00'));
        $admin = $this->adminUser();
        $employee = $this->employee();

        ShiftDefinition::create(['id' => 'SHIFT001', 'name' => 'Day Shift', 'start_time' => '08:00', 'end_time' => '17:00']);
        ShiftSchedule::create([
            'id' => 'SCH001', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'shift_id' => 'SHIFT001', 'date' => '2026-08-13', 'status' => 'Scheduled',
        ]);
        Attendance::create([
            'id' => 'ATT001', 'employee_id' => $employee->id, 'date' => '2026-08-13',
            'clock_in' => '08:05', 'status' => 'Present',
        ]);

        $response = $this->actingAs($admin)->getJson('/api/attendance/alerts/check')->assertOk();

        $response->assertJsonPath('data.absentFlagged', 0);
    }

    public function test_check_alerts_does_not_reflag_the_same_noshow_twice_in_one_day(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 10:00:00'));
        $admin = $this->adminUser();
        $employee = $this->employee();

        ShiftDefinition::create(['id' => 'SHIFT001', 'name' => 'Day Shift', 'start_time' => '08:00', 'end_time' => '17:00']);
        ShiftSchedule::create([
            'id' => 'SCH001', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'shift_id' => 'SHIFT001', 'date' => '2026-08-13', 'status' => 'Scheduled',
        ]);

        $this->actingAs($admin)->getJson('/api/attendance/alerts/check')->assertOk()->assertJsonPath('data.absentFlagged', 1);
        $this->actingAs($admin)->getJson('/api/attendance/alerts/check')->assertOk()->assertJsonPath('data.absentFlagged', 0);

        $this->assertSame(1, Notification::where('type', 'attendance_absent')->count());
    }

    public function test_check_alerts_flags_an_incomplete_attendance_record_from_a_prior_day(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 10:00:00'));
        $admin = $this->adminUser();
        $employee = $this->employee();

        Attendance::create([
            'id' => 'ATT001', 'employee_id' => $employee->id, 'date' => '2026-08-12',
            'clock_in' => '08:00', 'status' => 'Present',
        ]);

        $response = $this->actingAs($admin)->getJson('/api/attendance/alerts/check')->assertOk();

        $response->assertJsonPath('data.incompleteFlagged', 1);
        $this->assertDatabaseHas('notifications', ['type' => 'attendance_incomplete']);
    }

    public function test_check_alerts_flags_a_staffing_shortage_when_too_many_are_on_approved_leave(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 10:00:00'));
        $admin = $this->adminUser();
        $employees = [$this->employee('EMP001'), $this->employee('EMP002'), $this->employee('EMP003')];

        foreach ($employees as $employee) {
            Leave::create([
                'id' => 'LVE'.$employee->id, 'employee_id' => $employee->id, 'employee_name' => $employee->id,
                'leave_type' => 'Vacation', 'start_date' => '2026-08-13', 'end_date' => '2026-08-13',
                'reason' => 'Test', 'status' => 'Approved', 'applied_date' => '2026-08-01',
            ]);
        }

        $response = $this->actingAs($admin)->getJson('/api/attendance/alerts/check')->assertOk();

        $response->assertJsonPath('data.shortageFlagged', true);
        $this->assertDatabaseHas('notifications', ['type' => 'staff_shortage']);
    }

    public function test_check_alerts_flags_unauthorized_overtime_without_an_approved_request(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 19:30:00'));
        $admin = $this->adminUser();
        $employee = $this->employee();

        Attendance::create([
            'id' => 'ATT001', 'employee_id' => $employee->id, 'date' => '2026-08-13',
            'clock_in' => '08:00', 'clock_out' => '19:30', 'status' => 'Present',
            'overtime' => 2.5,
        ]);

        $response = $this->actingAs($admin)->getJson('/api/attendance/alerts/check')->assertOk();

        $response->assertJsonPath('data.unauthorizedOtFlagged', 1);
        $this->assertDatabaseHas('notifications', ['type' => 'attendance_unauthorized_ot']);
    }

    public function test_check_alerts_does_not_flag_overtime_with_an_approved_request(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 19:30:00'));
        $admin = $this->adminUser();
        $employee = $this->employee();

        \App\Models\OvertimeRequest::create([
            'id' => 'OT001', 'employee_id' => $employee->id, 'employee_name' => 'Test EMP001',
            'date' => '2026-08-13', 'expected_hours' => 3, 'reason' => 'Crunch',
            'status' => 'Approved', 'requested_date' => '2026-08-01',
            'approved_hours' => 3, 'approved_at' => now(),
        ]);

        Attendance::create([
            'id' => 'ATT001', 'employee_id' => $employee->id, 'date' => '2026-08-13',
            'clock_in' => '08:00', 'clock_out' => '19:30', 'status' => 'Present',
            'overtime' => 2.5,
        ]);

        $response = $this->actingAs($admin)->getJson('/api/attendance/alerts/check')->assertOk();

        $response->assertJsonPath('data.unauthorizedOtFlagged', 0);
        $this->assertDatabaseMissing('notifications', ['type' => 'attendance_unauthorized_ot']);
    }

    public function test_clock_out_reminder_notifies_the_employee_while_still_clocked_in(): void
    {
        $admin = $this->adminUser();
        $employee = $this->employee();

        $this->actingAs($admin)->postJson('/api/attendance', [
            'employeeId' => $employee->id,
            'date' => now()->toDateString(),
            'clockIn' => '08:00',
            'status' => 'Present',
        ])->assertCreated();

        $user = \App\Models\User::factory()->create([
            'employee_id' => $employee->id, 'role' => 'Employee', 'role_label' => 'Employee',
        ]);

        $this->actingAs($user)->postJson('/api/attendance/remind-clock-out')
            ->assertOk()
            ->assertJsonPath('data.created', true);

        $this->assertDatabaseHas('notifications', ['type' => 'clock_out_reminder', 'employee_id' => $employee->id]);
    }

    public function test_clock_out_reminder_is_sent_once_per_day(): void
    {
        $admin = $this->adminUser();
        $employee = $this->employee();

        $this->actingAs($admin)->postJson('/api/attendance', [
            'employeeId' => $employee->id,
            'date' => now()->toDateString(),
            'clockIn' => '08:00',
            'status' => 'Present',
        ])->assertCreated();

        $user = \App\Models\User::factory()->create([
            'employee_id' => $employee->id, 'role' => 'Employee', 'role_label' => 'Employee',
        ]);

        $this->actingAs($user)->postJson('/api/attendance/remind-clock-out')
            ->assertOk()
            ->assertJsonPath('data.created', true);

        $this->actingAs($user)->postJson('/api/attendance/remind-clock-out')
            ->assertOk()
            ->assertJsonPath('data.alreadySent', true);

        $this->assertSame(1, \App\Models\Notification::where('type', 'clock_out_reminder')->count());
    }

    public function test_clock_out_reminder_skips_when_not_clocked_in_today(): void
    {
        $admin = $this->adminUser();
        $employee = $this->employee();

        $user = \App\Models\User::factory()->create([
            'employee_id' => $employee->id, 'role' => 'Employee', 'role_label' => 'Employee',
        ]);

        $this->actingAs($user)->postJson('/api/attendance/remind-clock-out')
            ->assertOk()
            ->assertJsonPath('data.created', false);

        $this->assertDatabaseMissing('notifications', ['type' => 'clock_out_reminder']);
    }

    public function test_clock_out_reminder_skips_when_already_clocked_out(): void
    {
        $admin = $this->adminUser();
        $employee = $this->employee();

        $this->actingAs($admin)->postJson('/api/attendance', [
            'employeeId' => $employee->id,
            'date' => now()->toDateString(),
            'clockIn' => '08:00',
            'clockOut' => '17:00',
            'status' => 'Present',
        ])->assertCreated();

        $user = \App\Models\User::factory()->create([
            'employee_id' => $employee->id, 'role' => 'Employee', 'role_label' => 'Employee',
        ]);

        $this->actingAs($user)->postJson('/api/attendance/remind-clock-out')
            ->assertOk()
            ->assertJsonPath('data.created', false);

        $this->assertDatabaseMissing('notifications', ['type' => 'clock_out_reminder']);
    }
}
