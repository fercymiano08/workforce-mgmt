<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Default Mailer
    |--------------------------------------------------------------------------
    |
    | This option controls the default mailer that is used to send all email
    | messages unless another mailer is explicitly specified when sending
    | the message. All additional mailers can be configured within the
    | "mailers" array. Examples of each type of mailer are provided.
    |
    */

    'default' => env('MAIL_MAILER', 'log'),

    /*
    |--------------------------------------------------------------------------
    | Mailer Configurations
    |--------------------------------------------------------------------------
    |
    | Here you may configure all of the mailers used by your application plus
    | their respective settings. Several examples have been configured for
    | you and you are free to add your own as your application requires.
    |
    | Laravel supports a variety of mail "transport" drivers that can be used
    | when delivering an email. You may specify which one you're using for
    | your mailers below. You may also add additional mailers if needed.
    |
    | Supported: "smtp", "sendmail", "mailgun", "ses", "ses-v2",
    |            "postmark", "resend", "log", "array",
    |            "failover", "roundrobin"
    |
    */

    'mailers' => [

        'smtp' => [
            'transport' => 'smtp',
            'scheme' => env('MAIL_SCHEME'),
            'url' => env('MAIL_URL'),
            'host' => env('MAIL_HOST', '127.0.0.1'),
            'port' => env('MAIL_PORT', 2525),
            'username' => env('MAIL_USERNAME'),
            'password' => env('MAIL_PASSWORD'),
            // Never let an unreachable mail host hold a request past PHP's 30s limit.
            'timeout' => (int) env('MAIL_TIMEOUT', 8),
            'local_domain' => env('MAIL_EHLO_DOMAIN', parse_url((string) env('APP_URL', 'http://localhost'), PHP_URL_HOST)),
        ],

        /*
         | Brevo (formerly Sendinblue) transactional relay.
         |
         | Set MAIL_MAILER=brevo and fill in the SMTP key from Brevo's SMTP & API > SMTP keys.
         | Host and port are Brevo's own defaults, so only the key is normally needed.
         |
         | Note that relay choice does not affect deliverability on its own. What decides whether
         | Gmail shows a message in the inbox is the From address (see the 'from' block below) -
         | a relay will happily accept mail claiming to be from a domain it cannot vouch for, and
         | Gmail will then quietly bin it.
         */
        'brevo' => [
            'transport' => 'smtp',
            /*
             | No default scheme, and that is deliberate.
             |
             | I previously defaulted this to 'tls', which is not a scheme Symfony supports: it
             | accepts only 'smtp' and 'smtps'. Symfony then threw UnsupportedSchemeException before
             | a socket was ever opened, so not one message reached the relay and its dashboard
             | showed nothing at all.
             |
             | Left unset, Symfony picks the right behaviour from the port: 'smtp' on 587 (opportunistic
             | STARTTLS), 'smtp' on 2525, 'smtps' on 465. Set MAIL_SCHEME=smtp for 587/2525 or
             | MAIL_SCHEME=smtps for 465 - never 'tls'.
             */
            'scheme' => env('MAIL_SCHEME'),
            /*
             | Read from BREVO_HOST, not MAIL_HOST.
             |
             | Falling back to MAIL_HOST here was a trap: a deployment that moved from Gmail to Brevo
             | almost certainly still has MAIL_HOST=smtp.gmail.com left over from before. Reusing that
             | variable meant setting MAIL_MAILER=brevo still dialled Gmail, presenting Brevo's SMTP
             | key to a server that does not know it, and failing authentication - so not one message
             | reached Brevo and the dashboard showed nothing at all, which looks exactly like the
             | mailer not being enabled.
             |
             | The mailer you select by name should therefore not borrow another mailer's settings.
             | MAIL_HOST remains the host for the 'smtp' mailer; this one is Brevo's unless
             | BREVO_HOST says otherwise.
             */
            'host' => env('BREVO_HOST', 'smtp-relay.brevo.com'),
            /*
             | 2525, not Brevo's usual 587.
             |
             | This relay is reached from Render's free web service plan, which blocks outbound
             | 25, 465 and 587 - port 2525 is the one Brevo port that stays open there (see
             | render.yaml). Defaulting to 587 meant that choosing this mailer by name, with no
             | other setting touched, silently traded a working port for a blocked one: the
             | connection never opens, so neither Brevo's dashboard nor Gmail's inbox shows
             | anything, which looks identical to the mailer being off.
             */
            'port' => (int) env('BREVO_PORT', 2525),
            'username' => env('BREVO_USERNAME') ?: env('MAIL_USERNAME'),
            'password' => env('BREVO_PASSWORD') ?: env('MAIL_PASSWORD'),
            'timeout' => (int) env('MAIL_TIMEOUT', 8),
            'local_domain' => env('MAIL_EHLO_DOMAIN', parse_url((string) env('APP_URL', 'http://localhost'), PHP_URL_HOST)),
        ],

        'ses' => [
            'transport' => 'ses',
        ],

        'postmark' => [
            'transport' => 'postmark',
            // 'message_stream_id' => env('POSTMARK_MESSAGE_STREAM_ID'),
            // 'client' => [
            //     'timeout' => 5,
            // ],
        ],

        'resend' => [
            'transport' => 'resend',
        ],

        'sendmail' => [
            'transport' => 'sendmail',
            'path' => env('MAIL_SENDMAIL_PATH', '/usr/sbin/sendmail -bs -i'),
        ],

        'log' => [
            'transport' => 'log',
            'channel' => env('MAIL_LOG_CHANNEL'),
        ],

        'array' => [
            'transport' => 'array',
        ],

        'failover' => [
            'transport' => 'failover',
            'mailers' => [
                'smtp',
                'log',
            ],
            'retry_after' => 60,
        ],

        'roundrobin' => [
            'transport' => 'roundrobin',
            'mailers' => [
                'ses',
                'postmark',
            ],
            'retry_after' => 60,
        ],

    ],

    /*
    |--------------------------------------------------------------------------
    | Global "From" Address
    |--------------------------------------------------------------------------
    |
    | You may wish for all emails sent by your application to be sent from
    | the same address. Here you may specify a name and address that is
    | used globally for all emails that are sent by your application.
    |
    */

    'from' => [
        /*
         | The From address decides whether a message reaches a Gmail inbox - not which relay
         | sends it. A relay accepts whatever From you hand it and passes it on untouched; Gmail
         | then checks that domain's SPF/DKIM/DMARC records, finds nothing authorising the sender,
         | and discards the mail. The relay's dashboard still shows a clean send, because the
         | rejection happens after the relay's involvement ends.
         |
         | MAIL_FROM_ADDRESS must therefore be a real, provider-verified sender address.
         |
         | It must NOT fall back to MAIL_USERNAME unguarded. For an SMTP relay that is a login key,
         | not an address - Brevo's looks like 'xsmtp-relay.brevo.com-a1b2c3' - so an unguarded
         | fallback would put that string in the From header and produce mail that is invalid at
         | every hop. The fallback below therefore applies only when MAIL_USERNAME genuinely looks
         | like an email address, which is the case for mailers that authenticate with one.
         */
        'address' => env('MAIL_FROM_ADDRESS') ?: ((static function (): string {
            $candidate = trim((string) env('MAIL_USERNAME'));

            return filter_var($candidate, FILTER_VALIDATE_EMAIL) ? $candidate : 'hello@example.com';
        })()),
        'name' => env('MAIL_FROM_NAME') ?: env('APP_NAME', 'Laravel'),
    ],

];
