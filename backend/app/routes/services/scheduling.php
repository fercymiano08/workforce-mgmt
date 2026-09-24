<?php

/*
|--------------------------------------------------------------------------
| SCHEDULING SERVICE
|--------------------------------------------------------------------------
| Domain  : shifts & schedules
| Owns    : shift_definitions, shift_schedules, schedule_settings, holidays
| Exposes : shift templates (read), schedule management, and automated shift scheduling
|           (build a draft by the rules, then approve it)
|----------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\AutomatedShiftController;
use App\Http\Controllers\Api\ShiftController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::prefix('shifts')->group(function () {
        // Shift definitions are read-only reference data, safe for any authenticated user.
        Route::get('/', [ShiftController::class, 'definitions']);
        Route::middleware('admin')->group(function () {
            Route::get('/schedules', [ShiftController::class, 'schedules']);
            Route::post('/schedules', [ShiftController::class, 'createSchedule']);
            Route::put('/schedules/{id}', [ShiftController::class, 'updateSchedule']);
            Route::delete('/schedules/{id}', [ShiftController::class, 'destroySchedule']);

            // Automated shift scheduling: the rules build a draft (preview), HR approves it (approve).
            Route::post('/automated/preview', [AutomatedShiftController::class, 'preview']);
            Route::post('/automated/approve', [AutomatedShiftController::class, 'approve']);
        });
        Route::get('/schedules/employee/{employeeId}', [ShiftController::class, 'schedulesByEmployee']);
    });
});