<?php

use App\Http\Controllers\Api\InternalApiController;
use Illuminate\Support\Facades\Route;

Route::prefix('internal')->group(function () {
    Route::get('/snapshot', [InternalApiController::class, 'snapshot']);
    Route::post('/leaves/{id}/status', [InternalApiController::class, 'updateLeaveStatus']);
    Route::post('/overtime/{id}/status', [InternalApiController::class, 'updateOvertimeStatus']);
    Route::post('/employees/sync', [InternalApiController::class, 'syncEmployee']);
});