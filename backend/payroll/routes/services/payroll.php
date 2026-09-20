<?php

/*
|--------------------------------------------------------------------------
| PAYROLL SERVICE (timesheets)
|--------------------------------------------------------------------------
| Domain  : weekly hour reconciliation for payroll
| Owns    : timesheets (reads attendance + overtime for generation)
| Exposes : timesheet generation, employee review, HR approval
|----------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\PayRecordController;
use App\Http\Controllers\Api\TimesheetController;
use Illuminate\Support\Facades\Route;

Route::middleware('svc.auth')->group(function () {
    Route::prefix('timesheets')->group(function () {
        Route::middleware('admin')->group(function () {
            Route::get('/', [TimesheetController::class, 'index']);
            Route::post('/', [TimesheetController::class, 'store']);
            Route::put('/{id}', [TimesheetController::class, 'update']);
            Route::delete('/{id}', [TimesheetController::class, 'destroy']);
        });
        Route::get('/employee/{employeeId}', [TimesheetController::class, 'byEmployee']);
        Route::get('/pay/employee/{employeeId}', [PayRecordController::class, 'byEmployee']);
        Route::get('/{id}', [TimesheetController::class, 'show']);
        // Dual rule enforced inline: admin can set any status, employee can only submit their own draft.
        Route::patch('/{id}/status', [TimesheetController::class, 'updateStatus']);
    });
});