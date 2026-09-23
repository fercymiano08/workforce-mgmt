<?php

/*
|--------------------------------------------------------------------------
| IDENTITY SERVICE
|--------------------------------------------------------------------------
| Domain  : people & organization
| Owns    : employees, departments, roles
| Exposes : company directory, registration, profiles, face enrollment
|----------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\DepartmentController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\RoleController;
use Illuminate\Support\Facades\Route;

Route::middleware('auth:sanctum')->group(function () {
    Route::get('/departments', [DepartmentController::class, 'index']);
    Route::get('/roles', [RoleController::class, 'index']);

    // Self-service employee profile - the logged-in user's own record.
    // Administrators have no Employee record in this data model, so these
    // 404 for them; that's expected, not a bug.
    Route::get('/profile', [EmployeeController::class, 'myProfile']);
    Route::put('/profile', [EmployeeController::class, 'updateMyProfile']);

    // Employees - Administrator only (full company directory, salaries, etc.)
    Route::middleware('admin')->prefix('employees')->group(function () {
        Route::get('/', [EmployeeController::class, 'index']);
        Route::post('/', [EmployeeController::class, 'store']);
        Route::get('/{id}', [EmployeeController::class, 'show']);
        Route::put('/{id}', [EmployeeController::class, 'update']);
        Route::delete('/{id}', [EmployeeController::class, 'destroy']);
        Route::post('/{id}/face', [EmployeeController::class, 'registerFace']);
    });
});