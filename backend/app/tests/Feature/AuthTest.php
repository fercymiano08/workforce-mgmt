<?php

namespace Tests\Feature;

use App\Mail\PasswordResetCodeMail;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
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
        Mail::fake();
        $this->otpEmployeeUser();

        $this->postJson('/api/auth/forgot-password', ['email' => 'employee@workforcepro.com'])
            ->assertOk()
            ->assertJsonPath('success', true);

        $record = DB::table('password_reset_tokens')->where('email', 'employee@workforcepro.com')->first();
        $this->assertNotNull($record);
        $this->assertTrue(Hash::isHashed($record->token));
    }

    public function test_forgot_password_is_a_no_op_for_admin_accounts(): void
    {
        Mail::fake();
        $this->adminUser();

        $this->postJson('/api/auth/forgot-password', ['email' => 'admin@workforcepro.com'])
            ->assertOk()
            ->assertJsonPath('success', true);

        // No reset token should be created for the reserved admin account.
        $this->assertSame(
            0,
            DB::table('password_reset_tokens')->where('email', 'admin@workforcepro.com')->count()
        );
    }

    public function test_reset_password_rejects_admin_accounts(): void
    {
        $this->adminUser();

        // A stale token might exist; place one to prove reset is still refused.
        DB::table('password_reset_tokens')->insert([
            'email' => 'admin@workforcepro.com',
            'token' => Hash::make('123456'),
            'created_at' => now(),
        ]);

        $this->postJson('/api/auth/reset-password', [
            'email' => 'admin@workforcepro.com',
            'otp' => '123456',
            'password' => 'BrandNew@123',
            'password_confirmation' => 'BrandNew@123',
        ])->assertStatus(422)->assertJsonValidationErrors('otp');

        $this->assertTrue(
            password_verify('password', User::where('email', 'admin@workforcepro.com')->first()->password)
        );
    }

    public function test_the_reset_code_email_really_is_sent(): void
    {
        Mail::fake();
        $this->otpEmployeeUser();

        $this->postJson('/api/auth/forgot-password', ['email' => 'employee@workforcepro.com'])->assertOk();

        // Storing the token is not the same as sending the code. The old Mail::raw() version of
        // this could not be asserted at all (Laravel's MailFake makes raw() a no-op), so the send
        // could stop happening entirely and the suite would stay green.
        Mail::assertSentCount(1);
        Mail::assertSent(PasswordResetCodeMail::class, function (PasswordResetCodeMail $mail) {
            return $mail->hasTo('employee@workforcepro.com')
                && $mail->hasSubject('WorkForce Pro - Password Reset Code');
        });
    }

    public function test_the_email_carries_a_code_that_actually_works(): void
    {
        Mail::fake();
        $this->otpEmployeeUser();

        $this->postJson('/api/auth/forgot-password', ['email' => 'employee@workforcepro.com'])->assertOk();

        // Pull the real code out of the rendered body and use it. A mail that renders fine but
        // carries the wrong digits is the most annoying possible failure, and it is invisible
        // until somebody actually tries to log in.
        $body = '';
        Mail::assertSent(PasswordResetCodeMail::class, function (PasswordResetCodeMail $mail) use (&$body) {
            $body = $mail->render();

            return true;
        });
        preg_match('/^\s*(\d{6})\s*$/m', $body, $m);

        $this->assertNotEmpty($m, "The emailed message did not contain a 6-digit code. Body was:\n".$body);

        $this->postJson('/api/auth/reset-password', [
            'email' => 'employee@workforcepro.com',
            'otp' => $m[1],
            'password' => 'BrandNew@123',
            'password_confirmation' => 'BrandNew@123',
        ])->assertOk();
    }

    /** Asks for a reset code and returns the digits from the email that "was sent". */
    private function requestResetCode(string $email): string
    {
        Mail::fake();
        $this->postJson('/api/auth/forgot-password', ['email' => $email])->assertOk();

        $body = '';
        Mail::assertSent(PasswordResetCodeMail::class, function (PasswordResetCodeMail $mail) use (&$body) {
            $body = $mail->render();

            return true;
        });
        preg_match('/^\s*(\d{6})\s*$/m', $body, $m);

        return $m[1];
    }

    private function signIn(string $email, string $password)
    {
        return $this->postJson('/api/auth/login', ['email' => $email, 'password' => $password]);
    }

    public function test_forgot_password_round_trip_really_saves_the_new_password(): void
    {
        $user = $this->otpEmployeeUser();
        $user->update(['password' => 'Balderama@123']);
        $email = 'employee@workforcepro.com';
        $oldSession = $user->createToken('signed-in-before-the-reset')->plainTextToken;

        $code = $this->requestResetCode($email);
        $this->postJson('/api/auth/reset-password', [
            'email' => $email, 'otp' => $code, 'password' => 'Fresh@Start9', 'password_confirmation' => 'Fresh@Start9',
        ])->assertOk();

        // What was saved is the NEW password, stored hashed, and it actually signs in
        $this->assertNotSame('Fresh@Start9', $user->fresh()->password);
        $this->signIn($email, 'Fresh@Start9')->assertOk()->assertJsonPath('success', true)->assertJsonStructure(['token']);
        // The old one no longer does
        $this->signIn($email, 'Balderama@123')->assertStatus(422);
        // A session that was open when the reset happened is dropped
        $this->assertSame(0, $user->fresh()->tokens()->where('name', 'signed-in-before-the-reset')->count());
        // The code is single-use and no longer waiting in the table
        $this->assertSame(0, DB::table('password_reset_tokens')->where('email', $email)->count());
        $this->postJson('/api/auth/reset-password', [
            'email' => $email, 'otp' => $code, 'password' => 'Another@Pass1', 'password_confirmation' => 'Another@Pass1',
        ])->assertStatus(422)->assertJsonValidationErrors('otp');
        $this->signIn($email, 'Fresh@Start9')->assertOk();   // and the reused code changed nothing
    }

    public function test_a_wrong_code_or_weak_password_saves_nothing(): void
    {
        $user = $this->otpEmployeeUser();
        $user->update(['password' => 'Balderama@123']);
        $email = 'employee@workforcepro.com';
        $code = $this->requestResetCode($email);
        $wrong = $code === '000000' ? '111111' : '000000';

        $this->postJson('/api/auth/reset-password', ['email' => $email, 'otp' => $wrong, 'password' => 'Fresh@Start9', 'password_confirmation' => 'Fresh@Start9'])
            ->assertStatus(422)->assertJsonValidationErrors('otp');
        $this->postJson('/api/auth/reset-password', ['email' => $email, 'otp' => $code, 'password' => 'weak', 'password_confirmation' => 'weak'])
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->postJson('/api/auth/reset-password', ['email' => $email, 'otp' => $code, 'password' => 'Fresh@Start9', 'password_confirmation' => 'Different@1'])
            ->assertStatus(422)->assertJsonValidationErrors('password');

        $this->signIn($email, 'Balderama@123')->assertOk();   // still the old password
        $this->assertSame(1, DB::table('password_reset_tokens')->where('email', $email)->count());   // and the good code still works
        $this->postJson('/api/auth/reset-password', ['email' => $email, 'otp' => $code, 'password' => 'Fresh@Start9', 'password_confirmation' => 'Fresh@Start9'])->assertOk();
    }

    public function test_asking_again_replaces_the_earlier_code(): void
    {
        $this->otpEmployeeUser();
        $email = 'employee@workforcepro.com';

        $first = $this->requestResetCode($email);
        $second = $this->requestResetCode($email);

        $this->assertSame(1, DB::table('password_reset_tokens')->where('email', $email)->count());
        if ($first !== $second) {
            $this->postJson('/api/auth/reset-password', ['email' => $email, 'otp' => $first, 'password' => 'Fresh@Start9', 'password_confirmation' => 'Fresh@Start9'])->assertStatus(422);
        }
        $this->postJson('/api/auth/reset-password', ['email' => $email, 'otp' => $second, 'password' => 'Fresh@Start9', 'password_confirmation' => 'Fresh@Start9'])->assertOk();
    }

    public function test_change_password_round_trip_really_saves_the_new_password(): void
    {
        $user = $this->otpEmployeeUser();
        $user->update(['password' => 'Balderama@123']);
        $email = 'employee@workforcepro.com';
        $token = $this->signIn($email, 'Balderama@123')->assertOk()->json('token');

        $this->withHeader('Authorization', 'Bearer '.$token)->postJson('/api/auth/change-password', [
            'current_password' => 'Balderama@123', 'new_password' => 'Changed@Pass7', 'new_password_confirmation' => 'Changed@Pass7',
        ])->assertOk();

        $this->assertNotSame('Changed@Pass7', $user->fresh()->password);   // stored hashed
        $this->signIn($email, 'Changed@Pass7')->assertOk();
        $this->signIn($email, 'Balderama@123')->assertStatus(422);
    }

    public function test_the_code_is_only_sent_once_per_request(): void
    {
        Mail::fake();
        $this->otpEmployeeUser();

        $this->postJson('/api/auth/forgot-password', ['email' => 'employee@workforcepro.com'])->assertOk();

        // Guards against a second send sneaking in (retry, double dispatch, terminate running
        // twice), which would mean the code in the inbox and the code in the database disagree.
        Mail::assertSentCount(1);
    }

    public function test_the_send_is_deferred_until_after_the_response(): void
    {
        Mail::fake();
        $this->otpEmployeeUser();

        $request = Request::create('/api/auth/forgot-password', 'POST', ['email' => 'employee@workforcepro.com']);

        $callbacks = new \ReflectionProperty($this->app, 'terminatingCallbacks');
        $callbacks->setAccessible(true);
        $before = count($callbacks->getValue($this->app));

        // Called directly rather than through the HTTP kernel, so the test harness does not
        // terminate the app for us and we can see the state the controller leaves behind.
        $controller = $this->app->make(\App\Http\Controllers\Api\AuthController::class);
        $controller->forgotPassword($request);

        // Nothing on the wire yet: this is the whole point. The browser is already looking at the
        // password screen and the countdown opens on a full 5:00 while SMTP is still being dialled.
        Mail::assertNothingSent();
        $this->assertGreaterThan(
            $before,
            count($callbacks->getValue($this->app)),
            'The mail was not deferred to after the response.'
        );

        $this->app->terminate();
        Mail::assertSentCount(1);
    }

    public function test_forgot_password_does_not_crash_when_mail_fails(): void
    {
        Mail::shouldReceive('raw')->andThrow(new \RuntimeException('SMTP unreachable'));
        $this->otpEmployeeUser();

        // Should still return 200 + success (OTP stored) even if the email cannot be sent.
        $this->postJson('/api/auth/forgot-password', ['email' => 'employee@workforcepro.com'])
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertNotNull(
            DB::table('password_reset_tokens')->where('email', 'employee@workforcepro.com')->first()
        );
    }

    public function test_a_mail_failure_after_the_response_is_swallowed_not_fatal(): void
    {
        Mail::shouldReceive('to')->andThrow(new \RuntimeException('SMTP unreachable'));
        $this->otpEmployeeUser();

        $this->postJson('/api/auth/forgot-password', ['email' => 'employee@workforcepro.com'])->assertOk();

        // The send happens after the response, outside anything the person is waiting on. A mail
        // server that is down must not become an unhandled error on a request that already
        // succeeded and told the truth.
        // If the catch in the job were missing, this would blow up here instead of passing.
        $this->assertTrue(true);
    }

    public function test_forgot_password_gives_the_same_response_for_an_unknown_email(): void
    {
        Mail::fake();

        $this->postJson('/api/auth/forgot-password', ['email' => 'nobody@example.com'])
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertSame(
            0,
            DB::table('password_reset_tokens')->where('email', 'nobody@example.com')->count()
        );
    }

    public function test_reset_password_updates_the_password_with_a_valid_otp(): void
    {
        $this->otpEmployeeUser();

        DB::table('password_reset_tokens')->insert([
            'email' => 'employee@workforcepro.com',
            'token' => Hash::make('123456'),
            'created_at' => now(),
        ]);

        $this->postJson('/api/auth/reset-password', [
            'email' => 'employee@workforcepro.com',
            'otp' => '123456',
            'password' => 'BrandNew@123',
            'password_confirmation' => 'BrandNew@123',
        ])->assertOk()->assertJsonPath('success', true);

        $user = User::where('email', 'employee@workforcepro.com')->first();
        $this->assertTrue(password_verify('BrandNew@123', $user->password));
    }

    public function test_a_reset_code_older_than_the_configured_window_is_rejected(): void
    {
        config(['auth.password_reset_code.ttl' => 300]);
        $this->otpEmployeeUser();

        DB::table('password_reset_tokens')->insert([
            'email' => 'employee@workforcepro.com',
            'token' => Hash::make('123456'),
            'created_at' => now()->subSeconds(301),
        ]);

        $this->postJson('/api/auth/reset-password', [
            'email' => 'employee@workforcepro.com',
            'otp' => '123456',
            'password' => 'BrandNew@123',
            'password_confirmation' => 'BrandNew@123',
        ])->assertStatus(422)->assertJsonValidationErrors('otp');

        $user = User::where('email', 'employee@workforcepro.com')->first();
        $this->assertFalse(password_verify('BrandNew@123', $user->password));
    }

    public function test_a_code_is_still_good_while_the_person_is_still_typing_their_new_password(): void
    {
        config(['auth.password_reset_code.ttl' => 300]);
        $this->otpEmployeeUser();

        // The flow puts the password step BEFORE the code step, so a code is routinely a few
        // minutes old by the time it is typed. It was 60 seconds and forced people to start over.
        DB::table('password_reset_tokens')->insert([
            'email' => 'employee@workforcepro.com',
            'token' => Hash::make('123456'),
            'created_at' => now()->subSeconds(240),
        ]);

        $this->postJson('/api/auth/reset-password', [
            'email' => 'employee@workforcepro.com',
            'otp' => '123456',
            'password' => 'BrandNew@123',
            'password_confirmation' => 'BrandNew@123',
        ])->assertOk();
    }

    public function test_forgot_password_returns_a_server_deadline_so_the_countdown_is_honest(): void
    {
        Mail::fake();
        config(['auth.password_reset_code.ttl' => 300]);
        $this->otpEmployeeUser();

        $before = now()->timestamp;
        $response = $this->postJson('/api/auth/forgot-password', ['email' => 'employee@workforcepro.com'])
            ->assertOk()
            ->assertJsonPath('expiresIn', 300);
        $after = now()->timestamp;

        // A range, not an exact value: the deadline is stamped inside the request, so pinning it to
        // the second the test happened to start makes this fail at every second boundary.
        $this->assertGreaterThanOrEqual($before + 300, $response->json('expiresAt'));
        $this->assertLessThanOrEqual($after + 300, $response->json('expiresAt'));
    }

    public function test_the_shipped_window_is_five_minutes(): void
    {
        // Pinned so that shortening (or accidentally lengthening) the window is a deliberate,
        // reviewed change rather than a side effect of editing a default somewhere else.
        $this->assertSame(300, (int) config('auth.password_reset_code.ttl'));
    }

    public function test_the_deadline_does_not_reveal_whether_an_account_exists(): void
    {
        Mail::fake();

        $known = $this->postJson('/api/auth/forgot-password', ['email' => 'employee@workforcepro.com']);
        $unknown = $this->postJson('/api/auth/forgot-password', ['email' => 'nobody@example.com']);

        $known->assertOk();
        $unknown->assertOk();

        // Same message, and a deadline that differs only by the second the request happened to land.
        $this->assertSame($known->json('message'), $unknown->json('message'));
        $this->assertEqualsWithDelta($known->json('expiresAt'), $unknown->json('expiresAt'), 5);
    }

    public function test_reset_password_rejects_an_invalid_otp(): void
    {
        $this->otpEmployeeUser();

        $this->postJson('/api/auth/reset-password', [
            'email' => 'employee@workforcepro.com',
            'otp' => '000000',
            'password' => 'BrandNew@123',
            'password_confirmation' => 'BrandNew@123',
        ])->assertStatus(422)->assertJsonValidationErrors('otp');
    }

    public function test_change_password_enforces_the_password_policy(): void
    {
        $user = $this->adminUser();

        foreach (['password', 'Password', 'password1', 'PASSWORD1'] as $weak) {
            $this->actingAs($user)
                ->postJson('/api/auth/change-password', [
                    'current_password' => 'password',
                    'new_password' => $weak,
                    'new_password_confirmation' => $weak,
                ])->assertStatus(422)->assertJsonValidationErrors('new_password');
        }
    }

    public function test_change_password_accepts_a_policy_compliant_password(): void
    {
        $user = $this->adminUser();

        $this->actingAs($user)
            ->postJson('/api/auth/change-password', [
                'current_password' => 'password',
                'new_password' => 'PolicyPass1',
                'new_password_confirmation' => 'PolicyPass1',
            ])->assertOk()->assertJsonPath('success', true);
    }

    public function test_reset_password_enforces_the_password_policy(): void
    {
        $this->otpEmployeeUser();

        DB::table('password_reset_tokens')->insert([
            'email' => 'employee@workforcepro.com',
            'token' => Hash::make('123456'),
            'created_at' => now(),
        ]);

        $this->postJson('/api/auth/reset-password', [
            'email' => 'employee@workforcepro.com',
            'otp' => '123456',
            'password' => 'password',
            'password_confirmation' => 'password',
        ])->assertStatus(422)->assertJsonValidationErrors('password');
    }

    public function test_login_lockout_after_five_failed_attempts(): void
    {
        $this->adminUser();
        RateLimiter::clear('login:admin@workforcepro.com');

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/auth/login', [
                'email' => 'admin@workforcepro.com',
                'password' => 'wrong-password',
            ])->assertStatus(422);
        }

        $this->postJson('/api/auth/login', [
            'email' => 'admin@workforcepro.com',
            'password' => 'password',
        ])->assertStatus(429)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['message', 'retry_after']);
    }

    public function test_successful_login_resets_the_attempt_counter(): void
    {
        $this->adminUser();
        RateLimiter::clear('login:admin@workforcepro.com');

        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/auth/login', [
                'email' => 'admin@workforcepro.com',
                'password' => 'wrong-password',
            ])->assertStatus(422);
        }

        // A correct password now succeeds and clears the counter.
        $this->postJson('/api/auth/login', [
            'email' => 'admin@workforcepro.com',
            'password' => 'password',
        ])->assertOk()->assertJsonPath('success', true);

        // Another correct login still works (counter was cleared).
        $this->postJson('/api/auth/login', [
            'email' => 'admin@workforcepro.com',
            'password' => 'password',
        ])->assertOk()->assertJsonPath('success', true);
    }
}
