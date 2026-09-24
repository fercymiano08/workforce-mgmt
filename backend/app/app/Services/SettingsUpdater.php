<?php

namespace App\Services;

use App\Models\Setting;

/**
 * Writes to the single settings row from outside the Settings page: the kiosk config and
 * which AI Decision Support insights an administrator has resolved/unresolved.
 */
class SettingsUpdater
{
    /** Merges a kiosk config patch into the settings row. */
    public static function updateKiosk(array $kiosk): void
    {
        $setting = Setting::firstOrNew(['id' => 1]);
        $current = $setting->kiosk ?? [];
        $setting->kiosk = array_merge(is_array($current) ? $current : [], $kiosk);
        $setting->save();
    }

    public static function updateAiInsights(string $key, bool $resolved): void
    {
        $setting = Setting::firstOrCreate([]);
        $keys = array_values(array_unique((array) ($setting->ai_resolved_insights ?? [])));
        if ($resolved) {
            if (! in_array($key, $keys, true)) {
                $keys[] = $key;
            }
        } else {
            $keys = array_values(array_diff($keys, [$key]));
        }
        $setting->update(['ai_resolved_insights' => array_values(array_unique($keys))]);
    }
}
