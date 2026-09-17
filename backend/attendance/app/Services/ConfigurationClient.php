<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Read/write access to the Configuration service (settings) over HTTP.
 *
 * 'remote' (production): GET reads are served from the local settings replica;
 * only WRITES propagate to the Configuration service (which owns the row), then
 * the local replica is refreshed. 'local' (tests): writes hit the local table.
 */
class ConfigurationClient
{
    public static function updateKiosk(array $kiosk): void
    {
        if (config('svc.configuration_mode', 'remote') === 'local') {
            self::writeLocalKiosk($kiosk);

            return;
        }

        try {
            $response = Http::timeout(5)
                ->withHeader('X-Service-Token', (string) config('svc.token'))
                ->post(rtrim(config('svc.configuration.url'), '/').'/api/internal/settings/kiosk', [
                    'kiosk' => $kiosk,
                ]);

            if ($response->successful()) {
                self::writeLocalKiosk($kiosk);
            }
        } catch (\Throwable $e) {
            Log::warning('Configuration kiosk write failed', ['error' => $e->getMessage()]);
        }
    }

    private static function writeLocalKiosk(array $kiosk): void
    {
        if (! class_exists(\App\Models\Setting::class)) {
            return;
        }

        $setting = \App\Models\Setting::firstOrNew(['id' => 1]);
        $current = $setting->kiosk ?? [];
        $setting->kiosk = array_merge(is_array($current) ? $current : [], $kiosk);
        $setting->save();
    }
}