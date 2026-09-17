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

use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\KioskController;
use Illuminate\Support\Facades\Route;

Route::middleware('svc.auth')->group(function () {
    Route::prefix('attendance')->group(function () {
        Route::middleware('admin')->group(function () {
            Route::get('/', [AttendanceController::class, 'index']);
            Route::post('/', [AttendanceController::class, 'store']);
            Route::get('/alerts/check', [AttendanceController::class, 'checkAlerts']);
            Route::get('/date/{date}', [AttendanceController::class, 'byDate']);
            Route::get('/{id}', [AttendanceController::class, 'show']);
            Route::put('/{id}', [AttendanceController::class, 'update']);
            Route::delete('/{id}', [AttendanceController::class, 'destroy']);
        });
        // Self-or-admin: an employee may always read their own attendance history.
        Route::get('/employee/{employeeId}', [AttendanceController::class, 'byEmployee']);
        // Any authenticated employee can nudge themselves to clock out once a day.
        Route::post('/remind-clock-out', [AttendanceController::class, 'remindClockOut']);
    });

    // Kiosk device configuration - Administrator only.
    Route::middleware('admin')->prefix('kiosk')->group(function () {
        Route::post('/config', [KioskController::class, 'updateConfig']);
        Route::post('/pin', [KioskController::class, 'setPin']);
        Route::post('/reset', [KioskController::class, 'reset']);
    });
});

// Kiosk device endpoints - the entrance clock-in device is not an
// authenticated user, so these are intentionally public. Each endpoint here
// returns only the minimal fields a public, unauthenticated terminal needs -
// never full employee records (salary, email, phone, address, etc.).
Route::prefix('kiosk')->group(function () {
    Route::get('/config', [KioskController::class, 'config']);
    Route::post('/verify-pin', [KioskController::class, 'verifyPin']);
    Route::post('/verify-face', [KioskController::class, 'verifyFace']);
    Route::post('/log', [KioskController::class, 'log']);

    Route::get('/employees', [KioskController::class, 'employeeDirectory']);
    Route::get('/schedule/{employeeId}', [KioskController::class, 'todaySchedule']);
    Route::get('/attendance/{employeeId}', [KioskController::class, 'attendanceByEmployee']);
    Route::post('/attendance', [KioskController::class, 'clockIn']);
    Route::put('/attendance/{id}', [KioskController::class, 'clockOut']);
});