<?php

namespace App\Services;

/**
 * How many WORKING days a range contains for an employee (their work pattern,
 * minus company holidays) -- delegates to the Scheduling domain's own WorkingDays.
 */
class SchedulingClient
{
    /**
     * @return array{days: int, calendarDays: int, holidays: array<string, string>, offDays: int}
     */
    public static function workingDays(string $employeeId, string $startDate, string $endDate): array
    {
        return (new WorkingDays())->count($employeeId, $startDate, $endDate);
    }
}
