<?php

/*
|--------------------------------------------------------------------------
| SCHEDULING SERVICE
|--------------------------------------------------------------------------
| Domain  : shifts & schedules
| Owns    : shift_definitions, shift_schedules, schedule_settings, holidays
| Exposes : shift templates (read) and schedule management (single or bulk
|           assign - see ShiftController::createScheduleBulk)
|----------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\ShiftController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::prefix('shifts')->group(function () {
        // Shift definitions are read-only reference data, safe for any authenticated user.
        Route::get('/', [ShiftController::class, 'definitions']);
        Route::get('/holidays', [ShiftController::class, 'holidays']);
        Route::middleware('admin')->group(function () {
            Route::get('/schedules', [ShiftController::class, 'schedules']);
            Route::post('/schedules', [ShiftController::class, 'createSchedule']);
            Route::post('/schedules/bulk', [ShiftController::class, 'createScheduleBulk']);
            Route::put('/schedules/{id}', [ShiftController::class, 'updateSchedule']);
            Route::delete('/schedules/{id}', [ShiftController::class, 'destroySchedule']);
        });
        Route::get('/schedules/employee/{employeeId}', [ShiftController::class, 'schedulesByEmployee']);
    });
});
