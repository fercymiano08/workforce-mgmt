<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\OvertimeRequest;
use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The unpaid lunch comes off by DURATION: once enough hours were worked, the configured minutes are
 * deducted whenever lunch was taken. A short day (a sick early leave, a half day) loses nothing.
 */
class BreakRuleTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->skipKioskFaceCheck();
    }

    private function clockIn(string $time): string
    {
        Employee::create([
            'id' => 'EMP20260001', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz',
            'email' => 'juan@workforcepro.com', 'department' => 'IT & Systems',
        ]);
        $this->scheduleShift('EMP20260001', '08:00:00', '17:00:00');
        $this->freezeKioskClock($time);
        $this->withHeaders($this->kioskDeviceHeaders());
        $this->postJson('/api/kiosk/attendance', [
            'employeeId' => 'EMP20260001', 'date' => self::KIOSK_TEST_DATE, 'clockIn' => $time, 'status' => 'Present',
        ])->assertCreated();

        return Attendance::first()->id;
    }

    private function clockOut(string $id, string $time, bool $early = false): Attendance
    {
        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => $time] + ($early ? ['reasonCode' => 'SICK'] : []))->assertOk();

        return Attendance::first()->fresh();
    }

    private function policy(array $system): void
    {
        Setting::updateOrCreate(['id' => 1], ['system' => $system]);
    }

    public function test_a_full_day_loses_the_hour_of_lunch(): void
    {
        $row = $this->clockOut($this->clockIn('08:00:00'), '17:00:00');

        $this->assertEquals(8.0, (float) $row->total_hours);
        $this->assertEquals(1.0, (float) $row->break_hours);
    }

    public function test_leaving_at_lunch_time_loses_nothing(): void
    {
        // 4.5 hours worked, under the 5-hour minimum: no lunch deducted (it used to lose a full hour)
        $row = $this->clockOut($this->clockIn('08:00:00'), '12:30:00', early: true);

        $this->assertEquals(4.5, (float) $row->total_hours);
        $this->assertEquals(0.0, (float) $row->break_hours);
    }

    public function test_arriving_after_lunch_for_a_half_day_loses_nothing(): void
    {
        $row = $this->clockOut($this->clockIn('12:30:00'), '17:00:00');

        $this->assertEquals(4.5, (float) $row->total_hours);
        $this->assertEquals(0.0, (float) $row->break_hours);
    }

    public function test_the_five_hour_minimum_is_exact(): void
    {
        $id = $this->clockIn('08:00:00');
        $row = $this->clockOut($id, '13:00:00', early: true);         // exactly 5 hours
        $this->assertEquals(4.0, (float) $row->total_hours);
        $this->assertEquals(1.0, (float) $row->break_hours);

        $row->update(['clock_out' => null]);
        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '12:59:00', 'reasonCode' => 'SICK'])->assertOk();
        $row = Attendance::first()->fresh();                           // 4 h 59 min
        $this->assertEquals(0.0, (float) $row->break_hours);
    }

    public function test_the_lunch_length_and_minimum_are_settings(): void
    {
        $this->policy(['lunch_break_minutes' => 30, 'lunch_minimum_hours' => 6]);

        $row = $this->clockOut($this->clockIn('08:00:00'), '17:00:00');

        $this->assertEquals(8.5, (float) $row->total_hours);
        $this->assertEquals(0.5, (float) $row->break_hours);
    }

    public function test_setting_the_lunch_to_zero_turns_the_deduction_off(): void
    {
        $this->policy(['lunch_break_minutes' => 0]);

        $row = $this->clockOut($this->clockIn('08:00:00'), '17:00:00');

        $this->assertEquals(9.0, (float) $row->total_hours);
        $this->assertEquals(0.0, (float) $row->break_hours);
    }

    public function test_changing_the_policy_later_does_not_rewrite_past_days(): void
    {
        $id = $this->clockIn('08:00:00');
        $this->clockOut($id, '17:40:00');                              // counted to 17:00, 8 h, 1 h lunch
        $this->policy(['lunch_break_minutes' => 0]);

        OvertimeRequest::create([
            'id' => 'OT001', 'employee_id' => 'EMP20260001', 'employee_name' => 'Juan', 'date' => self::KIOSK_TEST_DATE,
            'requested_date' => self::KIOSK_TEST_DATE, 'expected_hours' => 1, 'approved_hours' => 1, 'reason' => 'x', 'status' => 'Approved',
        ]);
        $this->artisan('attendance:recount-hours')->assertSuccessful();

        $row = Attendance::first()->fresh();
        $this->assertSame('17:40:00', $row->clock_out);                // the approval still brings the minutes back
        $this->assertEquals(1.0, (float) $row->break_hours);           // but the day keeps the lunch it was counted with
    }
}
