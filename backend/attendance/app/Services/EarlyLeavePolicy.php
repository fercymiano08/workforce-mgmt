<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

/**
 * Early-leave policy thresholds.
 *
 * The numbers are owned by the Configuration service (settings.system.*) and
 * editable by HR on the Settings page. This reads the live settings over HTTP
 * so every classification decision uses the values HR configured, falling back
 * to sensible defaults when the Configuration service is unreachable or in
 * test ('local') mode.
 */
class EarlyLeavePolicy
{
    public const DEFAULT_WINDOW_DAYS = 30;
    public const DEFAULT_ALLOWED_COUNT = 2;
    public const DEFAULT_SICK_CERT_THRESHOLD = 2;

    private static array $cached = [];

    public function windowDays(): int
    {
        return (int) $this->value('early_leave_window_days', self::DEFAULT_WINDOW_DAYS);
    }

    public function allowedCount(): int
    {
        return (int) $this->value('early_leave_allowed_count', self::DEFAULT_ALLOWED_COUNT);
    }

    public function sickCertThreshold(): int
    {
        return (int) $this->value('early_leave_sick_cert_threshold', self::DEFAULT_SICK_CERT_THRESHOLD);
    }

    /** @return mixed */
    private function value(string $key, mixed $default): mixed
    {
        $system = $this->systemSettings();

        return $system[$key] ?? $default;
    }

    /** @return array<string, mixed> */
    private function systemSettings(): array
    {
        if (self::$cached !== []) {
            return self::$cached;
        }

        if (config('svc.configuration_mode', 'remote') === 'local') {
            return self::$cached = self::readLocalReplica();
        }

        // Read the local settings replica (refreshed every minute) first and only
        // go over HTTP when it has nothing yet - the early-leave endpoints
        // shouldn't wait on a remote call for a setting that rarely changes.
        $local = $this->readLocalReplica();
        if ($local !== []) {
            return self::$cached = $local;
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

        $system = is_array($settings['system'] ?? null) ? $settings['system'] : [];

        return self::$cached = $system;
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