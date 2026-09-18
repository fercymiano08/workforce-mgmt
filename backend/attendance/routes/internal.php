<?php

use App\Http\Controllers\Api\InternalApiController;
use Illuminate\Support\Facades\Route;

Route::prefix('internal')->group(function () {
    Route::get('/snapshot', [InternalApiController::class, 'snapshot']);
    Route::post('/security-events/resolve-all', [InternalApiController::class, 'resolveAllSecurityEvents']);
    Route::post('/security-events/{id}/resolve', [InternalApiController::class, 'resolveSecurityEvent']);
    Route::post('/security-events/{id}/flag', [InternalApiController::class, 'flagSecurityEvent']);
    Route::post('/employees/sync', [InternalApiController::class, 'syncEmployee']);
    Route::post('/shift-schedules/sync', [InternalApiController::class, 'syncShiftSchedules']);
});