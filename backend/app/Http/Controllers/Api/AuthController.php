<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Validation\ValidationException;
use Laravel\Sanctum\PersonalAccessToken;

class AuthController extends Controller
{
    public function login(Request $request): JsonResponse
    {
        $request->validate([
            'email' => 'required|email',
            'password' => 'required',
        ]);

        $user = User::where('email', $request->email)->first();

        if (! $user || ! Hash::check($request->password, $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['Invalid email or password. Please try again.'],
            ]);
        }

        $token = $user->createToken('workforce-token')->plainTextToken;

        return response()->json([
            'success' => true,
            'user' => $user->toApiArray(),
            'token' => $token,
        ]);
    }

    public function logout(Request $request): JsonResponse
    {
        $token = $request->user()?->currentAccessToken();
        if ($token instanceof PersonalAccessToken) {
            $token->delete();
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
            'new_password' => 'required|string|min:8|confirmed',
        ]);

        $user = $request->user();

        if (! Hash::check($request->current_password, $user->password)) {
            throw ValidationException::withMessages([
                'current_password' => ['The current password is incorrect.'],
            ]);
        }

        $user->update(['password' => $request->new_password]);

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

        if ($user) {
            $otp = str_pad((string) random_int(0, 999999), 6, '0', STR_PAD_LEFT);

            DB::table('password_reset_tokens')->where('email', $request->email)->delete();
            DB::table('password_reset_tokens')->insert([
                'email' => $request->email,
                'token' => Hash::make($otp),
                'created_at' => now(),
            ]);

            $name = $user->firstName ?? $user->name ?? 'there';
            try {
                Mail::raw(
                    "Hi {$name},\n\n"
                    . "Your WorkForce Pro password reset code is:\n\n"
                    . "   {$otp}\n\n"
                    . "This code expires in 10 minutes. If you did not request a reset, ignore this email.",
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
            'password' => 'required|string|min:8|confirmed',
        ]);

        $record = DB::table('password_reset_tokens')->where('email', $request->email)->first();

        if (
            ! $record
            || now()->diffInMinutes($record->created_at) > 10
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

        $user->update(['password' => $request->password]);
        DB::table('password_reset_tokens')->where('email', $request->email)->delete();

        return response()->json([
            'success' => true,
            'message' => 'Your password has been reset. You can now sign in.',
        ]);
    }
}
