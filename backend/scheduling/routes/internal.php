<?php

use App\Http\Controllers\Api\InternalApiController;
use Illuminate\Support\Facades\Route;

Route::prefix('internal')->group(function () {
    Route::get('/snapshot', [InternalApiController::class, 'snapshot']);
    Route::post('/employees/sync', [InternalApiController::class, 'syncEmployee']);
    Route::post('/working-days', [InternalApiController::class, 'workingDays']);
});