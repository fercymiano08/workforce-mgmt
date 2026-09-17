<?php

/*
|--------------------------------------------------------------------------
| SCHEDULING SERVICE
|--------------------------------------------------------------------------
| Domain  : shifts & schedules
| Owns    : shift_definitions, shift_schedules
| Exposes : shift templates (read) + schedule generation & management
|----------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\ShiftController;
use Illuminate\Support\Facades\Route;

Route::middleware('svc.auth')->group(function () {
    Route::prefix('shifts')->group(function () {
        // Shift definitions are read-only reference data, safe for any authenticated user.
        Route::get('/', [ShiftController::class, 'definitions']);
        Route::middleware('admin')->group(function () {
            Route::get('/schedules', [ShiftController::class, 'schedules']);
            Route::post('/schedules', [ShiftController::class, 'createSchedule']);
            Route::post('/schedules/generate', [ShiftController::class, 'generateSchedule']);
            Route::put('/schedules/{id}', [ShiftController::class, 'updateSchedule']);
            Route::delete('/schedules/{id}', [ShiftController::class, 'destroySchedule']);
        });
        Route::get('/schedules/employee/{employeeId}', [ShiftController::class, 'schedulesByEmployee']);
    });
});