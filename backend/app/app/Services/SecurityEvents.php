<?php

namespace App\Services;

use App\Models\SecurityEvent;

/**
 * Security-event resolution (kiosk PIN/face mismatches).
 */
class SecurityEvents
{
    public static function resolveSecurityEvent(string $id, ?string $resolvedBy): void
    {
        $event = SecurityEvent::find($id);
        if ($event) {
            $event->update([
                'status' => 'Resolved',
                'resolved_at' => now(),
                'resolved_by' => $resolvedBy,
            ]);
        }
    }

    public static function flagSecurityEvent(string $id, ?string $resolvedBy): void
    {
        $event = SecurityEvent::find($id);
        if ($event) {
            $event->update([
                'status' => 'Flagged',
                'resolved_at' => now(),
                'resolved_by' => $resolvedBy,
            ]);
        }
    }

    public static function resolveAllSecurityEvents(?string $resolvedBy): void
    {
        SecurityEvent::where('status', 'Open')
            ->orWhere('status', 'Flagged')
            ->get()
            ->each(function (SecurityEvent $event) use ($resolvedBy): void {
                $event->update([
                    'status' => 'Resolved',
                    'resolved_at' => now(),
                    'resolved_by' => $resolvedBy,
                ]);
            });
    }
}
