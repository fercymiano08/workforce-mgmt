<?php

/*
|--------------------------------------------------------------------------
| PAYROLL SERVICE (timesheets)
|--------------------------------------------------------------------------
| Domain  : weekly hour reconciliation for payroll
| Owns    : timesheets (reads attendance + overtime for generation)
| Exposes : timesheet generation, employee submit, admin approve / reject / reopen, payroll export
|----------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\TimesheetController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::prefix('timesheets')->group(function () {
        Route::middleware('admin')->group(function () {
            Route::get('/', [TimesheetController::class, 'index']);
            Route::post('/payroll-export', [TimesheetController::class, 'payrollExport']);
            Route::put('/{id}', [TimesheetController::class, 'update']);
            Route::delete('/{id}', [TimesheetController::class, 'destroy']);
        });
        Route::get('/employee/{employeeId}', [TimesheetController::class, 'byEmployee']);
        Route::get('/{id}', [TimesheetController::class, 'show']);
        // Workflow rules are enforced inline: the employee submits their own, the admin approves / rejects / reopens.
        Route::patch('/{id}/status', [TimesheetController::class, 'updateStatus']);
    });
});