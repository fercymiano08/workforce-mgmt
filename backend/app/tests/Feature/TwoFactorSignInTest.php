<?php

namespace Tests\Feature;

use App\Http\Controllers\Api\AuthController;
use App\Mail\TwoFactorCodeMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Two-factor sign-in.
 *
 * The point of these tests is that the second step is load bearing. A password alone must not produce
 * a usable session, a code must not work twice, a code must not outlive its window, and turning the
 * feature off must not be something a borrowed browser can do on its own.
 */
class TwoFactorSignInTest extends TestCase
{
    use RefreshDatabase;

    private function employeeWithTwoFactor(bool $enabled = true): User
    {
        $user = $this->otpEmployeeUser();
        $user->forceFill(['two_factor_enabled' => $enabled])->save();

        return $user;
    }

    /**
     * Pull a code straight out of the faked mail, so a test uses the code a person would receive.
     *
     * Reads the first send. Codes are mailed with dispatchAfterResponse, and inside a test the app
     * is reused across requests, so a deferred send from an earlier request can land during a later
     * one. That makes "which send was this" unreliable past the first request, which is why no test
     * here depends on ordering - they assert the stored state instead.
     */
    private function mailedCode(): string
    {
        $sent = Mail::sent(TwoFactorCodeMail::class)->first();
        $this->assertNotNull($sent, 'no sign-in code was sent');

        return $sent->otp;
    }

    public function test_login_with_two_factor_on_does_not_issue_a_token(): void
    {
        Mail::fake();
        $user = $this->employeeWithTwoFactor();

        $response = $this->postJson('/api/auth/login', [
            'email' => $user->email,
            'password' => 'password',
        ]);

        $response->assertOk()
            ->assertJsonPath('requiresTwoFactor', true)
            ->assertJsonPath('email', $user->email)
            // The whole point: nothing that could be used as a session may come back yet.
            ->assertJsonMissingPath('token')
            ->assertJsonMissingPath('user');

        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_login_stores_the_code_hashed_not_in_plain_text(): void
    {
        Mail::fake();
        $user = $this->employeeWithTwoFactor();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])->assertOk();

