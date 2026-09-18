<?php

use App\Http\Controllers\Api\InternalApiController;
use Illuminate\Support\Facades\Route;

Route::prefix('internal')->group(function () {
    Route::get('/snapshot', [InternalApiController::class, 'snapshot']);
    Route::post('/timesheets/sync', [InternalApiController::class, 'syncForEmployee']);
    Route::post('/timesheets/rebuild', [InternalApiController::class, 'rebuildTimesheets']);
    Route::post('/employees/sync', [InternalApiController::class, 'syncEmployee']);
});