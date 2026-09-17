<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Read/write access to the Time-off service (leaves + overtime requests) over
 * HTTP.
 *
 * 'remote' (production): resolution is POSTed to the Time-off service, which
 * owns the rows (it validates status transitions and clears/records approval
 * fields). 'local' (tests): the write goes to this service's local replica so
 * tests stay standalone and deterministic.
 */
class TimeoffClient
{
    public static function resolveLeave(string $id, string $status, ?string $approvedBy): void
    {
        self::postOrLocal('leaves/'.$id.'/status', ['status' => $status, 'approvedBy' => $approvedBy], function () use ($id, $status, $approvedBy): void {
            $record = \App\Models\Leave::find($id);
            if ($record) {
                $record->update(['status' => $status, 'approved_by' => $approvedBy]);
            }
        });
    }

    public static function resolveOvertime(string $id, string $status, ?string $approvedBy): void
    {
        self::postOrLocal('overtime/'.$id.'/status', ['status' => $status, 'approvedBy' => $approvedBy], function () use ($id, $status, $approvedBy): void {
            $record = \App\Models\OvertimeRequest::find($id);
            if ($record) {
                $record->update([
                    'status' => $status,
                    'approved_by' => $approvedBy,
                    'approved_hours' => $status === 'Approved' ? $record->expected_hours : null,
                    'approved_at' => $status === 'Approved' ? now() : null,
                ]);
            }
        });
    }

    private static function postOrLocal(string $path, array $payload, callable $localWrite): void
    {
        if (config('svc.timeoff_mode', 'remote') === 'local') {
            $localWrite();

            return;
        }

        try {
            Http::timeout(5)
                ->withHeader('X-Service-Token', (string) config('svc.token'))
                ->post(rtrim(config('svc.timeoff.url'), '/').'/api/internal/'.$path, $payload);
        } catch (\Throwable $e) {
            Log::warning('Timeoff resolution failed', ['error' => $e->getMessage()]);
        }
    }
}