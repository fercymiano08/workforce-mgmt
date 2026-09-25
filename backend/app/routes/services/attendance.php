<?php

/*
|--------------------------------------------------------------------------
| ATTENDANCE SERVICE (includes the KIOSK TERMINAL)
|--------------------------------------------------------------------------
| Domain  : time & attendance capture
| Owns    : attendance, security_events (writes)
| Exposes : HR attendance administration + employee self-history +
|           the public kiosk terminal endpoints used by the door device
|----------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\AttendanceAdjustmentController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\EarlyClockOutController;
use App\Http\Controllers\Api\KioskController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    // Corrections, inside Time & Attendance ("the kiosk failed", "I worked past my shift"). An employee files one for
    // themselves with photo proof; only the Workforce Admin decides and makes the manual entry.
    Route::prefix('attendance/adjustments')->group(function () {
        Route::get('/mine', [AttendanceAdjustmentController::class, 'mine']);
        Route::post('/', [AttendanceAdjustmentController::class, 'store']);
        Route::post('/{id}/cancel', [AttendanceAdjustmentController::class, 'cancel']);

        Route::middleware('admin')->group(function () {
            Route::get('/', [AttendanceAdjustmentController::class, 'index']);
            Route::get('/{id}', [AttendanceAdjustmentController::class, 'show']);
            Route::post('/{id}/preview', [AttendanceAdjustmentController::class, 'preview']);
            Route::post('/{id}/decide', [AttendanceAdjustmentController::class, 'decide']);
        });
    });

    // Kiosk device configuration - Administrator only.
    Route::middleware('admin')->prefix('kiosk')->group(function () {
        Route::get('/logs', [KioskController::class, 'logs']);
        Route::get('/overview', [KioskController::class, 'overview']);
        Route::post('/config', [KioskController::class, 'updateConfig']);
        Route::post('/pin', [KioskController::class, 'setPin']);
        Route::post('/reset', [KioskController::class, 'reset']);
    });

    Route::prefix('attendance')->group(function () {
        Route::middleware('admin')->group(function () {
            Route::get('/', [AttendanceController::class, 'index']);
            Route::post('/', [AttendanceController::class, 'store']);
            Route::get('/alerts/check', [AttendanceController::class, 'checkAlerts']);
            Route::get('/date/{date}', [AttendanceController::class, 'byDate']);
            // Early clock-out review (admin): declared before /{id} so the
            // literal segments never collide with an attendance id lookup.
            Route::get('/early-outs', [EarlyClockOutController::class, 'index']);
            Route::get('/early-outs/pending', [EarlyClockOutController::class, 'pending']);
            Route::get('/early-outs/{id}', [EarlyClockOutController::class, 'show']);
            Route::post('/early-outs/{id}/classify', [EarlyClockOutController::class, 'classify']);
            Route::get('/{id}', [AttendanceController::class, 'show']);
            Route::put('/{id}', [AttendanceController::class, 'update']);
            Route::delete('/{id}', [AttendanceController::class, 'destroy']);
        });
        // Self-or-admin: an employee may always read their own attendance history.
        Route::get('/employee/{employeeId}', [AttendanceController::class, 'byEmployee']);
        // An employee may read their own early clock-outs and set/update the
        // reason + proof later (the punch never waits on a reason).
        Route::get('/early-outs/employee/{employeeId}', [EarlyClockOutController::class, 'byEmployee']);
        Route::put('/early-outs/{id}/reason', [EarlyClockOutController::class, 'updateReason']);
        // Any authenticated employee can nudge themselves to clock out once a day.
        Route::post('/remind-clock-out', [AttendanceController::class, 'remindClockOut']);
    });
});

// Kiosk device endpoints - the entrance clock-in device is not an
// authenticated user, so these are intentionally public. Each endpoint here
// returns only the minimal fields a public, unauthenticated terminal needs -
// never full employee records (salary, email, phone, address, etc.).
//
// Only config (is the kiosk on? is a PIN set?) and verify-pin are open. verify-pin
// is rate-limited and returns a signed device token; everything else - the
// employee directory, face check, logging, clock-in/out - needs that token
// (X-Kiosk-Token), so the endpoints cannot be driven by a bare HTTP client.
Route::prefix('kiosk')->group(function () {
    Route::get('/config', [KioskController::class, 'config']);
    Route::post('/verify-pin', [KioskController::class, 'verifyPin'])->middleware('throttle:10,1');
});

Route::prefix('kiosk')->middleware('kiosk.device')->group(function () {
    Route::post('/verify-face', [KioskController::class, 'verifyFace']);
    Route::post('/log', [KioskController::class, 'log']);

    Route::get('/employees', [KioskController::class, 'employeeDirectory']);
    Route::get('/employees/{employeeId}', [KioskController::class, 'employeeShow']);
    Route::get('/schedule/{employeeId}', [KioskController::class, 'todaySchedule']);
    Route::get('/attendance/{employeeId}', [KioskController::class, 'attendanceByEmployee']);
    Route::post('/attendance', [KioskController::class, 'clockIn']);
    Route::put('/attendance/{id}', [KioskController::class, 'clockOut']);
});