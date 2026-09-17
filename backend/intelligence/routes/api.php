<?php

/*
|--------------------------------------------------------------------------
| INTELLIGENCE SERVICE - API gateway
|--------------------------------------------------------------------------
| Host : services/intelligence   Port: 8001   DB: workforce_intel
| Owns : analytics (cached JSON), settings.ai_resolved_insights projection
| Reads: workforce snapshot replicas (employees, attendance, security_events,
|        leaves, overtime_requests, shift_definitions, shift_schedules,
|        timesheets, settings) refreshed over HTTP via `php artisan snapshot:sync`
|        or the SyncSnapshot middleware.
|
| AI ACTIONS (approve/reject leave & overtime, resolve/flag security events,
| insight resolution) write back to the OWNER services over their
| /api/internal/* endpoints - nothing here writes to foreign tables.
|---------------------------------------------------------------------------
*/

use Illuminate\Support\Facades\Route;

Route::get('/intelligence/health', function () {
    return response()->json([
        'service' => 'intelligence',
        'status' => 'ok',
        'database' => config('database.connections.pgsql.database'),
        'time' => now()->toISOString(),
    ]);
});

// Analytics + AI (Administrator only, authenticated via the Auth service).
require __DIR__.'/services/intelligence.php';