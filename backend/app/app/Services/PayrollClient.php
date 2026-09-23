<?php

namespace App\Services;

/**
 * Triggers a timesheet recompute after attendance/overtime changes.
 */
class PayrollClient
{
    public static function syncForEmployee(string $employeeId): void
    {
        (new TimesheetGenerationService())->syncForEmployee($employeeId, now()->toDateString());
    }

    public static function regenerateAll(): void
    {
        (new TimesheetGenerationService())->regenerateAll();
    }
}
