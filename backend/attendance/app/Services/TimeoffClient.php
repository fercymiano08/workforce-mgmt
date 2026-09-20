<?php

namespace App\Services;

use App\Models\Leave;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Leave-draft creation over HTTP to the Time Off service.
 *
 * 'remote' (production): POSTs to the Time Off service, which owns the leaves
 * table and creates the approved-by-pending draft. 'local' (tests): writes to
 * this service's local leaves replica so unit tests stay standalone.
 */
class TimeoffClient
{
    public static function autoDraftSickLeave(
        string $employeeId,
        string $employeeName,
        string $date,
        ?int $minutesEarly = null,
        ?string $earlyOutId = null,
    ): ?array {
        $payload = [
            'employeeId' => $employeeId,
            'employeeName' => $employeeName,
            'date' => $date,
            'minutesEarly' => $minutesEarly,
            'earlyOutId' => $earlyOutId,
        ];

        if (config('svc.timeoff_mode', 'remote') === 'local') {
            return self::createLocal($payload);
        }

        try {
            $response = Http::timeout(5)
                ->withHeader('X-Service-Token', (string) config('svc.token'))
                ->post(rtrim(config('svc.timeoff.url'), '/').'/api/internal/leaves/auto-draft', $payload);

            if ($response->successful()) {
                return $response->json('data');
            }

            if ($response->status() < 500 && $response->json('data')) {
                return $response->json('data');
            }
        } catch (\Throwable $e) {
            Log::warning('Sick leave auto-draft failed', ['error' => $e->getMessage()]);
        }

        return null;
    }

    /** @param  array<string, mixed>  $payload */
    private static function createLocal(array $payload): ?array
    {
        if (! class_exists(\App\Models\Leave::class)) {
            return null;
        }

        $existing = Leave::where('employee_id', $payload['employeeId'])
            ->where('leave_type', 'Sick')
            ->where('start_date', $payload['date'])
            ->where('status', 'Pending')
            ->where('reason', 'like', '[Auto-generated from early clock-out]%')
            ->first();

        if ($existing) {
            return $existing->toApiArray();
        }

        $max = Leave::where('id', 'like', 'LVE%')->max('id');
        $num = $max ? ((int) substr($max, 3)) + 1 : 1;

        $minutes = (int) ($payload['minutesEarly'] ?? 0);
        $note = (string) ($payload['earlyOutId'] ?? '');

        $leave = Leave::create([
            'id' => 'LVE'.str_pad((string) $num, 3, '0', STR_PAD_LEFT),
            'employee_id' => $payload['employeeId'],
            'employee_name' => $payload['employeeName'],
            'leave_type' => 'Sick',
            'start_date' => $payload['date'],
            'end_date' => $payload['date'],
            'status' => 'Pending',
            'applied_date' => now()->toDateString(),
            'approved_by' => null,
            'comments' => null,
            'documents' => [],
            'reason' => '[Auto-generated from early clock-out] '.($minutes > 0 ? "Clock-out {$minutes} min early on {$payload['date']}." : "Early clock-out on {$payload['date']}.")
                .($note !== '' ? " Early clock-out record: {$note}." : ''),
        ]);

        return $leave->toApiArray();
    }
}