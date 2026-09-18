<?php

use App\Http\Controllers\Api\InternalApiController;
use Illuminate\Support\Facades\Route;

Route::prefix('internal')->group(function () {
    Route::post('/employees/sync', [InternalApiController::class, 'syncEmployee']);
    Route::post('/shift-schedules/sync', [InternalApiController::class, 'syncShiftSchedules']);
});
