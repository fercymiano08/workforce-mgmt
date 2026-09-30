<?php

/*
|--------------------------------------------------------------------------
| AUTH SERVICE
|--------------------------------------------------------------------------
| Domain  : identity & access control
| Owns    : users, personal_access_tokens, password_reset_tokens, sessions
| Exposes : login, logout, session ("/me"), password reset & change
|----------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\AuthController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    // The second sign-in step. Rate limited on its own, and separately from /login, so a run of code
    // guesses cannot be used to wear down the password lockout or the other way round.
    Route::post('/two-factor/verify', [AuthController::class, 'verifyTwoFactor'])->middleware('throttle:6,1');
    Route::post('/two-factor', [AuthController::class, 'setTwoFactor'])->middleware('auth:sanctum');
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:3,1');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:6,1');
    Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
    Route::get('/me', [AuthController::class, 'me'])->middleware('auth:sanctum');
    Route::post('/keep-alive', [AuthController::class, 'keepAlive'])->middleware('auth:sanctum');
    Route::post('/change-password', [AuthController::class, 'changePassword'])->middleware('auth:sanctum');
});