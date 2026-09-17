<?php

namespace App\Services;

use App\Models\Notification;
use App\Models\User;

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
     * Fan out a notification to every administrator account.
     */
    public static function notifyAdmins(
        string $type,
        string $title,
        string $message,
        string $priority = 'low',
        ?string $actionUrl = null
    ): void {
        foreach (User::where('role', 'Administrator')->get() as $admin) {
            self::create([
                'type' => $type,
                'title' => $title,
                'message' => $message,
                'priority' => $priority,
                'action_url' => $actionUrl,
            ]);
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
