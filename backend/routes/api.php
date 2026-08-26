<?php

use App\Http\Controllers\Api\AnalyticsController;
use App\Http\Controllers\Api\AttendanceController;
use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\AIDecisionSupportController;
use App\Http\Controllers\Api\DepartmentController;
use App\Http\Controllers\Api\EmployeeController;
use App\Http\Controllers\Api\KioskController;
use App\Http\Controllers\Api\LeaveController;
use App\Http\Controllers\Api\NotificationController;
use App\Http\Controllers\Api\OvertimeRequestController;
use App\Http\Controllers\Api\RoleController;
use App\Http\Controllers\Api\SettingsController;
use App\Http\Controllers\Api\ShiftController;
use App\Http\Controllers\Api\TimesheetController;
use Illuminate\Support\Facades\Route;

Route::prefix('auth')->group(function () {
    Route::post('/login', [AuthController::class, 'login']);
    Route::post('/forgot-password', [AuthController::class, 'forgotPassword'])->middleware('throttle:3,1');
    Route::post('/reset-password', [AuthController::class, 'resetPassword'])->middleware('throttle:6,1');
    Route::post('/logout', [AuthController::class, 'logout'])->middleware('auth:sanctum');
    Route::get('/me', [AuthController::class, 'me'])->middleware('auth:sanctum');
    Route::post('/change-password', [AuthController::class, 'changePassword'])->middleware('auth:sanctum');
});

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

    Route::prefix('attendance')->group(function () {
        Route::middleware('admin')->group(function () {
            Route::get('/', [AttendanceController::class, 'index']);
            Route::post('/', [AttendanceController::class, 'store']);
            Route::get('/alerts/check', [AttendanceController::class, 'checkAlerts']);
            Route::get('/date/{date}', [AttendanceController::class, 'byDate']);
            Route::get('/{id}', [AttendanceController::class, 'show']);
            Route::put('/{id}', [AttendanceController::class, 'update']);
            Route::delete('/{id}', [AttendanceController::class, 'destroy']);
        });
        // Self-or-admin: an employee may always read their own attendance history.
        Route::get('/employee/{employeeId}', [AttendanceController::class, 'byEmployee']);
        // Any authenticated employee can nudge themselves to clock out once a day.
        Route::post('/remind-clock-out', [AttendanceController::class, 'remindClockOut']);
    });

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

    Route::prefix('shifts')->group(function () {
        // Shift definitions are read-only reference data, safe for any authenticated user.
        Route::get('/', [ShiftController::class, 'definitions']);
        Route::middleware('admin')->group(function () {
            Route::get('/schedules', [ShiftController::class, 'schedules']);
            Route::post('/schedules', [ShiftController::class, 'createSchedule']);
            Route::post('/schedules/generate', [ShiftController::class, 'generateSchedule']);
            Route::put('/schedules/{id}', [ShiftController::class, 'updateSchedule']);
            Route::delete('/schedules/{id}', [ShiftController::class, 'destroySchedule']);
        });
        Route::get('/schedules/employee/{employeeId}', [ShiftController::class, 'schedulesByEmployee']);
    });

    Route::prefix('timesheets')->group(function () {
        Route::middleware('admin')->group(function () {
            Route::get('/', [TimesheetController::class, 'index']);
            Route::post('/', [TimesheetController::class, 'store']);
            Route::put('/{id}', [TimesheetController::class, 'update']);
            Route::delete('/{id}', [TimesheetController::class, 'destroy']);
        });
        Route::get('/employee/{employeeId}', [TimesheetController::class, 'byEmployee']);
        Route::get('/{id}', [TimesheetController::class, 'show']);
        // Dual rule enforced inline: admin can set any status, employee can only submit their own draft.
        Route::patch('/{id}/status', [TimesheetController::class, 'updateStatus']);
    });

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

    Route::middleware('admin')->prefix('analytics')->group(function () {
        Route::get('/', [AnalyticsController::class, 'getAll']);
        Route::get('/{section}', [AnalyticsController::class, 'section']);
    });

    Route::middleware('admin')->prefix('analytics/ai')->group(function () {
        Route::get('/insights', [AIDecisionSupportController::class, 'insights']);
        Route::post('/actions', [AIDecisionSupportController::class, 'action']);
    });

    Route::prefix('settings')->group(function () {
        // Read stays open to any authenticated user - Employees need the
        // "system" section too, so date/time formatting applies app-wide.
        Route::get('/', [SettingsController::class, 'get']);
        Route::middleware('admin')->put('/', [SettingsController::class, 'update']);
    });

    Route::middleware('admin')->prefix('kiosk')->group(function () {
        Route::post('/config', [KioskController::class, 'updateConfig']);
        Route::post('/pin', [KioskController::class, 'setPin']);
        Route::post('/reset', [KioskController::class, 'reset']);
    });
});

// Kiosk device endpoints - the entrance clock-in device is not an
// authenticated user, so these are intentionally public. Each endpoint here
// returns only the minimal fields a public, unauthenticated terminal needs -
// never full employee records (salary, email, phone, address, etc.).
Route::prefix('kiosk')->group(function () {
    Route::get('/config', [KioskController::class, 'config']);
    Route::post('/verify-pin', [KioskController::class, 'verifyPin']);
    Route::post('/verify-face', [KioskController::class, 'verifyFace']);
    Route::post('/log', [KioskController::class, 'log']);

    Route::get('/employees', [KioskController::class, 'employeeDirectory']);
    Route::get('/schedule/{employeeId}', [KioskController::class, 'todaySchedule']);
    Route::get('/attendance/{employeeId}', [KioskController::class, 'attendanceByEmployee']);
    Route::post('/attendance', [KioskController::class, 'clockIn']);
    Route::put('/attendance/{id}', [KioskController::class, 'clockOut']);
});
