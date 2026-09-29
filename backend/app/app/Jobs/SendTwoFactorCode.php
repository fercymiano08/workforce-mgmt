<?php

namespace App\Jobs;

use App\Mail\TwoFactorCodeMail;
use App\Services\AuditLogger;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Sends the sign-in code, AFTER the response has already gone back to the browser.
 *
 * Same reasoning as SendPasswordResetCode, and it matters more here: the person has already typed
 * their password, so the screen is waiting on nothing but this code. Handing a message to a remote
 * SMTP server takes seconds, and doing that inside the request would mean watching a spinner on a
 * step that is supposed to feel instant.
 *
 * So the challenge row is written first, the response goes out immediately, and the mail leaves
 * afterwards. dispatchAfterResponse() runs it in this same process rather than leaving it in a queue
 * that nobody may be draining - a sign-in code stranded in an unworked queue is a locked-out employee.
 */
class SendTwoFactorCode
{
    use Dispatchable;

    public function __construct(
        private readonly string $email,
        private readonly string $name,
        private readonly string $otp,
        private readonly int $minutes,
    ) {}

    public function handle(): void
    {
        // A mail failure must not read as a rejected sign-in: the password was genuinely accepted and
        // the browser has already been told to wait for a code. Log it loudly and let the person retry.
        try {
            Mail::to($this->email)->send(new TwoFactorCodeMail(
                $this->name,
                $this->otp,
                $this->minutes,
            ));
        } catch (\Throwable $e) {
            Log::warning('Two-factor sign-in email could not be sent.', [
                'email' => $this->email,
                'reason' => $e->getMessage(),
            ]);

            AuditLogger::record('auth', 'auth.two_factor_mail_failed', 'user', $this->email, null, null, null, null, [
                'reason' => $e->getMessage(),
            ]);
        }
    }
}
