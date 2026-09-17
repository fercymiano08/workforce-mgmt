<?php

/*
|--------------------------------------------------------------------------
| COMMUNICATIONS SERVICE — API gateway
|--------------------------------------------------------------------------
| Host : services/communications   Port: 8007   DB: workforce_communications
| Owns : notifications (the bell inbox)
|----------------------------------------------------------------------------
*/

use Illuminate\Support\Facades\Route;

Route::prefix('communications')->group(function () {
    Route::get('/health', function () {
        return response()->json([
            'service' => 'communications',
            'status' => 'ok',
            'database' => config('database.connections.pgsql.database'),
            'time' => now()->toISOString(),
        ]);
    });
});

// Public module routes (notification inbox read/read-state/admin create).
require __DIR__.'/services/communications.php';

// Machine-to-machine endpoints for peer services (SERVICE_TOKEN guarded).
require __DIR__.'/internal.php';