<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Notification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Shift times are Manila wall-clock times, but the server runs in UTC. The no-show
 * alert used to compare "08:00" with a UTC now(), so a person absent from an 8 AM
 * shift was only reported around 5 PM Manila time. It must fire at 9:00 AM Manila
 * (shift start + the 60-minute grace period).
 */
class AlertTimezoneTest extends TestCase
{
    use RefreshDatabase;

    private ?\App\Models\User $admin = null;

    private function setUpScheduledEmployee(): void
    {
        Employee::create([
            'id' => 'EMP20260001', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz',
            'email' => 'juan@workforcepro.com', 'department' => 'IT & Systems',
        ]);
        $this->scheduleShift('EMP20260001', '08:00:00', '17:00:00', self::KIOSK_TEST_DATE);
    }

    private function scanAt(string $manilaTime): void
    {
        $this->travelTo(Carbon::parse(self::KIOSK_TEST_DATE.' '.$manilaTime, 'Asia/Manila'));
        $this->admin ??= $this->adminUser();
        $this->actingAs($this->admin)->getJson('/api/attendance/alerts/check')->assertOk();
    }

    public function test_no_show_is_not_flagged_inside_the_grace_period(): void
    {
        $this->setUpScheduledEmployee();

        $this->scanAt('08:59:00');

        $this->assertSame(0, Notification::where('type', 'attendance_absent')->count());
    }

    public function test_no_show_is_flagged_at_nine_in_the_morning_manila_time_not_five_in_the_afternoon(): void
    {
        $this->setUpScheduledEmployee();

        $this->scanAt('09:01:00');   // 01:01 UTC - the old code would still say "not yet"

        $this->assertSame(1, Notification::where('type', 'attendance_absent')->count());
    }

    public function test_the_early_morning_scan_belongs_to_the_manila_day_not_the_utc_day(): void
    {
        $this->setUpScheduledEmployee();

        // 06:00 Manila on the test day is still the PREVIOUS day in UTC (22:00). The scan
        // must look at the Manila day, find the 08:00 shift not started, and flag nothing.
        $this->scanAt('06:00:00');

        $this->assertSame(0, Notification::where('type', 'attendance_absent')->count());
    }

    public function test_the_same_no_show_is_not_flagged_twice_in_a_day(): void
    {
        $this->setUpScheduledEmployee();

        $this->scanAt('09:30:00');
        $this->scanAt('10:30:00');

        $this->assertSame(1, Notification::where('type', 'attendance_absent')->count());
    }
}
