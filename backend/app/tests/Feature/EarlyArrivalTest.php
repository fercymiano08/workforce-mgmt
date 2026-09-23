<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Services\ShiftHours;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Arriving early: the kiosk opens 30 minutes before the shift, and paid time starts at the shift start
 * (the real tap-in is kept, but minutes before the start are not counted).
 */
class EarlyArrivalTest extends TestCase
{
    use RefreshDatabase;

    private function setUpEmployee(string $now): void
    {
        Employee::create([
            'id' => 'EMP20260001', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz',
            'email' => 'juan@workforcepro.com', 'department' => 'IT & Systems',
        ]);
        $this->scheduleShift('EMP20260001', '08:00:00', '17:00:00');
        $this->freezeKioskClock($now);
        $this->withHeaders($this->kioskDeviceHeaders());
    }

    private function clockIn()
    {
        return $this->postJson('/api/kiosk/attendance', [
            'employeeId' => 'EMP20260001', 'date' => self::KIOSK_TEST_DATE, 'clockIn' => '00:00:00',
            'status' => 'Present', 'regularHours' => 0, 'overtime' => 0, 'totalHours' => 0, 'breakHours' => 0,
        ]);
    }

    public function test_the_kiosk_refuses_a_clock_in_earlier_than_the_early_window(): void
    {
        $this->setUpEmployee('07:00:00');   // an hour before an 08:00 shift; the window opens at 07:30

        $this->clockIn()->assertStatus(422)->assertJsonPath('data.reason', 'too_early')->assertJsonPath('data.opensAt', '07:30');
        $this->assertSame(0, Attendance::count());
    }

    public function test_arriving_inside_the_window_is_allowed_but_paid_time_starts_at_the_shift_start(): void
    {
        $this->setUpEmployee('07:40:00');   // 20 minutes early, inside the 30-minute window

        $id = $this->clockIn()->assertCreated()->json('data.id');
        $this->assertSame('Present', Attendance::find($id)->status);
        $this->assertSame('07:40:00', Attendance::find($id)->clock_in);   // the real tap-in is kept

        $this->freezeKioskClock('17:00:00');
        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '17:00:00'])->assertOk();

        $row = Attendance::find($id);
        $this->assertEquals(8.0, (float) $row->total_hours);   // 08:00-17:00 less lunch, not 08:40-17:00 counted from 07:40
    }

    public function test_count_ignores_minutes_before_the_shift_start(): void
    {
        $tz = 'Asia/Manila';
        $d = '2030-01-16';
        $count = fn (string $in) => ShiftHours::count(
            Carbon::parse("$d $in:00", $tz), Carbon::parse("$d 17:00:00", $tz), Carbon::parse("$d 17:00:00", $tz), Carbon::parse("$d 17:00:00", $tz),
            60, ShiftHours::baseStart($d, '08:00:00', $tz),
        );

        $this->assertEquals(8.0, $count('08:00')['total']);
        $this->assertEquals(8.0, $count('07:30')['total']);   // early: not counted
        $this->assertEquals(7.0, $count('09:00')['total']);   // late: counted from the real tap-in
    }
}
