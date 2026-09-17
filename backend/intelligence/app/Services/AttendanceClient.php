<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Read/write access to the Attendance service (security events) over HTTP.
 *
 * 'remote' (production): security events are resolved via the Attendance
 * service, which owns the rows. 'local' (tests): writes hit the local replica.
 */
class AttendanceClient
{
    public static function resolveSecurityEvent(string $id, ?string $resolvedBy): void
    {
        self::postOrLocal('security-events/'.$id.'/resolve', ['resolvedBy' => $resolvedBy], function () use ($id, $resolvedBy): void {
            $event = \App\Models\SecurityEvent::find($id);
            if ($event) {
                $event->update([
                    'status' => 'Resolved',
                    'resolved_at' => now(),
                    'resolved_by' => $resolvedBy,
                ]);
            }
        });
    }

    public static function flagSecurityEvent(string $id, ?string $resolvedBy): void
    {
        self::postOrLocal('security-events/'.$id.'/resolve', ['resolvedBy' => $resolvedBy], function () use ($id, $resolvedBy): void {
            $event = \App\Models\SecurityEvent::find($id);
            if ($event) {
                $event->update([
                    'status' => 'Flagged',
                    'resolved_at' => now(),
                    'resolved_by' => $resolvedBy,
                ]);
            }
        });
    }

    public static function resolveAllSecurityEvents(?string $resolvedBy): void
    {
        self::postOrLocal('security-events/resolve-all', ['resolvedBy' => $resolvedBy], function () use ($resolvedBy): void {
            \App\Models\SecurityEvent::where('status', 'Open')
                ->orWhere('status', 'Flagged')
                ->get()
                ->each(function (\App\Models\SecurityEvent $event) use ($resolvedBy): void {
                    $event->update([
                        'status' => 'Resolved',
                        'resolved_at' => now(),
                        'resolved_by' => $resolvedBy,
                    ]);
                });
        });
    }

    private static function postOrLocal(string $path, array $payload, callable $localWrite): void
    {
        if (config('svc.attendance_mode', 'remote') === 'local') {
            $localWrite();

            return;
        }

        try {
            Http::timeout(5)
                ->withHeader('X-Service-Token', (string) config('svc.token'))
                ->post(rtrim(config('svc.attendance.url'), '/').'/api/internal/'.$path, $payload);
        } catch (\Throwable $e) {
            Log::warning('Attendance resolution failed', ['error' => $e->getMessage()]);
        }
    }
}