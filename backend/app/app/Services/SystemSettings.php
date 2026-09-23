<?php

namespace App\Services;

use App\Models\Setting;

/**
 * The policy numbers HR edits on the Settings page (settings.system.*).
 */
class SystemSettings
{
    public function get(string $key, mixed $default = null): mixed
    {
        return $this->all()[$key] ?? $default;
    }

    /** @return array<string, mixed> */
    public function all(): array
    {
        $setting = Setting::firstOrNew(['id' => 1]);

        return is_array($setting->system) ? $setting->system : [];
    }
}
