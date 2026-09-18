<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Timesheet generation over HTTP to the Payroll service.
 *
 * 'remote' (production): POSTs to the Payroll service, which rebuilds the
 * employee's timesheets from ITS OWN attendance + overtime replicas. Attendance
 * changes therefore never write the payroll database directly.
 *
 * 'local' (tests): recomputes using this service's local replicas via the
 * embedded TimesheetGenerationService so unit tests stay deterministic.
 */
class PayrollClient
{
    public static function syncForEmployee(string $employeeId): void
    {
        self::call('/api/internal/timesheets/sync', ['employeeId' => $employeeId], $employeeId);
    }

    public static function regenerateAll(): void
    {
        self::call('/api/internal/timesheets/rebuild', [], null);
    }

    private static function call(string $path, array $payload, ?string $employeeId): void
    {
        if (config('svc.payroll_mode', 'remote') === 'local') {
            try {
                if ($employeeId !== null) {
                    (new TimesheetGenerationService())->syncForEmployee($employeeId, date('Y-m-d'));
                } else {
                    (new TimesheetGenerationService())->regenerateAll();
                }
            } catch (\Throwable $e) {
                Log::warning('Local timesheet generation failed', ['error' => $e->getMessage()]);
            }

            return;
        }

        try {
            Http::timeout(5)
                ->withHeader('X-Service-Token', (string) config('svc.token'))
                ->post(rtrim(config('svc.payroll.url'), '/').$path, $payload);
        } catch (\Throwable $e) {
            Log::warning('Payroll sync failed', ['error' => $e->getMessage()]);
        }
    }
}