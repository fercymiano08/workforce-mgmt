<?php

/*
|--------------------------------------------------------------------------
| SCHEDULING SERVICE
|--------------------------------------------------------------------------
| Domain  : shifts & schedules
| Owns    : shift_definitions, shift_schedules, schedule_settings, work_patterns, holidays,
|           coverage_rules, schedule_batches
| Exposes : shift templates (read) + schedule generation (preview / publish / undo) & management
|           + the rules automatic scheduling follows
|----------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\ScheduleRulesController;
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

            // The rules automatic scheduling follows, and the history of generation runs.
            Route::get('/rules', [ScheduleRulesController::class, 'rules']);
            Route::put('/rules/automation', [ScheduleRulesController::class, 'saveAutomation']);
            Route::post('/automation/run', [ScheduleRulesController::class, 'runNow']);
            Route::put('/rules/patterns', [ScheduleRulesController::class, 'savePattern']);
            Route::delete('/rules/patterns/{id}', [ScheduleRulesController::class, 'deletePattern']);
            Route::post('/rules/holidays', [ScheduleRulesController::class, 'addHoliday']);
            Route::delete('/rules/holidays/{id}', [ScheduleRulesController::class, 'deleteHoliday']);
            Route::put('/rules/coverage', [ScheduleRulesController::class, 'saveCoverage']);
            Route::get('/batches', [ScheduleRulesController::class, 'batches']);
            Route::delete('/batches/{id}', [ScheduleRulesController::class, 'undoBatch']);
        });
        Route::get('/schedules/employee/{employeeId}', [ShiftController::class, 'schedulesByEmployee']);
    });
});