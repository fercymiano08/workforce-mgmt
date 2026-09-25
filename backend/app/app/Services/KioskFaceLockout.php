<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;

/**
 * "Five wrong faces, then the face reader stops for a minute."
 *
 * This is enforced here, on the server, rather than in the terminal. The terminal used to keep its
 * strike count in a React ref, which meant a refresh - or simply opening the kiosk on another tab -
 * wiped it, and five guesses were always available again. A kiosk is a shared, unattended device,
 * so the limit has to survive the browser being closed.
 *
 * The counter is per kiosk (not per employee): the thing being throttled is one camera on one wall,
 * and an attacker is free to type a different employee ID every attempt. Attempts expire on their own
 * after COUNT_TTL so an abandoned attempt cannot lock a real employee out all afternoon.
 */
class KioskFaceLockout
{
    /** Wrong faces allowed before the reader pauses. */
    public const MAX_ATTEMPTS = 5;

    /** How long the reader pauses once the limit is hit. */
    public const LOCK_SECONDS = 60;

    /** Strikes are forgotten after this long without a failure, so they must be retried not remembered. */
    private const COUNT_TTL_SECONDS = 900;

    private const COUNT_KEY = 'kiosk:face:failures';

    private const LOCK_KEY = 'kiosk:face:locked-until';

    /** Seconds left on the lock, or 0 when the reader is free. */
    public static function secondsRemaining(): int
    {
        $until = Cache::get(self::LOCK_KEY);
        if (! is_numeric($until)) {
            return 0;
        }

        return max(0, ((int) $until) - now()->timestamp);
    }

    public static function isLocked(): bool
    {
        return self::secondsRemaining() > 0;
    }

    public static function attemptsRemaining(): int
    {
        if (self::isLocked()) {
            return 0;
        }

        return max(0, self::MAX_ATTEMPTS - (int) Cache::get(self::COUNT_KEY, 0));
    }

    /**
     * Records one failed verification, and starts the lock once the limit is reached.
     *
     * @return array{locked: bool, retryAfter: int, attemptsRemaining: int}
     */
    public static function recordFailure(): array
    {
        $attempts = (int) Cache::get(self::COUNT_KEY, 0) + 1;

        if ($attempts >= self::MAX_ATTEMPTS) {
            // Start the clock over once the lock is set, so the next window really is five fresh tries.
            Cache::forget(self::COUNT_KEY);
            Cache::put(self::LOCK_KEY, now()->addSeconds(self::LOCK_SECONDS)->timestamp, now()->addSeconds(self::LOCK_SECONDS));

            return ['locked' => true, 'retryAfter' => self::LOCK_SECONDS, 'attemptsRemaining' => 0];
        }

        Cache::put(self::COUNT_KEY, $attempts, now()->addSeconds(self::COUNT_TTL_SECONDS));

        return [
            'locked' => false,
            'retryAfter' => 0,
            'attemptsRemaining' => self::MAX_ATTEMPTS - $attempts,
        ];
    }

    /** A person who passes clears the slate: a good scan is not a continuation of a bad one. */
    public static function clear(): void
    {
        Cache::forget(self::COUNT_KEY);
        Cache::forget(self::LOCK_KEY);
    }
}
