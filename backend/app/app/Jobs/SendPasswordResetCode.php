<?php

namespace App\Jobs;

use App\Mail\PasswordResetCodeMail;
use App\Services\AuditLogger;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Mail;

/**
 * Sends the password-reset code, AFTER the response has already gone back to the browser.
 *
 * This exists for one reason: speed. Handing a message to a remote SMTP server is slow - a TLS
 * handshake, a login and a DATA round trip easily take a few seconds - and while that happens inside
 * the request, the person clicking "Send Reset Code" is staring at a spinner, and the browser only
 * learns the deadline once the mail server has already been spoken to. That is also why the
 * countdown used to open at 4:57 instead of 5:00: the deadline was stamped before the slow part.
 *
 * Dispatched with dispatchAfterResponse(), so the code is already stored (the person can type their
 * password straight away) and the API answers immediately, leaving the countdown to start at a full
 * window. It runs in this same PHP process, which means it cannot be silently stranded in a queue
 * that nobody is draining.
 */
class SendPasswordResetCode
{
    use Dispatchable;

    public function __construct(
        private readonly string $email,
        private readonly string $name,
        private readonly string $otp,
        private readonly int $minutes,
        private readonly int $issuedAt,
    ) {}

    public function handle(): void
    {
        // A mail failure must never surface as a failed reset request: the token is already stored,
        // the response has already been sent, and the person is told to try again. Log it and move on.
        try {
            Mail::to($this->email)->send(new PasswordResetCodeMail(
                $this->name,
                $this->otp,
                $this->minutes,
            ));
        } catch (\Throwable $e) {
            Log::warning('Password reset email could not be sent.', [
                'email' => $this->email,
                'reason' => $e->getMessage(),
            ]);

            AuditLogger::record('auth', 'auth.password_reset_mail_failed', 'user', $this->email, null, null, null, null, [
                'reason' => $e->getMessage(),
            ]);
        }
    }
}
