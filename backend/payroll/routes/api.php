<?php

/*
|--------------------------------------------------------------------------
| PAYROLL SERVICE — API gateway
|--------------------------------------------------------------------------
| Host : services/payroll    Port: 8006   DB: workforce_payroll
| Owns : timesheets (generated from its attendance + overtime replicas)
|----------------------------------------------------------------------------
*/

use Illuminate\Support\Facades\Route;

Route::prefix('payroll')->group(function () {
    Route::get('/health', function () {
        return response()->json([
            'service' => 'payroll',
            'status' => 'ok',
            'database' => config('database.connections.pgsql.database'),
            'time' => now()->toISOString(),
        ]);
    });
});

// Public module routes (timesheets).
require __DIR__.'/services/payroll.php';

// Machine-to-machine endpoints for peer services (SERVICE_TOKEN guarded).
require __DIR__.'/internal.php';