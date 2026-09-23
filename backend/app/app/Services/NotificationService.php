<?php

namespace App\Services;

use App\Models\Notification;

class NotificationService
{
    /**
     * Create a notification with a sequential NTF id and timestamp.
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

    /**
     * Create an admin-inbox notification: one row with no employee_id, visible to every
     * Administrator (the inbox query is `whereNull('employee_id')`, not scoped per admin).
     */
    public static function notifyAdmins(
        string $type,
        string $title,
        string $message,
        string $priority = 'low',
        ?string $actionUrl = null
    ): void {
        self::create([
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'priority' => $priority,
            'action_url' => $actionUrl,
        ]);
    }

    /**
     * Create several admin-inbox notifications at once.
     *
     * @param  array<int, array{type: string, title: string, message: string, priority: string, actionUrl: ?string}>  $items
     */
    public static function notifyAdminsMany(array $items): void
    {
        foreach ($items as $i) {
            self::notifyAdmins($i['type'], $i['title'], $i['message'], $i['priority'], $i['actionUrl'] ?? null);
        }
    }

    /**
     * Create a notification targeting a specific employee.
     */
    public static function notifyEmployee(
        string $employeeId,
        string $type,
        string $title,
        string $message,
        string $priority = 'low',
        ?string $actionUrl = null
    ): Notification {
        return self::create([
            'type' => $type,
            'title' => $title,
            'message' => $message,
            'priority' => $priority,
            'action_url' => $actionUrl,
            'employee_id' => $employeeId,
        ]);
    }
}
