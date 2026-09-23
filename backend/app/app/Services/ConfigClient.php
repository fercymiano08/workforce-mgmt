<?php

namespace App\Services;

use App\Models\Setting;

/**
 * Tracks which AI Decision Support insights an administrator has resolved/unresolved.
 */
class ConfigClient
{
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
