<?php

namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/**
 * The sign-in code email for an account that has two-factor sign-in turned on.
 *
 * A Mailable rather than a raw text blob for the same reason as the password-reset one: Laravel's
 * MailFake records Mailables properly, so a test can read the code back out of the fake and actually
 * complete a sign-in with it. A raw() email is unassertable - the send can stop happening and the
 * suite stays green.
 *
 * The wording is deliberately careful. It says the password has already been accepted, because that is
 * what the person did, and the subject never mentions that an account exists, so a code mailed in
 * error leaks nothing on its own.
 */
class TwoFactorCodeMail extends Mailable
{
    public function __construct(
        public readonly string $name,
        public readonly string $otp,
        public readonly int $minutes,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'WorkForce Pro - Sign-In Code',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'mail.two-factor-code',
            with: [
                'name' => $this->name,
                'otp' => $this->otp,
                'minutes' => $this->minutes,
            ],
        );
    }
}
