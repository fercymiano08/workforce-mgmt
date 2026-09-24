<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Notification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The admins' attendance alerts are raised by the every-minute job - no dashboard visit needed - with the facts
 * right (who, which shift time), at the right moment (once the absent-grace time has passed), and only once.
 */
class AttendanceAlertsTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function at(string $manila): void
    {
        Carbon::setTestNow(Carbon::parse('2030-01-14 '.$manila, 'Asia/Manila'));
    }

    private function alerts(string $type)
    {
        return Notification::where('type', $type)->get();
    }

    public function test_a_no_show_is_raised_by_the_job_right_after_the_grace_time_with_the_shift_time_and_only_once(): void
    {
        Employee::create(['id' => 'EMP1', 'first_name' => 'Ana', 'last_name' => 'Cruz', 'email' => 'a@x.com', 'status' => 'Active']);
        $this->scheduleShift('EMP1', '08:00:00', '17:00:00', '2030-01-14');

        $this->at('08:59:00');                       // default grace: 60 minutes after the 8:00 start
        $this->artisan('attendance:check-alerts')->assertSuccessful();
        $this->assertCount(0, $this->alerts('attendance_absent'));

        $this->at('09:00:30');
        $this->artisan('attendance:check-alerts')->assertSuccessful();
        $alert = $this->alerts('attendance_absent')->sole();
        $this->assertSame('Ana Cruz (#EMP1) was due at 8:00 AM today but hasn\'t clocked in.', $alert->message);
        $this->assertSame('2030-01-14 09:00', $alert->timestamp->copy()->setTimezone('Asia/Manila')->format('Y-m-d H:i'));   // when it was noticed

        foreach (['09:01:00', '09:02:00', '13:00:00'] as $time) {   // every later minute: nothing new
            $this->at($time);
            $this->artisan('attendance:check-alerts')->assertSuccessful();
        }
        $this->assertCount(1, $this->alerts('attendance_absent'));
    }

    public function test_someone_who_clocked_in_is_never_flagged(): void
    {
        Employee::create(['id' => 'EMP1', 'first_name' => 'Ana', 'last_name' => 'Cruz', 'email' => 'a@x.com', 'status' => 'Active']);
        $this->scheduleShift('EMP1', '08:00:00', '17:00:00', '2030-01-14');
        Attendance::create(['id' => 'ATT1', 'employee_id' => 'EMP1', 'date' => '2030-01-14', 'clock_in' => '08:05:00', 'status' => 'Present']);

        $this->at('10:00:00');
        $this->artisan('attendance:check-alerts')->assertSuccessful();

        $this->assertCount(0, $this->alerts('attendance_absent'));
    }

    public function test_a_staffing_shortage_is_announced_once_a_day_not_every_minute(): void
    {
        foreach (['EMP1', 'EMP2', 'EMP3'] as $i => $id) {
            Employee::create(['id' => $id, 'first_name' => 'P', 'last_name' => $id, 'email' => $id.'@x.com', 'status' => 'Active']);
        }
        Leave::create(['id' => 'LVE1', 'employee_id' => 'EMP1', 'employee_name' => 'P', 'leave_type' => 'Vacation', 'start_date' => '2030-01-14', 'end_date' => '2030-01-14',
            'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-01']);   // 1 of 3 on leave: above 20%

        foreach (['08:00:00', '08:01:00', '12:00:00'] as $time) {
            $this->at($time);
            $this->artisan('attendance:check-alerts')->assertSuccessful();
        }

        $alert = $this->alerts('staff_shortage')->sole();
        $this->assertSame('1 of 3 employees are on approved leave today (Jan 14, 2030).', $alert->message);
    }
}
