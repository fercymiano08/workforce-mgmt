<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * The password-reset code email.
 *
 * This deliberately exists as a Mailable rather than as a Mail::raw() text blob. Laravel's
 * MailFake makes raw() an empty no-op, which means a raw() email is literally unassertable: the
 * send can silently stop happening and a test suite stays green. As a Mailable it is recorded
 * properly, so the code that arrives in the inbox can be read back out of the fake and actually
 * used to complete a reset.
 *
 * Plain text, not HTML. A six digit code has no business being markup, and a text-only message
 * is the least spammy thing to send to an inbox that did not ask for marketing mail.
 */
class PasswordResetCodeMail extends Mailable
{
    public function __construct(
        public readonly string $name,
        public readonly string $otp,
        public readonly int $minutes,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'WorkForce Pro - Password Reset Code',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.password-reset-code',
            with: [
                'name' => $this->name,
                'otp' => $this->otp,
                'minutes' => $this->minutes,
            ],
        );
    }
}
