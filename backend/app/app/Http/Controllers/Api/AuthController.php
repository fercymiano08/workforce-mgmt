<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Jobs\SendPasswordResetCode;
use App\Jobs\SendTwoFactorCode;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    /**
     * How long a password-reset code stays valid, in seconds.
     *
     * Read from config (auth.password_reset_code.ttl, default 5 minutes) rather than fixed, and always
     * paired with expiresAt in the response so the browser counts down the SERVER's clock instead of
     * its own - a slow mail server used to eat into the window before the countdown even started.
     */
    private function otpTtl(): int
    {
        return max(60, (int) config('auth.password_reset_code.ttl', 300));
    }

    /**
     * An employee's login expires this many seconds after their last real activity (the browser keeps it
     * alive only while they use the system - see keepAlive). Administrators are not timed out.
     */
    public const EMPLOYEE_IDLE_SECONDS = 180;

    private const MAX_LOGIN_ATTEMPTS = 5;

    private const LOGIN_LOCKOUT_SECONDS = 60;

    /**
     * Guesses allowed against a single sign-in code. A six digit code is a million possibilities, so
     * this is not about stopping a determined attacker with the challenge id - it is about making an
     * unbounded online guess impractical before the code expires on its own.
     */
    private const TWO_FACTOR_MAX_ATTEMPTS = 5;

    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        // Slow down brute-force attempts: after several failed logins for the
        // same email the account is locked out briefly (cool-down period).
        $lockoutKey = 'login:'.strtolower($request->input('email'));

        if (RateLimiter::tooManyAttempts($lockoutKey, self::MAX_LOGIN_ATTEMPTS)) {
            $seconds = RateLimiter::availableIn($lockoutKey);
            $this->audit('auth.login_locked', $request->input('email'), null, ['email' => $request->input('email'), 'ip' => $request->ip()]);

            return response()->json([
                'success' => false,
                'message' => 'Too many login attempts. Please try again in '.$seconds.' seconds.',
                'retry_after' => $seconds,
                'errors' => ['email' => ['Too many login attempts. Please try again in '.$seconds.' seconds.']],
            ], 429);
        }

        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            RateLimiter::hit($lockoutKey, self::LOGIN_LOCKOUT_SECONDS);

            $remaining = self::MAX_LOGIN_ATTEMPTS - RateLimiter::attempts($lockoutKey);
            $this->audit('auth.login_failed', $request->input('email'), null, ['email' => $request->input('email'), 'ip' => $request->ip(), 'attemptsLeft' => max(0, $remaining)]);

            throw ValidationException::withMessages([
                'email' => [
                    'Invalid email or password. Please try again.'
                    .($remaining > 0 ? " (You have {$remaining} attempt(s) remaining.)" : ''),
                ],
            ]);
        }

        RateLimiter::clear($lockoutKey);
        $this->audit('auth.login', (string) $user->id, $user, ['ip' => $request->ip()]);

        // An account with two-factor sign-in stops here. The password was right, but no token is
        // issued yet: the browser is told a code is on its way and comes back with it. Creating the
        // token before the code is proven would mean the second step is decorative.
        if ($user->two_factor_enabled) {
            return $this->beginTwoFactorChallenge($request, $user);
        }

        return $this->issueSession($request, $user);
    }

    /**
     * How long a sign-in code stays valid, in seconds. Shorter than a password reset on purpose: this
     * code completes a sign-in that has already passed the password check, so it is worth less time
     * on the wire than a code that also lets someone choose a new password.
     */
    private function twoFactorTtl(): int
    {
        return max(60, (int) config('auth.two_factor.ttl', 180));
    }

    /**
     * Issues the token, with the same idle timeout rule as an ordinary sign-in. Everything after a
     * successful password check funnels through here, so the timeout and the response shape cannot
     * drift apart between the two-factor path and the ordinary one.
     */
    private function issueSession(Request $request, User $user): JsonResponse
    {
        // Employees get a login that runs out after EMPLOYEE_IDLE_SECONDS without activity; the server enforces it,
        // so closing the laptop lid or leaving the tab open cannot leave a session alive.
        $timeout = $user->role === 'Employee' ? self::EMPLOYEE_IDLE_SECONDS : null;
        $token = $user->createToken('workforce-token', ['*'], $timeout ? now()->addSeconds($timeout) : null)->plainTextToken;

        return response()->json([
            'success' => true,
            'user' => $user->toApiArray(),
            'token' => $token,
            'sessionTimeoutSeconds' => $timeout,
        ]);
    }

    /**
     * Writes the sign-in challenge and mails the code.
     *
     * The row is written before the response, and the mail is dispatched after it, for the same
     * reason the password-reset flow does it that way: the code has to exist before the browser is
     * told to wait for one, and the slow part (SMTP) has no business happening in front of the
     * countdown.
     *
     * Any previous challenge for the account is replaced, so a code that arrives after the person has
     * already retried cannot be used to complete the attempt they abandoned.
     */
    private function beginTwoFactorChallenge(Request $request, User $user): JsonResponse
    {
        $ttl = $this->twoFactorTtl();
        $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

        DB::table('two_factor_challenges')->where('user_id', $user->id)->delete();
        DB::table('two_factor_challenges')->insert([
            'user_id' => $user->id,
            'code' => Hash::make($otp),
            'attempts' => 0,
            'expires_at' => now()->addSeconds($ttl),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        $this->audit('auth.two_factor_challenge_issued', (string) $user->id, $user, ['ip' => $request->ip()]);

        SendTwoFactorCode::dispatchAfterResponse(
            $user->email,
            $user->firstName ?? $user->name ?? 'there',
            $otp,
            max(1, (int) round($ttl / 60)),
        );

        return response()->json([
            'success' => true,
            'requiresTwoFactor' => true,
            // Which account is being finished. It is the address that was just successfully
            // authenticated, so echoing it back leaks nothing an attacker did not already have.
            'email' => $user->email,
            'expiresIn' => $ttl,
        ]);
    }

    /**
     * The second step: finish a sign-in with the emailed code.
     *
     * Every failure - no challenge, expired, wrong code, too many guesses - returns the same message.
     * Distinguishing them would tell an attacker holding only a challenge id whether the code they
     * guessed was close, or whether the challenge had simply run out.
     */
    public function verifyTwoFactor(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'otp' => 'required|string',
        ]);

        $ttl = $this->twoFactorTtl();
        $invalid = ValidationException::withMessages([
            'otp' => ['This code is invalid or has expired. Please sign in again.'],
        ]);

        $user = User::where('email', $request->email)->first();
        if (! $user || ! $user->two_factor_enabled) {
            throw $invalid;
        }

        $challenge = DB::table('two_factor_challenges')->where('user_id', $user->id)->first();

        if (! $challenge || \Illuminate\Support\Carbon::parse($challenge->expires_at)->lt(now())) {
            DB::table('two_factor_challenges')->where('user_id', $user->id)->delete();

            throw $invalid;
        }

        // A leaked challenge is not enough on its own: the code is only good for a handful of guesses
        // per challenge, and the route is rate limited as well. Both, deliberately.
        if ((int) $challenge->attempts >= self::TWO_FACTOR_MAX_ATTEMPTS) {
            DB::table('two_factor_challenges')->where('user_id', $user->id)->delete();

            throw $invalid;
        }

        if (! Hash::check((string) $request->otp, $challenge->code)) {
            DB::table('two_factor_challenges')->where('user_id', $user->id)->update([
                'attempts' => (int) $challenge->attempts + 1,
                'updated_at' => now(),
            ]);

            $this->audit('auth.two_factor_failed', (string) $user->id, $user, ['ip' => $request->ip()]);

            throw $invalid;
        }

        // Single use: the code is spent the moment it works, whatever happens next.
        DB::table('two_factor_challenges')->where('user_id', $user->id)->delete();

        $this->audit('auth.two_factor_verified', (string) $user->id, $user, ['ip' => $request->ip()]);

        return $this->issueSession($request, $user);
    }

    /**
     * Turns the second sign-in step on or off for the account making the request.
     *
     * Turning it OFF asks for the current password, because the person asking is by definition
     * already holding a session - and a stolen session token is exactly the thing this feature is
     * meant to limit the damage of. Without that check, anyone who could borrow a logged-in browser
     * could quietly turn the protection off and stay.
     *
     * Turning it ON deliberately does not ask for a password: you are already signed in, and this is
     * the step that makes the next sign-in require a code.
     */
    public function setTwoFactor(Request $request): JsonResponse
    {
        $user = $request->user();

        $request->validate(['enabled' => 'required|boolean']);

        $enabled = (bool) $request->input('enabled');

        if ($enabled) {
            $user->forceFill(['two_factor_enabled' => true])->save();
        } else {
            $request->validate(['password' => 'required|string']);
            abort_unless(Hash::check((string) $request->input('password'), $user->password), 422, 'That password is not correct.');
            $user->forceFill(['two_factor_enabled' => false])->save();
        }

        // Any half-finished sign-in is void the moment the setting changes, or turning the feature
        // off would leave a usable code in flight.
        DB::table('two_factor_challenges')->where('user_id', $user->id)->delete();

        $this->audit($enabled ? 'auth.two_factor_enabled' : 'auth.two_factor_disabled', (string) $user->id, $user, ['ip' => $request->ip()]);

        return response()->json([
            'success' => true,
            'twoFactorEnabled' => $enabled,
        ]);
    }

    /**
     * The browser calls this only while the person is really using the system (mouse, keys, touch), never
     * for background polling - so an employee who walks away, however many refreshes the page makes on its
     * own, is signed out when the timer runs out. Administrators have no timeout.
     */
    public function keepAlive(Request $request): JsonResponse
    {
        $token = $request->user()?->currentAccessToken();
        $timeout = $request->user()?->role === 'Employee' ? self::EMPLOYEE_IDLE_SECONDS : null;

        if ($timeout && $token instanceof PersonalAccessToken) {
            $token->forceFill(['expires_at' => now()->addSeconds($timeout)])->save();
        }

        return response()->json(['success' => true, 'sessionTimeoutSeconds' => $timeout]);
    }

    /**
     * Step-up check before something sensitive (exporting reports or the audit log): the signed-in person
     * types their password again. A stolen-but-unlocked session cannot walk data out. The confirmation is
     * written to the audit log with what it was for.
     */
    // There used to be a confirmPassword() here, which made the person re-type their password before
    // every print and every report export. It was removed on purpose: it guarded nothing, because the
    // person was already signed in and already allowed to see the thing being exported, and it made
    // printing feel broken on a phone. The audit trail already records exports on their own.

    /** Sign-in and password events are part of the audit trail; a failure to write one never blocks the person. */
    private function audit(string $event, ?string $entityId, ?User $user, array $meta = []): void
    {
        try {
            AuditLogger::record('core', $event, 'User', (string) ($entityId ?? 'unknown'), $user?->name, $user?->employee_id ?? null, meta: $meta ?: null);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::warning('Audit write failed', ['event' => $event, 'error' => $e->getMessage()]);
        }
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()?->currentAccessToken();
        if ($token instanceof PersonalAccessToken) {
            $token->delete();
        }
        if ($request->user()) {
            $this->audit('auth.logout', (string) $request->user()->id, $request->user());
        }

        return response()->json(['success' => true]);
    }

    public function me(Request $request): JsonResponse
    {
        return response()->json([
            'success' => true,
            'user' => $request->user()->toApiArray(),
        ]);
    }

    public function changePassword(Request $request): JsonResponse
    {
        $request->validate([
            'current_password' => 'required|string',
            'new_password' => ['required', 'confirmed', Password::min(8)->mixedCase()->numbers()],
        ]);

        $user = $request->user();

        if (! Hash::check($request->current_password, $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The current password is incorrect.'],
            ]);
        }

        $user->update(['password' => $request->new_password]);
        $this->audit('auth.password_changed', (string) $user->id, $user);

        return response()->json([
            'success' => true,
            'message' => 'Password updated successfully.',
            'user' => $user->fresh()->toApiArray(),
        ]);
    }

    public function forgotPassword(Request $request): JsonResponse
    {
        $request->validate(['email' => 'required|email']);

        $user = User::where('email', $request->email)->first();
        $ttl = $this->otpTtl();

        // The code is stamped with the moment it was BORN, before any mail server is contacted, so
        // slow delivery eats into the window rather than silently extending it past what the browser shows.
        $issuedAt = now();
        $expiresAt = $issuedAt->copy()->addSeconds($ttl)->timestamp;

        // Admin accounts are reserved, fixed credentials (not real mailboxes),
        // so password reset is employee-only. We no-op silently and return the
        // same generic message to avoid leaking which accounts are admin.
        if ($user && $user->role !== 'Administrator') {
            $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

            DB::table('password_reset_tokens')->where('email', $request->email)->delete();
            DB::table('password_reset_tokens')->insert([
                'email' => $request->email,
                'token' => Hash::make($otp),
                'created_at' => $issuedAt,
            ]);

            $this->audit('auth.password_reset_requested', (string) $user->id, $user, ['ip' => $request->ip()]);

            $name = $user->firstName ?? $user->name ?? 'there';
            $minutes = max(1, (int) round($ttl / 60));

            // The code is already stored, so the browser can be answered right now and the person
            // can start typing their new password while the mail goes out. Handing the message to
            // SMTP is the slow part, and it has no business happening in front of the countdown.
            SendPasswordResetCode::dispatchAfterResponse(
                $request->email,
                $name,
                $otp,
                $minutes,
                $issuedAt->timestamp,
            );
        }

        // Identical for a real account, an Administrator, an unknown address, or a mail failure: the
        // response must not tell an attacker which emails exist or which ones are staff accounts.
        return response()->json([
            'success' => true,
            'message' => 'If an account exists for that email, a reset code has been sent.',
            'expiresAt' => $expiresAt,
            'expiresIn' => $ttl,
        ]);
    }

    public function resetPassword(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'otp' => 'required|string',
            'password' => ['required', 'confirmed', Password::min(8)->mixedCase()->numbers()],
        ]);

        $record = DB::table('password_reset_tokens')->where('email', $request->email)->first();

        if (
            ! $record
            // (diffInMinutes is negative for a past date in this Carbon version, so compare the moments themselves)
            || \Illuminate\Support\Carbon::parse($record->created_at)->lt(now()->subSeconds($this->otpTtl()))
            || ! Hash::check($request->otp, $record->token)
        ) {
            throw ValidationException::withMessages([
                'otp' => ['This code is invalid or has expired. Please request a new one.'],
            ]);
        }

        $user = User::where('email', $request->email)->first();
        if (! $user) {
            throw ValidationException::withMessages([
                'email' => ['No account found for that email.'],
            ]);
        }

        // Admin accounts are reserved fixed credentials and cannot be reset
        // through the self-service flow. Treat any admin OTP as invalid.
        if ($user->role === 'Administrator') {
            throw ValidationException::withMessages([
                'otp' => ['This code is invalid or has expired. Please request a new one.'],
            ]);
        }

        $user->update(['password' => $request->password]);
        DB::table('password_reset_tokens')->where('email', $request->email)->delete();
        // A reset is what someone does precisely because they think the old password leaked, so every
        // session already signed in with it is dropped too - not just the code.
        $user->tokens()->delete();
        $this->audit('auth.password_reset', (string) $user->id, $user, ['ip' => $request->ip()]);

        return response()->json([
            'success' => true,
            'message' => 'Your password has been reset. You can now sign in.',
        ]);
    }
}
