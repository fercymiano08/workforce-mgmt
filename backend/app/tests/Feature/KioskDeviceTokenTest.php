<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\SecurityEvent;
use App\Models\Setting;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class KioskDeviceTokenTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->skipKioskFaceCheck();
    }

    private const PROTECTED = [
        ['GET', '/api/kiosk/employees'],
        ['GET', '/api/kiosk/employees/EMP20260001'],
        ['GET', '/api/kiosk/schedule/EMP20260001'],
        ['GET', '/api/kiosk/attendance/EMP20260001'],
        ['POST', '/api/kiosk/attendance'],
        ['PUT', '/api/kiosk/attendance/ATT001'],
        ['POST', '/api/kiosk/verify-face'],
        ['POST', '/api/kiosk/log'],
    ];

    private function employee(): Employee
    {
        return Employee::create([
            'id' => 'EMP20260001',
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'email' => 'juan@workforcepro.com',
            'department' => 'IT & Systems',
        ]);
    }

    private function clockInPayload(): array
    {
        return [
            'employeeId' => 'EMP20260001',
            'date' => now()->toDateString(),
            'clockIn' => '08:00:00',
            'status' => 'Present',
        ];
    }

    public function test_kiosk_endpoints_reject_a_request_with_no_token(): void
    {
        $this->employee();
        $this->kioskDeviceHeaders(); // a PIN exists, but this request is not unlocked

        foreach (self::PROTECTED as [$method, $uri]) {
            $this->json($method, $uri, [])
                ->assertUnauthorized()
                ->assertJsonPath('code', 'kiosk_locked');
        }

        $this->assertSame(0, Attendance::count());
    }

    public function test_kiosk_endpoints_reject_a_forged_or_malformed_token(): void
    {
        $this->employee();
        $good = $this->kioskDeviceHeaders()['X-Kiosk-Token'];
        [$expiry] = explode('.', $good);

        foreach (['garbage', '999999999999.deadbeef', $expiry.'.'.str_repeat('0', 64), '.'.str_repeat('a', 64)] as $bad) {
            $this->withHeaders(['X-Kiosk-Token' => $bad])
                ->postJson('/api/kiosk/attendance', $this->clockInPayload())
                ->assertUnauthorized();
        }
    }

    public function test_an_expired_token_is_rejected(): void
    {
        $this->employee();
        $token = $this->kioskDeviceHeaders()['X-Kiosk-Token'];

        $this->travel(2)->days();

        $this->withHeaders(['X-Kiosk-Token' => $token])
            ->postJson('/api/kiosk/attendance', $this->clockInPayload())
            ->assertUnauthorized();
    }

    public function test_a_valid_token_lets_the_device_clock_in(): void
    {
        $this->employee();
        $this->freezeKioskClock('08:00:00');
        $this->scheduleShift('EMP20260001');

        $this->withHeaders($this->kioskDeviceHeaders())
            ->postJson('/api/kiosk/attendance', $this->clockInPayload())
            ->assertCreated();
    }

    public function test_changing_the_pin_voids_every_earlier_token(): void
    {
        $this->employee();
        $oldToken = $this->kioskDeviceHeaders()['X-Kiosk-Token'];

        $this->actingAs($this->adminUser())
            ->postJson('/api/kiosk/pin', ['pin' => '987654'])
            ->assertOk();

        $this->withHeaders(['X-Kiosk-Token' => $oldToken])
            ->postJson('/api/kiosk/attendance', $this->clockInPayload())
            ->assertUnauthorized();
    }

    public function test_setting_the_pin_gives_the_admins_device_a_working_token(): void
    {
        $this->employee();
        $this->freezeKioskClock('08:00:00');
        $this->scheduleShift('EMP20260001');

        $token = $this->actingAs($this->adminUser())
            ->postJson('/api/kiosk/pin', ['pin' => '4321'])
            ->assertOk()
            ->json('token');

        $this->assertNotEmpty($token);

        // The kiosk must also be switched on before it accepts clock-ins.
        $setting = Setting::first();
        $setting->kiosk = array_merge($setting->kiosk, ['active' => true]);
        $setting->save();

        $this->app['auth']->forgetGuards();
        $this->withHeaders(['X-Kiosk-Token' => $token])
            ->postJson('/api/kiosk/attendance', $this->clockInPayload())
            ->assertCreated();
    }

    public function test_correct_pin_returns_a_token_and_wrong_pin_does_not(): void
    {
        $this->kioskDeviceHeaders(); // PIN is 1234

        $this->postJson('/api/kiosk/verify-pin', ['pin' => '1234'])
            ->assertOk()
            ->assertJsonPath('ok', true)
            ->assertJsonStructure(['token', 'expiresAt']);

        $this->postJson('/api/kiosk/verify-pin', ['pin' => '0000'])
            ->assertOk()
            ->assertJsonPath('ok', false)
            ->assertJsonMissingPath('token');
    }

    public function test_a_wrong_pin_is_logged_as_a_security_event_by_the_server(): void
    {
        $this->kioskDeviceHeaders();

        $this->postJson('/api/kiosk/verify-pin', ['pin' => '0000'])->assertOk();

        $this->assertSame(1, SecurityEvent::where('type', 'pin_failed')->count());
    }

    public function test_verify_pin_is_rate_limited(): void
    {
        $this->kioskDeviceHeaders();

        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/kiosk/verify-pin', ['pin' => '0000'])->assertOk();
        }

        $this->postJson('/api/kiosk/verify-pin', ['pin' => '0000'])->assertStatus(429);
    }

    public function test_no_token_can_be_issued_while_no_pin_is_set(): void
    {
        $this->postJson('/api/kiosk/verify-pin', ['pin' => '1234'])
            ->assertOk()
            ->assertJsonPath('ok', false);

        $this->postJson('/api/kiosk/attendance', $this->clockInPayload())->assertUnauthorized();
    }

    public function test_clock_in_is_refused_while_the_kiosk_is_switched_off(): void
    {
        $this->employee();

        $this->withHeaders($this->kioskDeviceHeaders(active: false))
            ->postJson('/api/kiosk/attendance', $this->clockInPayload())
            ->assertStatus(423)
            ->assertJsonPath('code', 'kiosk_inactive');

        $this->assertSame(0, Attendance::count());
    }

    public function test_config_stays_public_so_a_locked_device_can_show_its_state(): void
    {
        $this->getJson('/api/kiosk/config')->assertOk();
    }

    public function test_an_unlock_lasts_until_midnight_however_early_or_late_it_was_made(): void
    {
        $this->kioskDeviceHeaders();      // sets a PIN
        \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2030-01-14 07:00', 'Asia/Manila'));
        $morning = \App\Services\KioskDeviceToken::issue();
        \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2030-01-14 15:30', 'Asia/Manila'));
        $afternoon = \App\Services\KioskDeviceToken::issue();

        $midnight = \Illuminate\Support\Carbon::parse('2030-01-15 00:00', 'Asia/Manila')->timestamp;
        $this->assertSame($midnight, $morning['expiresAt']);
        $this->assertSame($midnight, $afternoon['expiresAt']);

        \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2030-01-14 23:59', 'Asia/Manila'));
        $this->assertTrue(\App\Services\KioskDeviceToken::valid($morning['token']));

        \Illuminate\Support\Carbon::setTestNow(\Illuminate\Support\Carbon::parse('2030-01-15 00:01', 'Asia/Manila'));
        $this->assertFalse(\App\Services\KioskDeviceToken::valid($morning['token']));

        \Illuminate\Support\Carbon::setTestNow();
    }
}
