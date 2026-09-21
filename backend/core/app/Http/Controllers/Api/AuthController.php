<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Validation\Rules\Password;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    /** How long a password-reset code stays valid: one minute, then a new one has to be requested. */
    private const OTP_SECONDS = 60;

    /**
     * An employee's login expires this many seconds after their last real activity (the browser keeps it
     * alive only while they use the system - see keepAlive). Administrators are not timed out.
     */
    public const EMPLOYEE_IDLE_SECONDS = 180;

    private const MAX_LOGIN_ATTEMPTS = 5;

    private const LOGIN_LOCKOUT_SECONDS = 60;

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
    public function confirmPassword(Request $request): JsonResponse
    {
        $data = $request->validate([
            'password' => 'required|string',
            'purpose' => 'nullable|string|max:120',
        ]);

        $user = $request->user();
        $key = 'confirm:'.$user->id;
        if (RateLimiter::tooManyAttempts($key, 5)) {
            throw ValidationException::withMessages(['password' => ['Too many attempts. Please wait a minute and try again.']]);
        }

        if (! Hash::check($data['password'], $user->password)) {
            RateLimiter::hit($key, 60);
            $this->audit('auth.confirm_failed', (string) $user->id, $user, ['purpose' => $data['purpose'] ?? null]);
            throw ValidationException::withMessages(['password' => ['That password is not correct.']]);
        }

        RateLimiter::clear($key);
        $this->audit('auth.export_confirmed', (string) $user->id, $user, ['purpose' => $data['purpose'] ?? null]);

        return response()->json(['success' => true]);
    }

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

        // Admin accounts are reserved, fixed credentials (not real mailboxes),
        // so password reset is employee-only. We no-op silently and return the
        // same generic message to avoid leaking which accounts are admin.
        if ($user && $user->role !== 'Administrator') {
            $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

            DB::table('password_reset_tokens')->where('email', $request->email)->delete();
            DB::table('password_reset_tokens')->insert([
                'email' => $request->email,
                'token' => Hash::make($otp),
                'created_at' => now(),
            ]);

            $this->audit('auth.password_reset_requested', (string) $user->id, $user, ['ip' => $request->ip()]);

            $name = $user->firstName ?? $user->name ?? 'there';
            try {
                Mail::raw(
                    "Hi {$name},\n\n"
                    . "Your WorkForce Pro password reset code is:\n\n"
                    . "   {$otp}\n\n"
                    . "This code expires in ".self::OTP_SECONDS." seconds (1 minute). If it runs out, request a new one. If you did not request a reset, ignore this email.",
                    fn ($m) => $m->to($request->email)->subject('WorkForce Pro — Password Reset Code')
                );
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('Password reset email could not be sent.', [
                    'email' => $request->email,
                    'reason' => $e->getMessage(),
                ]);
            }
        }

        return response()->json([
            'success' => true,
            'message' => 'If an account exists for that email, a reset code has been sent.',
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
            || \Illuminate\Support\Carbon::parse($record->created_at)->lt(now()->subSeconds(self::OTP_SECONDS))
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
        $this->audit('auth.password_reset', (string) $user->id, $user, ['ip' => $request->ip()]);

        return response()->json([
            'success' => true,
            'message' => 'Your password has been reset. You can now sign in.',
        ]);
    }
}
