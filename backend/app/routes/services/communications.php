<?php

/*
|--------------------------------------------------------------------------
| COMMUNICATIONS SERVICE (notifications)
|--------------------------------------------------------------------------
| Domain  : internal messaging / the bell inbox
| Owns    : notifications
| Exposes : create (admin), employee inbox, unread badge, read state
|----------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\NotificationController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::prefix('notifications')->group(function () {
        Route::middleware('admin')->group(function () {
            Route::get('/', [NotificationController::class, 'index']);
            Route::post('/', [NotificationController::class, 'store']);
        });
        Route::get('/employee/{employeeId}', [NotificationController::class, 'byEmployee']);
        Route::get('/unread-count', [NotificationController::class, 'unreadCount']);
        Route::post('/read-all', [NotificationController::class, 'markAllAsRead']);
        Route::get('/{id}', [NotificationController::class, 'show']);
        Route::post('/{id}/read', [NotificationController::class, 'markAsRead']);
        Route::delete('/{id}', [NotificationController::class, 'destroy']);
    });
});