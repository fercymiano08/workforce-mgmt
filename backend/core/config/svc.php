<?php

return [

    // The shared machine-to-machine secret every service presents in the
    // X-Service-Token header when calling another service's /internal/*
    // endpoints.
    'token' => env('SERVICE_TOKEN', ''),

    // This service's own reachable URL (identity & auth).
    'url' => env('SERVICE_URL', env('APP_URL', 'http://127.0.0.1:8000')),

    // Authentication proxy mode. The core OWNS users + tokens, so it always
    // resolves the caller from the local Sanctum guard ("local").
    'auth' => [
        'url' => env('AUTH_SERVICE_URL', 'http://127.0.0.1:8000'),
        'mode' => env('SVC_AUTH_MODE', 'local'),
    ],
];