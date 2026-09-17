<?php

/*
|--------------------------------------------------------------------------
| CONFIGURATION SERVICE (settings)
|--------------------------------------------------------------------------
| Domain  : app-wide configuration
| Owns    : settings (company, kiosk, system, ai_resolved_insights)
| Exposes : read (any authenticated user) + update (admin only)
|----------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\SettingsController;
use Illuminate\Support\Facades\Route;

Route::middleware('svc.auth')->group(function () {
    Route::prefix('settings')->group(function () {
        // Read stays open to any authenticated user - Employees need the
        // "system" section too, so date/time formatting applies app-wide.
        Route::get('/', [SettingsController::class, 'get']);
        Route::middleware('admin')->put('/', [SettingsController::class, 'update']);
    });
});