<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Notification;
use App\Models\OvertimeRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Time after the end of the shift only counts when an overtime request was approved for it, and
 * the SERVER works out the hours - whatever numbers the terminal sends are ignored.
 */
class CountedHoursTest extends TestCase
{
    use RefreshDatabase;

    private function clockInAt8(): string
    {
        Employee::create([
            'id' => 'EMP20260001', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz',
            'email' => 'juan@workforcepro.com', 'department' => 'IT & Systems',
        ]);
        $this->scheduleShift('EMP20260001', '08:00:00', '17:00:00');
        $this->freezeKioskClock('08:00:00');
        $this->withHeaders($this->kioskDeviceHeaders());
        $this->postJson('/api/kiosk/attendance', [
            'employeeId' => 'EMP20260001', 'date' => self::KIOSK_TEST_DATE, 'clockIn' => '08:00:00',
            'status' => 'Present', 'regularHours' => 0, 'overtime' => 0, 'totalHours' => 0, 'breakHours' => 0,
        ])->assertCreated();

        return Attendance::first()->id;
    }

    private function approveOvertime(float $hours): void
    {
        OvertimeRequest::create([
            'id' => 'OT001', 'employee_id' => 'EMP20260001', 'employee_name' => 'Juan Dela Cruz',
            'date' => self::KIOSK_TEST_DATE, 'requested_date' => self::KIOSK_TEST_DATE,
            'expected_hours' => $hours, 'approved_hours' => $hours, 'reason' => 'Deadline', 'status' => 'Approved',
        ]);
    }

    public function test_three_minutes_past_the_end_counts_as_exactly_the_end(): void
    {
        $id = $this->clockInAt8();

        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '17:03:00'])->assertOk();

        $row = Attendance::first();
        $this->assertSame('17:00:00', $row->clock_out);       // shown as the end of the shift
        $this->assertEquals(8.0, (float) $row->total_hours);  // 08:00-17:00 less the 1 h lunch
        $this->assertEquals(0.0, (float) $row->overtime);     // nothing leftover
        $this->assertSame('17:03:00', $row->actual_clock_out); // the real punch is kept
        $this->assertSame(0, Notification::where('type', 'attendance_unauthorized_ot')->count()); // within the grace period
    }

    public function test_staying_well_past_the_end_without_approval_is_not_counted_and_alerts_hr(): void
    {
        $id = $this->clockInAt8();

        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '17:40:00'])->assertOk();

        $row = Attendance::first();
        $this->assertSame('17:00:00', $row->clock_out);
        $this->assertEquals(0.0, (float) $row->overtime);
        $this->assertSame(1, Notification::where('type', 'attendance_unauthorized_ot')->count());
    }

    public function test_approved_overtime_counts_in_full(): void
    {
        $id = $this->clockInAt8();
        $this->approveOvertime(2);

        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '19:00:00'])->assertOk();

        $row = Attendance::first();
        $this->assertSame('19:00:00', $row->clock_out);
        $this->assertEquals(10.0, (float) $row->total_hours);  // 08:00-19:00 less the 1 h lunch
        $this->assertEquals(2.0, (float) $row->overtime);
        $this->assertEquals(8.0, (float) $row->regular_hours);
    }

    public function test_time_beyond_the_approved_end_is_not_counted(): void
    {
        $id = $this->clockInAt8();
        $this->approveOvertime(2);

        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '19:20:00'])->assertOk();

        $row = Attendance::first();
        $this->assertSame('19:00:00', $row->clock_out);
        $this->assertEquals(2.0, (float) $row->overtime);
    }

    public function test_hours_sent_by_the_terminal_are_ignored(): void
    {
        $id = $this->clockInAt8();

        $this->putJson('/api/kiosk/attendance/'.$id, [
            'clockOut' => '17:00:00', 'regularHours' => 99, 'overtime' => 5, 'totalHours' => 104, 'breakHours' => 0,
        ])->assertOk();

        $row = Attendance::first();
        $this->assertEquals(8.0, (float) $row->total_hours);
        $this->assertEquals(0.0, (float) $row->overtime);
        $this->assertEquals(1.0, (float) $row->break_hours);
    }

    public function test_an_overtime_request_approved_afterwards_brings_the_time_back_and_withdrawing_it_removes_it_again(): void
    {
        $id = $this->clockInAt8();
        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '17:40:00'])->assertOk();
        $this->assertEquals(0.0, (float) Attendance::first()->overtime);

        $this->approveOvertime(1);                      // approved the next day, say
        $this->artisan('attendance:recount-hours')->assertSuccessful();
        $row = Attendance::first();
        $this->assertSame('17:40:00', $row->clock_out);
        $this->assertEquals(0.67, (float) $row->overtime);
        $this->assertEquals(8.67, (float) $row->total_hours);

        OvertimeRequest::where('id', 'OT001')->update(['status' => 'Cancelled']);
        $this->artisan('attendance:recount-hours')->assertSuccessful();
        $row = Attendance::first();
        $this->assertSame('17:00:00', $row->clock_out);
        $this->assertEquals(0.0, (float) $row->overtime);
        $this->assertSame('17:40:00', $row->actual_clock_out);
    }

    public function test_the_employee_gets_a_quiet_confirmation_for_clocking_in_and_out(): void
    {
        $id = $this->clockInAt8();

        $in = Notification::where('type', 'attendance_clock_in')->first();
        $this->assertSame('EMP20260001', $in->employee_id);
        $this->assertSame('low', $in->priority);
        $this->assertStringContainsString('8:00 AM (on time)', $in->message);

        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '17:03:00'])->assertOk();

        $out = Notification::where('type', 'attendance_clock_out')->first();
        $this->assertSame('EMP20260001', $out->employee_id);
        $this->assertStringContainsString('clocked out at 5:00 PM. 8 hours counted', $out->message);
        $this->assertStringContainsString('last 3 minutes', $out->message);
    }

    public function test_leaving_early_sends_no_extra_confirmation(): void
    {
        $id = $this->clockInAt8();

        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '16:00:00', 'reasonCode' => 'SICK'])->assertOk();

        $this->assertSame(0, Notification::where('type', 'attendance_clock_out')->count());
    }
}
