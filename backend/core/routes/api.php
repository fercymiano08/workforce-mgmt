<?php

/*
|--------------------------------------------------------------------------
| CORE SERVICE - API GATEWAY
|--------------------------------------------------------------------------
| The core owns AUTH (users, tokens, sessions) and IDENTITY (employees,
| departments, roles, profiles, face enrollment). It is also the system's
| entry point for the React frontend: every other service lives behind its
| own process, and the frontend proxies /api/* per service in vite.config.js.
|
| Peer services authenticate the caller by asking the core at
| GET /api/auth/me; they pull identity/org data from GET /api/internal/snapshot.
|---------------------------------------------------------------------------
*/

require __DIR__.'/services/auth.php';
require __DIR__.'/services/identity.php';
require __DIR__.'/services/audit.php';

// Machine-to-machine endpoints for peer services (SERVICE_TOKEN guarded).
require __DIR__.'/internal.php';