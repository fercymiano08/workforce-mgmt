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

    /**
     * One concurrent HTTP batch instead of N sequential 5s-timeout calls.
     *
     * @param  array<int, array{type: string, title: string, message: string, priority: string, actionUrl: ?string}>  $items
     */
    public static function notifyAdminsMany(array $items): void
    {
        if ($items === []) {
            return;
        }

        if (config('svc.notifications_mode', 'remote') === 'local') {
            foreach ($items as $i) {
                self::writeLocal($i['type'], $i['title'], $i['message'], $i['priority'], $i['actionUrl'] ?? null, null);
            }

            return;
        }

        try {
            $token = (string) config('svc.token');
            $url = rtrim(config('svc.communications.url'), '/').'/api/internal/notifications';

            Http::pool(function ($pool) use ($items, $token, $url) {
                foreach ($items as $n => $i) {
                    $pool->as((string) $n)->timeout(5)
                        ->withHeader('X-Service-Token', $token)
                        ->post($url, [
                            'type' => $i['type'],
                            'title' => $i['title'],
                            'message' => $i['message'],
                            'priority' => $i['priority'],
                            'actionUrl' => $i['actionUrl'] ?? null,
                            'employeeId' => null,
                        ]);
                }
            });
        } catch (\Throwable $e) {
            Log::warning('Notification batch push failed', ['error' => $e->getMessage()]);
        }
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
            Http::connectTimeout(1)->timeout(3)
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