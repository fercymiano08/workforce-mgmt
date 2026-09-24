<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Notification;
use App\Models\SecurityEvent;
use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The kiosk's clock-in / clock-out rules, enforced by the SERVER (the terminal
 * only explains them):
 *   - no shift today            -> cannot clock in
 *   - shift already over        -> cannot clock in
 *   - within 15 min of start    -> Present (15:00 exactly is still on time)
 *   - later than that           -> Late (allowed, admins are told)
 *   - leaving before shift end  -> a reason must be stated first
 *   - face mismatch             -> logged AND the Workforce Admins are alerted
 */
class KioskGuardrailTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->skipKioskFaceCheck();
    }

    private function employee(string $id = 'EMP20260001'): Employee
    {
        return Employee::create([
            'id' => $id,
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'email' => $id.'@workforcepro.com',
            'department' => 'IT & Systems',
        ]);
    }

    /** @return \Illuminate\Testing\TestResponse */
    private function clockIn(string $employeeId = 'EMP20260001', string $clientStatus = 'Present')
    {
        return $this->postJson('/api/kiosk/attendance', [
            'employeeId' => $employeeId,
            'date' => self::KIOSK_TEST_DATE,
            'clockIn' => '08:00:00',   // deliberately not the real time: the server ignores it
            'status' => $clientStatus,
            'location' => 'Main Entrance',
        ]);
    }

    public function test_no_shift_today_blocks_clock_in(): void
    {
        $this->employee();
        $this->freezeKioskClock('09:00:00');
        $this->withHeaders($this->kioskDeviceHeaders());

        $this->clockIn()->assertStatus(422)->assertJsonPath('data.reason', 'no_shift');

        $this->assertSame(0, Attendance::count());
    }

    public function test_being_evening_with_no_shift_is_not_late_it_is_refused(): void
    {
        // The reported bug: 9:30 PM, no shift -> the terminal said "late" and recorded it.
        $this->employee();
        $this->freezeKioskClock('21:30:00');
        $this->withHeaders($this->kioskDeviceHeaders());

        $this->clockIn('EMP20260001', 'Late')->assertStatus(422)->assertJsonPath('data.reason', 'no_shift');

        $this->assertSame(0, Attendance::count());
        $this->assertSame(0, Notification::where('type', 'attendance_late')->count());
    }

    public function test_a_cancelled_schedule_does_not_count_as_a_shift(): void
    {
        $this->employee();
        $this->freezeKioskClock('08:00:00');
        $this->scheduleShift('EMP20260001');
        \App\Models\ShiftSchedule::query()->update(['status' => 'Cancelled']);
        $this->withHeaders($this->kioskDeviceHeaders());

        $this->clockIn()->assertStatus(422)->assertJsonPath('data.reason', 'no_shift');
    }

    public function test_clocking_in_after_the_shift_has_ended_is_refused(): void
    {
        $this->employee();
        $this->scheduleShift('EMP20260001', '08:00:00', '17:00:00');
        $this->freezeKioskClock('21:30:00');
        $this->withHeaders($this->kioskDeviceHeaders());

        $this->clockIn('EMP20260001', 'Late')->assertStatus(422)->assertJsonPath('data.reason', 'shift_over');

        $this->assertSame(0, Attendance::count());
    }

    public function test_approved_overtime_extends_the_window_to_clock_in(): void
    {
        $this->employee();
        $this->scheduleShift('EMP20260001', '08:00:00', '17:00:00');
        \App\Models\OvertimeRequest::create([
            'id' => 'OT001',
            'employee_id' => 'EMP20260001',
            'employee_name' => 'Juan Dela Cruz',
            'date' => self::KIOSK_TEST_DATE,
            'requested_date' => self::KIOSK_TEST_DATE,
            'expected_hours' => 2,
            'approved_hours' => 2,
            'reason' => 'Deadline',
            'status' => 'Approved',
        ]);
        $this->freezeKioskClock('18:00:00'); // past 17:00 but inside the approved 19:00 end
        $this->withHeaders($this->kioskDeviceHeaders());

        $this->clockIn()->assertCreated();
    }

    public function test_on_time_up_to_exactly_fifteen_minutes_is_present(): void
    {
        $this->employee();
        $this->scheduleShift('EMP20260001', '08:00:00', '17:00:00');
        $this->freezeKioskClock('08:15:00');
        $this->withHeaders($this->kioskDeviceHeaders());

        $this->clockIn('EMP20260001', 'Late')   // the client's claim is ignored
            ->assertCreated()
            ->assertJsonPath('data.status', 'Present');

        $this->assertSame(0, Notification::where('type', 'attendance_late')->count());
    }

    public function test_one_second_past_the_grace_period_is_late_and_admins_are_told(): void
    {
        $this->employee();
        $this->scheduleShift('EMP20260001', '08:00:00', '17:00:00');
        $this->freezeKioskClock('08:15:01');
        $this->withHeaders($this->kioskDeviceHeaders());

        $this->clockIn('EMP20260001', 'Present')   // cannot claim to be on time
            ->assertCreated()
            ->assertJsonPath('data.status', 'Late');

        $this->assertSame(1, Notification::where('type', 'attendance_late')->count());
    }

    public function test_hr_can_widen_the_grace_period_from_the_settings_page(): void
    {
        Setting::updateOrCreate(['id' => 1], ['system' => ['late_grace_minutes' => 30]]);

        $this->employee();
        $this->scheduleShift('EMP20260001', '08:00:00', '17:00:00');
        // 20 minutes late - Late under the default 15-minute grace, but this company set 30.
        $this->freezeKioskClock('08:20:00');
        $this->withHeaders($this->kioskDeviceHeaders());

        $this->clockIn('EMP20260001', 'Present')
            ->assertCreated()
            ->assertJsonPath('data.status', 'Present');

        $this->assertSame(0, Notification::where('type', 'attendance_late')->count());
    }

    public function test_the_server_clock_not_the_terminal_sets_the_recorded_time(): void
    {
        $this->employee();
        $this->scheduleShift('EMP20260001', '08:00:00', '17:00:00');
        $this->freezeKioskClock('09:47:12');
        $this->withHeaders($this->kioskDeviceHeaders());

        $this->clockIn()->assertCreated()->assertJsonPath('data.status', 'Late');

        $this->assertSame('09:47:12', Attendance::first()->clock_in);
    }

    public function test_leaving_early_needs_a_reason_first(): void
    {
        $this->employee();
        $this->scheduleShift('EMP20260001', '08:00:00', '17:00:00');
        $this->freezeKioskClock('08:00:00');
        $this->withHeaders($this->kioskDeviceHeaders());
        $this->clockIn()->assertCreated();
        $id = Attendance::first()->id;

        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '16:59:00'])
            ->assertStatus(422)
            ->assertJsonPath('data.reason', 'reason_required');

        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '16:59:00', 'reasonCode' => 'SICK'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Early Leave');
    }

    public function test_clocking_out_exactly_at_shift_end_needs_no_reason(): void
    {
        $this->employee();
        $this->scheduleShift('EMP20260001', '08:00:00', '17:00:00');
        $this->freezeKioskClock('08:00:00');
        $this->withHeaders($this->kioskDeviceHeaders());
        $this->clockIn()->assertCreated();
        $id = Attendance::first()->id;

        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '17:00:00'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Present');
    }

    public function test_a_face_mismatch_is_recorded_and_alerts_the_admins(): void
    {
        $this->employee();
        $this->freezeKioskClock('08:00:00');
        $this->withHeaders($this->kioskDeviceHeaders());

        $this->postJson('/api/kiosk/log', [
            'type' => 'security',
            'message' => 'Face mismatch - person does not match Juan Dela Cruz (EMP20260001)',
            'employeeId' => 'EMP20260001',
        ])->assertCreated();

        $this->assertSame(1, SecurityEvent::where('type', 'face_mismatch')->count());

        $alert = Notification::where('type', 'security_face_mismatch')->first();
        $this->assertNotNull($alert, 'the Workforce Admins must be notified of a face mismatch');
        $this->assertSame('high', $alert->priority);
        $this->assertStringContainsString('EMP20260001', $alert->message);
    }
}
