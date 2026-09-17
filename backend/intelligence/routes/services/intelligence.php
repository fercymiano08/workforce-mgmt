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
use App\Http\Controllers\Api\AIDecisionSupportController;
use Illuminate\Support\Facades\Route;

Route::middleware('svc.auth')->prefix('analytics')->group(function () {
    Route::middleware('admin')->group(function () {
        Route::get('/', [AnalyticsController::class, 'getAll']);
        Route::get('/{section}', [AnalyticsController::class, 'section']);

        Route::get('/ai/insights', [AIDecisionSupportController::class, 'insights']);
        Route::post('/ai/actions', [AIDecisionSupportController::class, 'action']);
    });
});