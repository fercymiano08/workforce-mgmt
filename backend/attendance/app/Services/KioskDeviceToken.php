<?php

namespace App\Services;

use App\Models\Setting;

/**
 * Signed, expiring "this device passed the kiosk PIN" token.
 *
 * The entrance device is not a user account, so it cannot hold a Sanctum token.
 * Instead, entering the kiosk PIN correctly (or an Administrator setting it)
 * returns one of these, and the clock-in endpoints require it in the
 * X-Kiosk-Token header. Nothing is stored: the token is `<expiry>.<hmac>`, and
 * the HMAC covers the current PIN hash, so changing or resetting the PIN
 * instantly invalidates every token issued before it.
 */
class KioskDeviceToken
{
    /** A device stays unlocked for a day, matching the terminal's own lock timeout. */
    public const LIFETIME_SECONDS = 86400;

    /**
     * @return array{token: string, expiresAt: int}|null null when no PIN is set
     */
    public static function issue(): ?array
    {
        $pinHash = self::currentPinHash();
        if ($pinHash === null) {
            return null;
        }

        $expiresAt = now()->timestamp + self::LIFETIME_SECONDS;

        return [
            'token' => $expiresAt.'.'.self::sign($expiresAt, $pinHash),
            'expiresAt' => $expiresAt,
        ];
    }

    public static function valid(?string $token): bool
    {
        $pinHash = self::currentPinHash();
        if ($pinHash === null || $token === null || ! str_contains($token, '.')) {
            return false;
        }

        [$expiresAt, $signature] = explode('.', $token, 2);
        if (! ctype_digit($expiresAt) || (int) $expiresAt < now()->timestamp) {
            return false;
        }

        return hash_equals(self::sign((int) $expiresAt, $pinHash), $signature);
    }

    public static function currentPinHash(): ?string
    {
        $kiosk = Setting::query()->first()?->kiosk;
        $hash = is_array($kiosk) ? ($kiosk['pinHash'] ?? null) : null;

        return is_string($hash) && $hash !== '' ? $hash : null;
    }

    private static function sign(int $expiresAt, string $pinHash): string
    {
        return hash_hmac('sha256', 'kiosk-device|'.$expiresAt.'|'.$pinHash, (string) config('app.key'));
    }
}
