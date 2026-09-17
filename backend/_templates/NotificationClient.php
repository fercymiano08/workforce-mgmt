<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Push notifications over HTTP to the Communications service.
 *
 * 'remote' (production) POSTs to the Communications service with the shared
 * machine-to-machine token. 'local' (tests) writes to this service's own
 * notifications replica table so tests stay standalone and deterministic.
 */
class NotificationClient
{
    public static function notifyAdmins(
        string $type,
        string $title,
        string $message,
        string $priority = 'low',
        ?string $actionUrl = null
    ): void {
        self::push($type, $title, $message, $priority, $actionUrl, null);
    }

    public static function notifyEmployee(
        string $employeeId,
        string $type,
        string $title,
        string $message,
        string $priority = 'low',
        ?string $actionUrl = null
    ): void {
        self::push($type, $title, $message, $priority, $actionUrl, $employeeId);
    }

    private static function push(
        string $type,
        string $title,
        string $message,
        string $priority,
        ?string $actionUrl,
        ?string $employeeId
    ): void {
        if (config('svc.notifications_mode', 'remote') === 'local') {
            self::writeLocal($type, $title, $message, $priority, $actionUrl, $employeeId);

            return;
        }

        try {
            Http::timeout(5)
                ->withHeader('X-Service-Token', (string) config('svc.token'))
                ->post(rtrim(config('svc.communications.url'), '/').'/api/internal/notifications', [
                    'type' => $type,
                    'title' => $title,
                    'message' => $message,
                    'priority' => $priority,
                    'actionUrl' => $actionUrl,
                    'employeeId' => $employeeId,
                ]);
        } catch (\Throwable $e) {
            Log::warning('Notification push failed', ['error' => $e->getMessage()]);
        }
    }

    private static function writeLocal(
        string $type,
        string $title,
        string $message,
        string $priority,
        ?string $actionUrl,
        ?string $employeeId
    ): void {
        if (! class_exists(\App\Models\Notification::class)) {
            return;
        }

        $max = \App\Models\Notification::where('id', 'like', 'NTF%')->max('id');
        $num = $max ? ((int) substr((string) $max, 3)) + 1 : 1;

        \App\Models\Notification::create([
            'id' => 'NTF'.str_pad((string) $num, 3, '0', STR_PAD_LEFT),
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'priority' => $priority,
            'action_url' => $actionUrl,
            'employee_id' => $employeeId,
            'timestamp' => now(),
            'read' => false,
        ]);
    }
}