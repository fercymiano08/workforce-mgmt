<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-service integration (shared by every extracted service)
    |--------------------------------------------------------------------------
    |   auth_mode           : 'remote' validates every bearer token against the
    |                         Auth service (/api/auth/me) over HTTP. 'local' is
    |                         the test-only mode that trusts the user already
    |                         set by Laravel's auth guard (no network).
    |   notifications_mode  : 'remote' pushes notifications to the Communications
    |                         service over HTTP. 'local' (tests) writes to this
    |                         service's local notifications replica table.
    |   dependencies        : JSON list of owner services this service pulls a
    |                         snapshot from before serving requests. Each entry:
    |                         { "url": "...", "tables": ["employees", ...] }
    |---------------------------------------------------------------------------
    */

    'auth_mode' => env('SVC_AUTH_MODE', 'remote'),
    'notifications_mode' => env('SVC_NOTIFICATIONS_MODE', 'remote'),
    'payroll_mode' => env('SVC_PAYROLL_MODE', 'remote'),
    'configuration_mode' => env('SVC_CONFIGURATION_MODE', 'remote'),
    'audit_mode' => env('SVC_AUDIT_MODE', 'remote'),
    'scheduling_mode' => env('SVC_SCHEDULING_MODE', 'remote'),

    'auth' => [
        'url' => env('AUTH_SERVICE_URL', 'http://127.0.0.1:8000'),
    ],

    'communications' => [
        'url' => env('COMMS_SERVICE_URL', 'http://127.0.0.1:8007'),
    ],

    'payroll' => [
        'url' => env('PAYROLL_SERVICE_URL', 'http://127.0.0.1:8006'),
    ],

    'scheduling' => [
        'url' => env('SCHEDULING_SERVICE_URL', 'http://127.0.0.1:8004'),
    ],

    'configuration' => [
        'url' => env('CONFIG_SERVICE_URL', 'http://127.0.0.1:8008'),
    ],

    'token' => env('SERVICE_TOKEN'),

    'dependencies' => json_decode((string) env('SVC_DEPENDENCIES', '[]'), true),

];