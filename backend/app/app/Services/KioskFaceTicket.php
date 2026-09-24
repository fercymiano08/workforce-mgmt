<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Str;

/**
 * Proof that a face was matched on the server, required to clock in or out at the kiosk.
 *
 * The terminal runs the face scan and then, as a separate request, asks to clock in. Without this the
 * clock-in endpoint would have to trust that the scan happened, and anyone holding the kiosk device could
 * skip it. A successful POST /kiosk/verify-face issues a random ticket bound to that one employee; the
 * clock-in or clock-out must present it, and it is spent once the punch is recorded. It expires after a few
 * minutes, so a scan cannot be saved for later.
 */
class KioskFaceTicket
{
    /** Long enough for the "you are late / early" prompts and picking an early clock-out reason. */
    public const TTL_SECONDS = 300;

    public function issue(string $employeeId): string
    {
        $ticket = Str::random(48);
        Cache::put($this->key($ticket), $employeeId, self::TTL_SECONDS);

        return $ticket;
    }

    /** Whether the ticket was issued for this employee and is still unspent (does not spend it). */
    public function valid(?string $ticket, string $employeeId): bool
    {
        if (! is_string($ticket) || $ticket === '') {
            return false;
        }

        $owner = Cache::get($this->key($ticket));

        return is_string($owner) && hash_equals($owner, $employeeId);
    }

    /** Spent once the punch is saved, so one scan records exactly one punch. */
    public function spend(?string $ticket): void
    {
        if (is_string($ticket) && $ticket !== '') {
            Cache::forget($this->key($ticket));
        }
    }

    private function key(string $ticket): string
    {
        return 'kiosk-face-ticket:'.hash('sha256', $ticket);
    }
}
