<?php

/*
|--------------------------------------------------------------------------
| TIME OFF SERVICE — API gateway
|--------------------------------------------------------------------------
| Host : services/timeoff    Port: 8005   DB: workforce_timeoff
| Owns : leaves + overtime_requests
|----------------------------------------------------------------------------
*/

use Illuminate\Support\Facades\Route;

Route::prefix('timeoff')->group(function () {
    Route::get('/health', function () {
        return response()->json([
            'service' => 'timeoff',
            'status' => 'ok',
            'database' => config('database.connections.pgsql.database'),
            'time' => now()->toISOString(),
        ]);
    });
});

// Public module routes (leave requests + overtime requests).
require __DIR__.'/services/timeoff.php';

// Machine-to-machine endpoints for peer services (SERVICE_TOKEN guarded).
require __DIR__.'/internal.php';