<?php

namespace Tests\Feature;

use App\Models\User;
use App\Notifications\ResetPasswordNotification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Notification;
use Illuminate\Support\Facades\Password;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_login(): void
    {
        $this->adminUser();

        $response = $this->postJson('/api/auth/login', [
            'email' => 'admin@workforcepro.com',
            'password' => 'password',
        ]);

        $response->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['user' => ['id', 'firstName', 'lastName', 'email', 'role', 'roleLabel'], 'token']);
    }

    public function test_login_with_invalid_credentials_fails(): void
    {
        $this->adminUser();

        $this->postJson('/api/auth/login', [
            'email' => 'admin@workforcepro.com',
            'password' => 'wrong-password',
        ])->assertStatus(422)
            ->assertJsonValidationErrors('email');
    }

    public function test_login_requires_email_and_password(): void
    {
        $this->postJson('/api/auth/login', [])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['email', 'password']);
    }

    public function test_me_returns_authenticated_user(): void
    {
        $user = $this->adminUser();

        $this->actingAs($user)
            ->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('user.id', 'ADMIN');
    }

    public function test_me_requires_authentication(): void
    {
        $this->getJson('/api/auth/me')->assertUnauthorized();
    }

    public function test_logout_revokes_the_token(): void
    {
        $user = $this->adminUser();
        $token = $user->createToken('test-token')->plainTextToken;

        $this->withToken($token)
            ->postJson('/api/auth/logout')
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_logout_does_not_crash_for_session_authenticated_requests(): void
    {
        $user = $this->adminUser();

        $this->actingAs($user)
            ->postJson('/api/auth/logout')
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_change_password_updates_the_account(): void
    {
        $user = $this->adminUser();

        $this->actingAs($user)
            ->postJson('/api/auth/change-password', [
                'current_password' => 'password',
                'new_password' => 'NewPass@123',
                'new_password_confirmation' => 'NewPass@123',
            ])
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertTrue(password_verify('NewPass@123', $user->fresh()->password));
    }

    public function test_change_password_rejects_wrong_current_password(): void
    {
        $user = $this->adminUser();

        $this->actingAs($user)
            ->postJson('/api/auth/change-password', [
                'current_password' => 'not-the-password',
                'new_password' => 'NewPass@123',
                'new_password_confirmation' => 'NewPass@123',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('current_password');
    }

    public function test_change_password_requires_confirmation(): void
    {
        $user = $this->adminUser();

        $this->actingAs($user)
            ->postJson('/api/auth/change-password', [
                'current_password' => 'password',
                'new_password' => 'NewPass@123',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('new_password');
    }

    public function test_forgot_password_sends_a_reset_link_for_a_known_email(): void
    {
        Notification::fake();
        $user = $this->adminUser();

        $this->postJson('/api/auth/forgot-password', ['email' => 'admin@workforcepro.com'])
            ->assertOk()
            ->assertJsonPath('success', true);

        Notification::assertSentTo($user, ResetPasswordNotification::class);
    }

    public function test_forgot_password_gives_the_same_response_for_an_unknown_email(): void
    {
        Notification::fake();

        $this->postJson('/api/auth/forgot-password', ['email' => 'nobody@example.com'])
            ->assertOk()
            ->assertJsonPath('success', true);

        Notification::assertNothingSent();
    }

    public function test_reset_password_updates_the_password_with_a_valid_token(): void
    {
        $user = $this->adminUser();
        $token = Password::createToken($user);

        $this->postJson('/api/auth/reset-password', [
            'email' => 'admin@workforcepro.com',
            'token' => $token,
            'password' => 'BrandNew@123',
            'password_confirmation' => 'BrandNew@123',
        ])->assertOk()->assertJsonPath('success', true);

        $this->assertTrue(password_verify('BrandNew@123', $user->fresh()->password));
    }

    public function test_reset_password_rejects_an_invalid_token(): void
    {
        $this->adminUser();

        $this->postJson('/api/auth/reset-password', [
            'email' => 'admin@workforcepro.com',
            'token' => 'not-a-real-token',
            'password' => 'BrandNew@123',
            'password_confirmation' => 'BrandNew@123',
        ])->assertStatus(422)->assertJsonValidationErrors('email');
    }
}
