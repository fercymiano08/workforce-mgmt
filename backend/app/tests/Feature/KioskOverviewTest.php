<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/** The open kiosk config never carries the activity log; the administrator's overview does the counting. */
class KioskOverviewTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_the_public_config_does_not_expose_the_activity_log(): void
    {
        $headers = $this->kioskDeviceHeaders();
        $this->withHeaders($headers)->postJson('/api/kiosk/log', ['type' => 'clock-in', 'message' => 'Juan Dela Cruz clocked in'])->assertCreated();

        $this->getJson('/api/kiosk/config')->assertOk()->assertJsonMissingPath('data.logs');
        $this->assertStringNotContainsString('Juan', $this->getJson('/api/kiosk/config')->getContent());

        $this->actingAs($this->adminUser())->getJson('/api/kiosk/logs')->assertOk()->assertJsonPath('data.0.message', 'Juan Dela Cruz clocked in');
    }

    public function test_the_overview_counts_today_and_lists_who_has_not_clocked_in(): void
    {
        $this->kioskDeviceHeaders();
        Carbon::setTestNow(Carbon::parse('2030-01-14 09:30', 'Asia/Manila'));
        foreach (['E-HERE' => 'Here Person', 'E-LATE' => 'Late Person'] as $id => $name) {
            Employee::create(['id' => $id, 'first_name' => $name, 'last_name' => 'X', 'email' => $id.'@x.com', 'department' => 'Ops', 'status' => 'Active']);
            $this->scheduleShift($id, date: '2030-01-14');
        }
        Attendance::create(['id' => 'ATT001', 'employee_id' => 'E-HERE', 'date' => '2030-01-14', 'clock_in' => '08:00:00', 'status' => 'Present']);

        $data = $this->actingAs($this->adminUser())->getJson('/api/kiosk/overview')->assertOk()->json('data');

        $this->assertSame(1, $data['clockIns']);
        $this->assertSame(2, $data['scheduledToday']);
        $this->assertSame(['E-LATE'], array_column($data['waiting'], 'employeeId'));
        $this->assertSame(90, $data['waiting'][0]['minutesLate']);
        $this->assertSame(0, $data['failedAttempts']);
        $this->assertTrue($data['readiness']['pinSet']);
        $this->assertSame(2, $data['readiness']['withoutFace']);   // neither has a registered face
    }

    public function test_kiosk_mode_turns_itself_off_at_midnight(): void
    {
        Carbon::setTestNow(Carbon::parse('2030-01-14 07:00', 'Asia/Manila'));
        $headers = $this->kioskDeviceHeaders();
        $admin = $this->adminUser();

        Carbon::setTestNow(Carbon::parse('2030-01-14 23:59', 'Asia/Manila'));
        $this->getJson('/api/kiosk/config')->assertJsonPath('data.active', true);

        // Past midnight (kiosk time zone): disabled, clock-ins refused, and the switch-off is in the activity log
        Carbon::setTestNow(Carbon::parse('2030-01-15 00:01', 'Asia/Manila'));
        $this->getJson('/api/kiosk/config')->assertJsonPath('data.active', false)->assertJsonPath('data.enabledAt', null);
        $this->actingAs($admin)->getJson('/api/kiosk/overview')->assertJsonPath('data.readiness.kioskActive', false);
        $this->actingAs($admin)->getJson('/api/kiosk/logs')->assertJsonPath('data.0.message', 'Kiosk mode turned off automatically at midnight');
        $this->withHeaders($headers)->postJson('/api/kiosk/log', ['type' => 'clock-in', 'message' => 'x'])->assertStatus(401);

        // Enabling it again the next morning works as usual
        $this->actingAs($admin)->postJson('/api/kiosk/config', ['active' => true, 'enabledAt' => now()->toISOString()])
            ->assertOk()->assertJsonPath('data.active', true);
        $this->getJson('/api/kiosk/config')->assertJsonPath('data.active', true);
    }

    public function test_reset_clears_the_pin_and_the_activity_log(): void
    {
        $headers = $this->kioskDeviceHeaders();
        $admin = $this->adminUser();
        $this->withHeaders($headers)->postJson('/api/kiosk/log', ['type' => 'clock-in', 'message' => 'Someone clocked in'])->assertCreated();

        $this->actingAs($admin)->postJson('/api/kiosk/reset')->assertOk()
            ->assertJsonPath('data.hasPin', false)->assertJsonPath('data.active', false);
        $this->actingAs($admin)->getJson('/api/kiosk/logs')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_only_failed_attempts_count_as_security_alerts(): void
    {
        $headers = $this->kioskDeviceHeaders();
        foreach (['Kiosk terminal unlocked with access PIN', 'Face mismatch - person does not match A B (E1)', 'Failed attempt to unlock the kiosk (incorrect PIN)'] as $message) {
            $this->withHeaders($headers)->postJson('/api/kiosk/log', ['type' => 'security', 'message' => $message])->assertCreated();
        }

        $this->actingAs($this->adminUser())->getJson('/api/kiosk/overview')->assertOk()->assertJsonPath('data.failedAttempts', 2);
    }
}
