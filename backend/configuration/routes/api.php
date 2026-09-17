<?php

/*
|--------------------------------------------------------------------------
| CONFIGURATION SERVICE — API gateway
|--------------------------------------------------------------------------
| Host : services/configuration   Port: 8008   DB: workforce_configuration
| Owns : settings (company, kiosk, system, ai_resolved_insights)
|----------------------------------------------------------------------------
*/

use Illuminate\Support\Facades\Route;

Route::prefix('configuration')->group(function () {
    Route::get('/health', function () {
        return response()->json([
            'service' => 'configuration',
            'status' => 'ok',
            'database' => config('database.connections.pgsql.database'),
            'time' => now()->toISOString(),
        ]);
    });
});

// Public module routes (settings read/update).
require __DIR__.'/services/configuration.php';

// Machine-to-machine endpoints for peer services (SERVICE_TOKEN guarded).
require __DIR__.'/internal.php';