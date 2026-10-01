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
    public function test_the_from_address_falls_back_to_the_authenticated_account_when_it_is_a_real_address(): void
    {
        // Gmail's SMTP authenticates with an actual mailbox, so when that is the login the fallback
        // is both safe and correct: it names an address the provider genuinely vouches for.
        $mail = $this->loadMailConfig([
            'MAIL_FROM_ADDRESS' => null,
            'MAIL_USERNAME' => 'fercy.miano84@gmail.com',
        ]);

        $this->assertSame('fercy.miano84@gmail.com', $mail['from']['address']);
    }

    /**
     * The bug this exists to prevent: an unguarded fallback to MAIL_USERNAME puts a Brevo SMTP login
     * key in the From header. Those keys look like 'xsmtp-relay.brevo.com-a1b2c3' and are not email
     * addresses at all, so the resulting mail is invalid at every hop - strictly worse than the
     * problem the fallback was meant to solve.
     */
    public function test_an_smtp_login_key_is_never_used_as_the_from_address(): void
    {
        $mail = $this->loadMailConfig([
            'MAIL_FROM_ADDRESS' => null,
            'MAIL_USERNAME' => 'xsmtp-relay.brevo.com-a1b2c3d4e5',
        ]);

        $this->assertNotSame(
            'xsmtp-relay.brevo.com-a1b2c3d4e5',
            $mail['from']['address'],
            'An SMTP login key must never become a From address.'
        );
        $this->assertNotFalse(
            filter_var($mail['from']['address'], FILTER_VALIDATE_EMAIL),
            'The fallback From address must at least be a syntactically valid email.'
        );
    }

    public function test_the_from_address_can_still_be_set_explicitly(): void
    {
        // A deployment that owns its domain and has SPF/DKIM/DMARC configured sets it deliberately.
        $mail = $this->loadMailConfig([
            'MAIL_FROM_ADDRESS' => 'no-reply@workforcepro.com',
            'MAIL_USERNAME' => 'xsmtp-relay.brevo.com-a1b2c3d4e5',
        ]);

        $this->assertSame('no-reply@workforcepro.com', $mail['from']['address']);
    }

    public function test_an_explicit_from_address_wins_even_when_the_login_is_a_real_address(): void
    {
        $mail = $this->loadMailConfig([
            'MAIL_FROM_ADDRESS' => 'codes@brevo-verified-sender.com',
            'MAIL_USERNAME' => 'fercy.miano84@gmail.com',
        ]);

        $this->assertSame('codes@brevo-verified-sender.com', $mail['from']['address']);
    }

    public function test_the_configured_from_address_is_never_blank(): void
    {
        // A blank From is rejected outright by most relays, and the failure looks like a timeout
        // rather than a configuration error, which is a miserable thing to debug.
        $this->assertNotSame('', trim((string) config('mail.from.address')));
        $this->assertNotFalse(
            filter_var(config('mail.from.address'), FILTER_VALIDATE_EMAIL),
            'Whatever this deployment resolves to, it has to be a real address.'
        );
    }

    public function test_the_brevo_mailer_points_at_brevos_own_relay_by_default(): void
    {
        // The point being pinned is the *default*: switching MAIL_MAILER to brevo should be the only
        // edit needed, since a developer should not also have to restate the host and port.
        $mail = $this->loadMailConfig([
            'MAIL_HOST' => null,
            'MAIL_PORT' => null,
            'MAIL_SCHEME' => null,
        ]);

        $this->assertSame('smtp', $mail['mailers']['brevo']['transport']);
        $this->assertSame('smtp-relay.brevo.com', $mail['mailers']['brevo']['host']);
        $this->assertSame(587, $mail['mailers']['brevo']['port']);

        // No scheme default, and 'tls' must never come back. Symfony supports only 'smtp' and
        // 'smtps', so a 'tls' default throws UnsupportedSchemeException before the socket opens:
        // nothing reaches the relay, and its dashboard shows no activity to explain why.
        $this->assertNull($mail['mailers']['brevo']['scheme']);
    }

    /** The scheme must be one Symfony actually supports, or the send dies before connecting. */
    public function test_the_mailer_only_accepts_schemes_symfony_supports(): void
    {
        foreach (['tls', 'starttls', 'ssl'] as $unsupported) {
            $this->assertNotContains(
                $unsupported,
                ['smtp', 'smtps'],
                "'{$unsupported}' makes Symfony throw before opening a connection."
            );
        }

        foreach (['smtp', 'smtps'] as $supported) {
            $mail = $this->loadMailConfig(['MAIL_SCHEME' => $supported]);

            $this->assertSame($supported, $mail['mailers']['brevo']['scheme']);
        }
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
     * Reads config/mail.php with the given environment keys temporarily set (or, for a null value,
     * unset) so a specific deployment's configuration can be asserted directly, rather than only
     * whatever happens to be in .env on whichever machine is running the suite.
     *
     * @param  array<string, string|null>  $env
     * @return array<string, mixed>
     */
    private function loadMailConfig(array $env): array
    {
        $keys = array_keys($env);
        $saved = [];
        foreach ($keys as $key) {
            $saved[$key] = $_ENV[$key] ?? null;
            unset($_ENV[$key], $_SERVER[$key]);
            putenv($key);
            if ($env[$key] !== null) {
                $_ENV[$key] = $env[$key];
                $_SERVER[$key] = $env[$key];
                putenv("{$key}={$env[$key]}");
            }
        }

        try {
            return require config_path('mail.php');
        } finally {
            foreach ($saved as $key => $value) {
                unset($_ENV[$key], $_SERVER[$key]);
                putenv($key);
                if ($value !== null) {
                    $_ENV[$key] = $value;
                    $_SERVER[$key] = $value;
                    putenv("{$key}={$value}");
                }
            }
        }
    }

    /**
     * The bug that stopped mail reaching Brevo entirely.
     *
     * The brevo mailer used to read MAIL_HOST, so a deployment that had moved from Gmail to Brevo
     * while still carrying MAIL_HOST=smtp.gmail.com would dial Gmail, hand it Brevo's SMTP key, and
     * fail authentication - without a single message ever reaching Brevo, so Brevo's own log showed
     * nothing and it looked like the mailer had not been switched on at all.
     *
     * The two mailers now have separate hosts, so selecting one cannot inherit the other's.
     */
    public function test_the_brevo_mailer_ignores_a_stale_mail_host_left_over_from_another_provider(): void
    {
        $mail = $this->loadMailConfig([
            'MAIL_HOST' => 'smtp.gmail.com',
            'MAIL_PORT' => '587',
            'BREVO_HOST' => null,
            'BREVO_PORT' => null,
        ]);

        $this->assertSame(
            'smtp-relay.brevo.com',
            $mail['mailers']['brevo']['host'],
            'Selecting the brevo mailer must not inherit smtp.gmail.com as its host.'
        );
        $this->assertSame(587, $mail['mailers']['brevo']['port']);
    }

    /** The smtp mailer keeps honouring MAIL_HOST, so the separation does not break existing setups. */
    public function test_the_smtp_mailer_still_honours_mail_host(): void
    {
        $mail = $this->loadMailConfig(['MAIL_HOST' => 'smtp.gmail.com', 'MAIL_PORT' => '587']);

        $this->assertSame('smtp.gmail.com', $mail['mailers']['smtp']['host']);
    }

    /** BREVO_* overrides win when a deployment genuinely needs to point elsewhere. */
    public function test_brevo_specific_variables_override_the_defaults(): void
    {
        $mail = $this->loadMailConfig([
            'BREVO_HOST' => 'smtp-relay.brevo.com',
            'BREVO_PORT' => '2525',
        ]);

        $this->assertSame('smtp-relay.brevo.com', $mail['mailers']['brevo']['host']);
        $this->assertSame(2525, $mail['mailers']['brevo']['port']);
    }

    public function test_the_mailer_never_points_at_the_log_driver_in_production(): void
    {
        // 'log' silently writes mail to a file instead of sending it. Harmless locally, and the
        // reason a reset email can appear to "work" in testing and never arrive in real use.
        $this->assertNotSame('log', config('mail.default'));
    }
}