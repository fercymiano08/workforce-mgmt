<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Read/write access to the Configuration service (settings.ai_resolved_insights)
 * over HTTP.
 *
 * 'remote' (production): the resolve/unresolve is POSTed to the Configuration
 * service (which owns the settings row) and the local settings replica is
 * refreshed so insight state reads correctly for the rest of the request
 * lifecycle. 'local' (tests): the write hits the local table.
 */
class ConfigClient
{
    public static function updateAiInsights(string $key, bool $resolved): void
    {
        if (config('svc.configuration_mode', 'remote') === 'local') {
            self::writeLocal($key, $resolved);

            return;
        }

        try {
            $response = Http::timeout(5)
                ->withHeader('X-Service-Token', (string) config('svc.token'))
                ->post(rtrim(config('svc.configuration.url'), '/').'/api/internal/settings/ai-insights', [
                    'key' => $key,
                    'resolved' => $resolved,
                ]);

            if ($response->successful()) {
                self::writeLocal($key, $resolved);
            }
        } catch (\Throwable $e) {
            Log::warning('AI insight resolution failed', ['error' => $e->getMessage()]);
        }
    }

    private static function writeLocal(string $key, bool $resolved): void
    {
        if (! class_exists(\App\Models\Setting::class)) {
            return;
        }

        $setting = \App\Models\Setting::firstOrCreate([]);
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