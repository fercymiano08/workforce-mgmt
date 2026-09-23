<?php

namespace App\Services;

use App\Models\Setting;

/**
 * Merges a kiosk config patch into the single settings row.
 */
class ConfigurationClient
{
    public static function updateKiosk(array $kiosk): void
    {
        $setting = Setting::firstOrNew(['id' => 1]);
        $current = $setting->kiosk ?? [];
        $setting->kiosk = array_merge(is_array($current) ? $current : [], $kiosk);
        $setting->save();
    }
}
