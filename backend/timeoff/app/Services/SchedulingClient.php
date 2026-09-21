<?php

namespace App\Services;

use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Asks the Scheduling service how many WORKING days a range contains for an employee (their work pattern,
 * minus company holidays). Scheduling owns that data, so the answer always follows the current rules.
 *
 * If Scheduling cannot be reached the request still goes through, counting Monday-Friday only (and the
 * answer says so), so an outage never blocks someone from asking for leave.
 */
class SchedulingClient
{
    /**
     * @return array{days: int, calendarDays: int, holidays: array<string, string>, offDays: int, fallback?: bool}
     */
    public static function workingDays(string $employeeId, string $startDate, string $endDate): array
    {
        if (config('svc.scheduling_mode', 'remote') !== 'local') {
            try {
                $response = Http::connectTimeout(1)->timeout(4)
                    ->withHeader('X-Service-Token', (string) config('svc.token'))
                    ->post(rtrim((string) config('svc.scheduling.url'), '/').'/api/internal/working-days', [
                        'employeeId' => $employeeId, 'startDate' => $startDate, 'endDate' => $endDate,
                    ]);

                if ($response->successful() && is_array($response->json('data'))) {
                    return $response->json('data');
                }
            } catch (\Throwable $e) {
                Log::warning('Working-days lookup failed, counting weekdays only', ['error' => $e->getMessage()]);
            }
        }

        return self::weekdaysOnly($startDate, $endDate);
    }

    /** @return array{days: int, calendarDays: int, holidays: array<string, string>, offDays: int, fallback: bool} */
    public static function weekdaysOnly(string $startDate, string $endDate): array
    {
        $days = 0;
        $calendar = 0;
        for ($d = Carbon::parse($startDate)->startOfDay(); $d->lte(Carbon::parse($endDate)); $d->addDay()) {
            $calendar++;
            if ($d->isWeekday()) {
                $days++;
            }
        }

        return ['days' => $days, 'calendarDays' => $calendar, 'holidays' => [], 'offDays' => $calendar - $days, 'fallback' => true];
    }
}
