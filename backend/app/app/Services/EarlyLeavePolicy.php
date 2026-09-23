<?php

namespace App\Services;

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
    // A SICK claim cannot be checked at the kiosk, so proof is due within this many hours.
    public const DEFAULT_CERTIFICATE_HOURS = 48;

    public function windowDays(): int
    {
        return (int) $this->value('early_leave_window_days', self::DEFAULT_WINDOW_DAYS);
    }

    public function allowedCount(): int
    {
        return (int) $this->value('early_leave_allowed_count', self::DEFAULT_ALLOWED_COUNT);
    }

    public function certificateHours(): int
    {
        return max(1, (int) $this->value('early_leave_certificate_hours', self::DEFAULT_CERTIFICATE_HOURS));
    }

    public function sickCertThreshold(): int
    {
        return (int) $this->value('early_leave_sick_cert_threshold', self::DEFAULT_SICK_CERT_THRESHOLD);
    }

    /** @return mixed */
    private function value(string $key, mixed $default): mixed
    {
        return app(SystemSettings::class)->get($key, $default);
    }
}