        $row = DB::table('two_factor_challenges')->where('user_id', $user->id)->first();
        $this->assertNotNull($row);
        $this->assertTrue(Hash::isHashed($row->code));
    }

    public function test_correct_code_completes_the_sign_in(): void
    {
        Mail::fake();
        $user = $this->employeeWithTwoFactor();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])->assertOk();
        $code = $this->mailedCode();

        $this->postJson('/api/auth/two-factor/verify', ['email' => $user->email, 'otp' => $code])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonPath('user.email', $user->email)
            ->assertJsonStructure(['token']);
    }

    public function test_the_code_is_single_use(): void
    {
        Mail::fake();
        $user = $this->employeeWithTwoFactor();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])->assertOk();
        $code = $this->mailedCode();

        $this->postJson('/api/auth/two-factor/verify', ['email' => $user->email, 'otp' => $code])->assertOk();

        // Replaying the same code, even immediately, must not mint a second session.
        $this->postJson('/api/auth/two-factor/verify', ['email' => $user->email, 'otp' => $code])
            ->assertStatus(422);
    }

    public function test_a_wrong_code_does_not_sign_anyone_in(): void
    {
        Mail::fake();
        $user = $this->employeeWithTwoFactor();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])->assertOk();

        $this->postJson('/api/auth/two-factor/verify', ['email' => $user->email, 'otp' => '000000'])
            ->assertStatus(422);

        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_guessing_is_capped_per_challenge(): void
    {
        Mail::fake();
        $user = $this->employeeWithTwoFactor();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])->assertOk();
        $code = $this->mailedCode();

        // Burn the allowance with wrong guesses.
        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/two-factor/verify', ['email' => $user->email, 'otp' => '111111'])
                ->assertStatus(422);
        }

        // The genuine code must now be refused too: an unlimited-guess challenge is the same as no
        // second factor at all.
        $this->postJson('/api/auth/two-factor/verify', ['email' => $user->email, 'otp' => $code])
            ->assertStatus(422);
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_an_expired_code_is_refused(): void
    {
        Mail::fake();
        $user = $this->employeeWithTwoFactor();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])->assertOk();
        $code = $this->mailedCode();

        DB::table('two_factor_challenges')->where('user_id', $user->id)->update([
            'expires_at' => now()->subMinute(),
        ]);

        $this->postJson('/api/auth/two-factor/verify', ['email' => $user->email, 'otp' => $code])
            ->assertStatus(422);
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_a_new_sign_in_supersedes_the_previous_code(): void
    {
        Mail::fake();
        $user = $this->employeeWithTwoFactor();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])->assertOk();
        $first = $this->mailedCode();

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])->assertOk();

        // Retrying must replace the challenge, never stack another one beside it: two live codes
        // would mean an attacker holding one still has a second shot after the owner is suspicious.
        $this->assertSame(
            1,
            DB::table('two_factor_challenges')->where('user_id', $user->id)->count(),
            'a second sign-in must replace the first challenge, not add to it'
        );

        // And the superseded code must be dead.
        $this->postJson('/api/auth/two-factor/verify', ['email' => $user->email, 'otp' => $first])
            ->assertStatus(422);
        $this->assertSame(0, $user->tokens()->count());
    }

    public function test_verification_fails_for_an_account_with_two_factor_off(): void
    {
        Mail::fake();
        $user = $this->employeeWithTwoFactor(false);

        // A stale row must not be usable to slip into an account that has the feature switched off.
        DB::table('two_factor_challenges')->insert([
            'user_id' => $user->id,
            'code' => Hash::make('123456'),
            'attempts' => 0,
            'expires_at' => now()->addMinutes(5),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->postJson('/api/auth/two-factor/verify', ['email' => $user->email, 'otp' => '123456'])
            ->assertStatus(422);
    }

    public function test_login_is_unchanged_when_two_factor_is_off(): void
    {
        $user = $this->employeeWithTwoFactor(false);

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonMissingPath('requiresTwoFactor')
            ->assertJsonStructure(['token', 'user']);
    }

    public function test_account_can_turn_two_factor_on_for_itself(): void
    {
        $user = $this->employeeWithTwoFactor(false);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor', ['enabled' => true])
            ->assertOk()
            ->assertJsonPath('twoFactorEnabled', true);

        $this->assertTrue((bool) $user->fresh()->two_factor_enabled);
    }

    public function test_turning_two_factor_off_requires_the_current_password(): void
    {
        $user = $this->employeeWithTwoFactor(true);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor', ['enabled' => false, 'password' => 'not-the-password'])
            ->assertStatus(422);

        $this->assertTrue((bool) $user->fresh()->two_factor_enabled, 'the flag must survive a failed attempt');
    }

    public function test_turning_two_factor_off_with_the_right_password_works(): void
    {
        $user = $this->employeeWithTwoFactor(true);
        Sanctum::actingAs($user);

        $this->postJson('/api/auth/two-factor', ['enabled' => false, 'password' => 'password'])
            ->assertOk()
            ->assertJsonPath('twoFactorEnabled', false);

        $this->assertFalse((bool) $user->fresh()->two_factor_enabled);
    }

    public function test_changing_the_setting_voids_any_live_challenge(): void
    {
        Mail::fake();
        $user = $this->employeeWithTwoFactor(true);

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])->assertOk();
        $code = $this->mailedCode();

        Sanctum::actingAs($user);
        $this->postJson('/api/auth/two-factor', ['enabled' => false, 'password' => 'password'])->assertOk();

        // The in-flight code must not survive the setting change, or switching the feature off would
        // leave a usable code lying around.
        $this->postJson('/api/auth/two-factor/verify', ['email' => $user->email, 'otp' => $code])
            ->assertStatus(422);
    }

    public function test_toggling_two_factor_requires_a_session(): void
    {
        $this->postJson('/api/auth/two-factor', ['enabled' => true])->assertStatus(401);
    }

    public function test_the_session_user_reports_the_flag(): void
    {
        $user = $this->employeeWithTwoFactor(true);
        Sanctum::actingAs($user);

        $this->getJson('/api/auth/me')
            ->assertOk()
            ->assertJsonPath('user.twoFactorEnabled', true);
    }

    public function test_employee_sign_in_after_verification_still_gets_the_idle_timeout(): void
    {
        Mail::fake();
        $user = $this->employeeWithTwoFactor(true);

        $this->postJson('/api/auth/login', ['email' => $user->email, 'password' => 'password'])->assertOk();
        $code = $this->mailedCode();

        // The two-factor path must not quietly grant a longer-lived session than an ordinary one.
        $this->postJson('/api/auth/two-factor/verify', ['email' => $user->email, 'otp' => $code])
            ->assertOk()
            ->assertJsonPath('sessionTimeoutSeconds', AuthController::EMPLOYEE_IDLE_SECONDS);
    }
}
