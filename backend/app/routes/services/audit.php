<?php

/*
|--------------------------------------------------------------------------
| AUDIT TRAIL
|--------------------------------------------------------------------------
| Domain  : append-only security & HR action log
| Owns    : audit_events
| Exposes : read-only admin view (filters + pagination). Nothing here can
|           write, change, or erase a row - writes happen exclusively through
|           the guarded machine-to-machine endpoint in routes/internal.php.
|---------------------------------------------------------------------------
*/

use App\Http\Controllers\Api\AuditEventController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth:sanctum', 'admin'])->prefix('audit')->group(function () {
    Route::get('/', [AuditEventController::class, 'index']);
});