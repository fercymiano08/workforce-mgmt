<?php

/*
|--------------------------------------------------------------------------
| ATTENDANCE SERVICE — API gateway
|--------------------------------------------------------------------------
| Host : services/attendance    Port: 8003   DB: workforce_attendance
| Owns : attendance + security_events (incl. the kiosk endpoints)
|----------------------------------------------------------------------------
*/

use Illuminate\Support\Facades\Route;

Route::prefix('attendance')->group(function () {
    Route::get('/health', function () {
        return response()->json([
            'service' => 'attendance',
            'status' => 'ok',
            'database' => config('database.connections.pgsql.database'),
            'time' => now()->toISOString(),
        ]);
    });
});

// Public module routes (attendance records + kiosk).
require __DIR__.'/services/attendance.php';

// Machine-to-machine endpoints for peer services (SERVICE_TOKEN guarded).
require __DIR__.'/internal.php';