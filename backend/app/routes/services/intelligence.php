<?php

/*
|--------------------------------------------------------------------------
| INTELLIGENCE SERVICE (analytics & AI decision support)
|--------------------------------------------------------------------------
| Domain  : workforce analytics + AI-assisted management decisions
| Owns    : analytics (cached JSON), settings.ai_resolved_insights projection
| Reads   : attendance, leaves, overtime, shift coverage, security_events
|----------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\AnalyticsController;
use App\Http\Controllers\Api\SearchController;
use App\Http\Controllers\Api\AIDecisionSupportController;
use App\Http\Controllers\Api\SystemHealthController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->prefix('analytics')->group(function () {
    // Self-or-admin: an employee may read their own "By Employee" card the same way an admin reads
    // anyone's (AnalyticsController::employee() guards this itself via assertSelfOrAdmin()).
    // Declared before the admin group below so it still resolves ahead of the {section} wildcard.
    Route::get('/employee/{employeeId}', [AnalyticsController::class, 'employee']);

    Route::middleware('admin')->group(function () {
        Route::get('/', [AnalyticsController::class, 'getAll']);
        Route::get('/workforce', [AnalyticsController::class, 'workforce']);
        Route::get('/top-performers', [AnalyticsController::class, 'topPerformers']);
        Route::get('/{section}', [AnalyticsController::class, 'section']);

        Route::get('/ai/insights', [AIDecisionSupportController::class, 'insights']);
        Route::get('/ai/health-score', [AIDecisionSupportController::class, 'healthScore']);
        Route::post('/ai/actions', [AIDecisionSupportController::class, 'action']);
    });
});

// Liveness / readiness probes for partners and load balancers (no auth).
Route::get('/health', [SystemHealthController::class, 'health']);
Route::get('/ready', [SystemHealthController::class, 'ready']);

// Not analytics data - a raw Postgres round-trip time, for the dashboard's live DB-health graph.
Route::middleware(['auth:sanctum', 'admin'])->get('/system/db-health', [SystemHealthController::class, 'db']);

// Universal search for the topbar: any signed-in user, results scoped to their role on the server.
Route::middleware(['auth:sanctum', 'throttle:120,1'])->get('/search', [SearchController::class, 'index']);
