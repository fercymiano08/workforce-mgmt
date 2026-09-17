<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Cross-service integration
    |--------------------------------------------------------------------------
    |   auth_mode        : 'remote' validates every bearer token against the Auth
    |                      service (/api/auth/me) over HTTP. 'local' is the
    |                      test-only mode that trusts the guard user.
    |   notifications    : 'remote' pushes to the Communications service over
    |                      HTTP; 'local' (tests) writes this service's replica.
    |   timeoff/attendance/configuration : owner services the AI actions write
    |                      to over HTTP; 'local' (tests) writes this service's
    |                      replica tables.
    |   dependencies     : owners this service pulls a snapshot from.
    |---------------------------------------------------------------------------
    */

    'auth_mode' => env('SVC_AUTH_MODE', 'remote'),
    'notifications_mode' => env('SVC_NOTIFICATIONS_MODE', 'remote'),
    'payroll_mode' => env('SVC_PAYROLL_MODE', 'remote'),
    'timeoff_mode' => env('SVC_TIMEOFF_MODE', 'remote'),
    'attendance_mode' => env('SVC_ATTENDANCE_MODE', 'remote'),
    'configuration_mode' => env('SVC_CONFIGURATION_MODE', 'remote'),

    'auth' => [
        'url' => env('AUTH_SERVICE_URL', 'http://127.0.0.1:8000'),
    ],

    'communications' => [
        'url' => env('COMMS_SERVICE_URL', 'http://127.0.0.1:8007'),
    ],

    'timeoff' => [
        'url' => env('TIMEOFF_SERVICE_URL', 'http://127.0.0.1:8005'),
    ],

    'attendance' => [
        'url' => env('ATTENDANCE_SERVICE_URL', 'http://127.0.0.1:8003'),
    ],

    'configuration' => [
        'url' => env('CONFIG_SERVICE_URL', 'http://127.0.0.1:8008'),
    ],

    'token' => env('SERVICE_TOKEN'),

    'dependencies' => json_decode((string) env('SVC_DEPENDENCIES', '[]'), true),

];