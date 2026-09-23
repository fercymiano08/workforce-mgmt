<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\AuthController;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * An employee's login runs out 3 minutes after their last real activity, enforced by the server. The browser
 * keeps it alive only while they use the system; ordinary requests (background polling) do NOT extend it.
 * Administrators are not timed out.
 */
class SessionTimeoutTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function loginAs(string $role): array
    {
        User::factory()->create([
            'email' => strtolower($role).'@example.com', 'role' => $role, 'role_label' => $role,
            'employee_id' => $role === 'Employee' ? 'EMP-T' : null, 'password' => 'Passw0rd!x',
        ]);

        $response = $this->postJson('/api/auth/login', ['email' => strtolower($role).'@example.com', 'password' => 'Passw0rd!x'])->assertOk();

        return [$response->json('token'), $response->json('sessionTimeoutSeconds')];
    }

    private function me(string $token)
    {
        $this->app['auth']->forgetGuards();     // each request authenticates from its own token

        return $this->withHeader('Authorization', 'Bearer '.$token)->getJson('/api/auth/me');
    }

    private function keepAlive(string $token)
    {
        $this->app['auth']->forgetGuards();

        return $this->withHeader('Authorization', 'Bearer '.$token)->postJson('/api/auth/keep-alive');
    }

    private function at(int $seconds): void
    {
        Carbon::setTestNow(Carbon::parse('2030-01-01 09:00:00')->addSeconds($seconds));
    }

    public function test_an_employee_login_is_told_its_timeout_and_expires_after_three_minutes(): void
    {
        $this->at(0);
        [$token, $timeout] = $this->loginAs('Employee');

        $this->assertSame(AuthController::EMPLOYEE_IDLE_SECONDS, $timeout);
        $this->assertSame(180, $timeout);

        $this->at(179);
        $this->me($token)->assertOk();
        $this->at(181);
        $this->me($token)->assertUnauthorized();
    }

    public function test_ordinary_requests_do_not_keep_an_employee_signed_in(): void
    {
        $this->at(0);
        [$token] = $this->loginAs('Employee');

        $this->at(100);
        $this->me($token)->assertOk();          // e.g. a background poll: allowed, but it does not extend the login
        $this->at(181);
        $this->me($token)->assertUnauthorized();
    }

    public function test_keep_alive_extends_the_login_by_three_more_minutes(): void
    {
        $this->at(0);
        [$token] = $this->loginAs('Employee');

        $this->at(100);
        $this->keepAlive($token)->assertOk()->assertJsonPath('sessionTimeoutSeconds', 180);
        $this->at(270);
        $this->me($token)->assertOk();          // would have expired at 180 without the keep-alive
        $this->at(281);
        $this->me($token)->assertUnauthorized();
    }

    public function test_an_expired_login_cannot_be_revived_by_keep_alive(): void
    {
        $this->at(0);
        [$token] = $this->loginAs('Employee');

        $this->at(200);
        $this->keepAlive($token)->assertUnauthorized();
    }

    public function test_administrators_are_never_timed_out(): void
    {
        $this->at(0);
        [$token, $timeout] = $this->loginAs('Administrator');
        $this->assertNull($timeout);

        $this->at(86400);                       // a whole day later
        $this->me($token)->assertOk();
        $this->keepAlive($token)->assertOk()->assertJsonPath('sessionTimeoutSeconds', null);
    }
}
