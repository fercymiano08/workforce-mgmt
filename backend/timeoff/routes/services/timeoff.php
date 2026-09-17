<?php

/*
|--------------------------------------------------------------------------
| TIME-OFF SERVICE
|--------------------------------------------------------------------------
| Domain  : leaves & overtime
| Owns    : leaves, overtime_requests
| Exposes : apply, approve/reject, balances, reconciliation hooks
|----------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\LeaveController;
use App\Http\Controllers\Api\OvertimeRequestController;
use Illuminate\Support\Facades\Route;

Route::middleware('svc.auth')->group(function () {
    Route::prefix('leaves')->group(function () {
        Route::middleware('admin')->group(function () {
            Route::get('/', [LeaveController::class, 'index']);
            Route::put('/{id}', [LeaveController::class, 'update']);
            Route::delete('/{id}', [LeaveController::class, 'destroy']);
        });
        // Dual rule enforced inline: admin can set any status, employee can
        // only cancel their own still-pending request.
        Route::patch('/{id}/status', [LeaveController::class, 'updateStatus']);
        // Self-or-admin, enforced inline (store checks the payload's employeeId).
        Route::post('/', [LeaveController::class, 'store']);
        Route::get('/employee/{employeeId}', [LeaveController::class, 'byEmployee']);
        Route::get('/balances/{employeeId}', [LeaveController::class, 'balances']);
        Route::get('/{id}', [LeaveController::class, 'show']);
    });

    Route::prefix('overtime')->group(function () {
        Route::middleware('admin')->group(function () {
            Route::get('/', [OvertimeRequestController::class, 'index']);
            Route::patch('/bulk-status', [OvertimeRequestController::class, 'bulkUpdateStatus']);
            Route::delete('/{id}', [OvertimeRequestController::class, 'destroy']);
        });
        // Dual rule enforced inline: admin can set any status, employee can
        // only cancel their own still-pending request.
        Route::patch('/{id}/status', [OvertimeRequestController::class, 'updateStatus']);
        // Self-or-admin, enforced inline (store checks the payload's employeeId).
        Route::post('/', [OvertimeRequestController::class, 'store']);
        Route::get('/employee/{employeeId}', [OvertimeRequestController::class, 'byEmployee']);
        Route::get('/{id}', [OvertimeRequestController::class, 'show']);
    });
});