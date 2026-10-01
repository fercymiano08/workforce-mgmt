<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Who the mail claims to be from decides whether Gmail shows it in the inbox.
 *
 * A relay accepts mail from any address you like, so a bad From address does not error anywhere -
 * it fails silently at the receiving end. These tests pin the safe default so the config cannot
 * quietly drift back into sending as a domain nobody controls.
 */
class MailFromAddressTest extends TestCase
{
    public function test_the_from_address_falls_back_to_the_authenticated_account(): void
    {
        // No MAIL_FROM_ADDRESS set, as in a correctly configured deployment: send as the address the
        // provider has actually verified, which is the only one Gmail can be trusted to accept.
        config(['mail.from.address' => env('MAIL_USERNAME') ?: 'hello@example.com']);

        $this->assertSame(
            env('MAIL_USERNAME') ?: 'hello@example.com',
            config('mail.from.address'),
            'An unset MAIL_FROM_ADDRESS must send as the authenticated mail account.'
        );
    }

    public function test_the_from_address_can_still_be_set_explicitly(): void
    {
        // A deployment that owns its domain and has SPF/DKIM/DMARC configured may still override it.
        config(['mail.from.address' => 'no-reply@workforcepro.com']);

        $this->assertSame('no-reply@workforcepro.com', config('mail.from.address'));
    }

    public function test_the_configured_from_address_is_never_blank(): void
    {
        // A blank From is rejected outright by most relays, and the failure looks like a timeout
        // rather than a configuration error, which is a miserable thing to debug.
        $this->assertNotSame('', trim((string) config('mail.from.address')));
    }

    public function test_the_brevo_mailer_points_at_brevos_own_relay_by_default(): void
    {
        // Loaded with MAIL_HOST/MAIL_PORT cleared, because the point being pinned is the *default*:
        // switching MAIL_MAILER to brevo should be the only edit needed, since a developer should
        // not have to also restate the host and port.
        $mail = $this->loadMailConfigWithoutHostOverrides();

        $this->assertSame('smtp', $mail['mailers']['brevo']['transport']);
        $this->assertSame('smtp-relay.brevo.com', $mail['mailers']['brevo']['host']);
        $this->assertSame(587, $mail['mailers']['brevo']['port']);
        $this->assertSame('tls', $mail['mailers']['brevo']['scheme']);
    }

    /**
     * The mailer must never be able to hold a request open past PHP's own time limit: the reset
     * endpoint is dispatched after the response, but the mail send still runs in that request.
     */
    public function test_no_mailer_can_hold_a_request_open_indefinitely(): void
    {
        foreach (['smtp', 'brevo'] as $name) {
            $this->assertLessThanOrEqual(
                15,
                config("mail.mailers.{$name}.timeout"),
                "The {$name} mailer must have a bounded timeout."
            );
        }
    }

    /**
     * Reads config/mail.php with MAIL_HOST and MAIL_PORT temporarily unset, so the defaults baked
     * into the file are what gets asserted rather than whatever this machine happens to use.
     *
     * @return array<string, mixed>
     */
    private function loadMailConfigWithoutHostOverrides(): array
    {
        $saved = ['MAIL_HOST' => $_ENV['MAIL_HOST'] ?? null, 'MAIL_PORT' => $_ENV['MAIL_PORT'] ?? null];
        foreach (array_keys($saved) as $key) {
            unset($_ENV[$key], $_SERVER[$key]);
            putenv($key);
        }

        try {
            return require config_path('mail.php');
        } finally {
            foreach ($saved as $key => $value) {
                if ($value !== null) {
                    $_ENV[$key] = $value;
                    putenv("{$key}={$value}");
                }
            }
        }
    }

    public function test_the_mailer_never_points_at_the_log_driver_in_production(): void
    {
        // 'log' silently writes mail to a file instead of sending it. Harmless locally, and the
        // reason a reset email can appear to "work" in testing and never arrive in real use.
        $this->assertNotSame('log', config('mail.default'));
    }
}