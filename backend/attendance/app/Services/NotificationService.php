<?php

namespace App\Services;

use App\Models\Notification;

/**
 * Remote-capable notification dispatcher (used by services other than
 * Communications). In production it fans out over HTTP to the Communications
 * service via NotificationClient. In test mode the same client writes to this
 * service's local notifications replica so tests stay standalone.
 *
 * The call signature mirrors the original monolith so controllers are unchanged.
 */
class NotificationService
{
    /**
     * Create a notification with a sequential NTF id and timestamp.
     * Only the Communications service currently calls create() directly;
     * here it writes the local replica so nothing breaks if a controller opts in.
     *
     * @param  array<string, mixed>  $data
     */
    public static function create(array $data): Notification
    {
        $max = Notification::where('id', 'like', 'NTF%')->max('id');
        $num = $max ? ((int) substr((string) $max, 3)) + 1 : 1;

        $data['id'] = 'NTF'.str_pad((string) $num, 3, '0', STR_PAD_LEFT);
        $data['timestamp'] = now();
        $data['read'] = false;

        return Notification::create($data);
    }

    public static function notifyAdmins(
        string $type,
        string $title,
        string $message,
        string $priority = 'low',
        ?string $actionUrl = null
    ): void {
        NotificationClient::notifyAdmins($type, $title, $message, $priority, $actionUrl);
    }

    /**
     * Send several admin notifications in one concurrent batch.
     *
     * @param  array<int, array{type: string, title: string, message: string, priority: string, actionUrl: ?string}>  $items
     */
    public static function notifyAdminsMany(array $items): void
    {
        NotificationClient::notifyAdminsMany($items);
    }

    public static function notifyEmployee(
        string $employeeId,
        string $type,
        string $title,
        string $message,
        string $priority = 'low',
        ?string $actionUrl = null
    ): void {
        NotificationClient::notifyEmployee($employeeId, $type, $title, $message, $priority, $actionUrl);
    }
}