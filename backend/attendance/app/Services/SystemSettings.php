<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Reads the policy numbers HR edits on the Settings page (settings.system.*), owned by the
 * Configuration service. The local settings replica (refreshed every minute) is read first; only when
 * it holds nothing does this go over HTTP, and that answer is remembered for the request.
 */
class SystemSettings
{
    /** @var array<string, mixed> */
    private static array $fetched = [];

    public function get(string $key, mixed $default = null): mixed
    {
        return $this->all()[$key] ?? $default;
    }

    /** @return array<string, mixed> */
    public function all(): array
    {
        $local = $this->readLocalReplica();
        if ($local !== [] || config('svc.configuration_mode', 'remote') === 'local') {
            return $local;
        }

        if (self::$fetched !== []) {
            return self::$fetched;
        }

        try {
            $response = Http::connectTimeout(1)->timeout(3)
                ->withHeader('X-Service-Token', (string) config('svc.token'))
                ->get(rtrim(config('svc.configuration.url'), '/').'/api/internal/settings');

            $settings = $response->successful() ? $response->json('data') : [];
        } catch (\Throwable $e) {
            Log::warning('Settings fetch failed', ['error' => $e->getMessage()]);
            $settings = [];
        }

        return self::$fetched = is_array($settings['system'] ?? null) ? $settings['system'] : [];
    }

    /** @return array<string, mixed> */
    private function readLocalReplica(): array
    {
        if (! class_exists(\App\Models\Setting::class)) {
            return [];
        }

        $setting = \App\Models\Setting::firstOrNew(['id' => 1]);

        return is_array($setting->system) ? $setting->system : [];
    }
}
