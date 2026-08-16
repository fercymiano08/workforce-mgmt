<?php

namespace App\Http\Controllers\Api\Concerns;

use Illuminate\Http\Request;

trait AuthorizesEmployeeScope
{
    /**
     * Abort unless the caller is an Administrator.
     */
    protected function assertAdmin(Request $request): void
    {
        if ($request->user()?->role !== 'Administrator') {
            abort(403, 'Administrator access required.');
        }
    }

    /**
     * Abort unless the caller is an Administrator or the employee themselves.
     */
    protected function assertSelfOrAdmin(Request $request, string $employeeId): void
    {
        $user = $request->user();
        if ($user?->role === 'Administrator') {
            return;
        }

        if ($user?->employee_id !== $employeeId) {
            abort(403, 'You are not authorized to access this resource.');
        }
    }
}
