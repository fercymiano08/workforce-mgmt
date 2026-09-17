<?php

/*
|--------------------------------------------------------------------------
| SCHEDULING SERVICE — API gateway
|--------------------------------------------------------------------------
| Host : services/scheduling    Port: 8004   DB: workforce_scheduling
| Owns : shift_definitions + shift_schedules
|----------------------------------------------------------------------------
*/

use Illuminate\Support\Facades\Route;

Route::prefix('scheduling')->group(function () {
    Route::get('/health', function () {
        return response()->json([
            'service' => 'scheduling',
            'status' => 'ok',
            'database' => config('database.connections.pgsql.database'),
            'time' => now()->toISOString(),
        ]);
    });
});

// Public module routes (shift definitions + schedules).
require __DIR__.'/services/scheduling.php';

// Machine-to-machine endpoints for peer services (SERVICE_TOKEN guarded).
require __DIR__.'/internal.php';