<?php

/*
|--------------------------------------------------------------------------
| INTERNAL SERVICE-TO-SERVICE ENDPOINTS
|--------------------------------------------------------------------------
| Consumed only by peer services (machine-to-machine); the frontend never
| calls these. Every route validates the shared SERVICE_TOKEN header.
|---------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\InternalApiController;
use Illuminate\Support\Facades\Route;

Route::prefix('internal')->group(function () {
    Route::get('/snapshot', [InternalApiController::class, 'snapshot']);
    Route::post('/notifications', [InternalApiController::class, 'storeNotification']);
});