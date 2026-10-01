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
            'scheme' => env('MAIL_SCHEME', 'tls'),
            'host' => env('MAIL_HOST', 'smtp-relay.brevo.com'),
            'port' => (int) env('MAIL_PORT', 587),
            'username' => env('MAIL_USERNAME'),
            'password' => env('MAIL_PASSWORD'),
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
         | The From address decides whether a message reaches a Gmail inbox, not which relay sends
         | it. The relay will happily accept mail claiming to be from any domain at all; Gmail then
         | checks that domain's SPF/DKIM/DMARC records and, finding nothing authorising this server,
         | fails the message straight to spam or rejects it.
         |
         | So the safe default is the address the system actually authenticates as (MAIL_USERNAME).
         | That is guaranteed to be a sender the provider has verified, which is the only address
         | that can be trusted to arrive. Setting MAIL_FROM_ADDRESS to a domain you do not control
         | is what silently breaks delivery.
         */
        'address' => env('MAIL_FROM_ADDRESS') ?: (env('MAIL_USERNAME') ?: 'hello@example.com'),
        'name' => env('MAIL_FROM_NAME') ?: env('APP_NAME', 'Laravel'),
    ],

];
