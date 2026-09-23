<?php

/*
|--------------------------------------------------------------------------
| API ROUTES
|--------------------------------------------------------------------------
| One Laravel app, one database. Each file under routes/services/ groups the
| routes for one domain; this file just mounts all of them.
|---------------------------------------------------------------------------
*/

require __DIR__.'/services/auth.php';
require __DIR__.'/services/identity.php';
require __DIR__.'/services/audit.php';
require __DIR__.'/services/attendance.php';
require __DIR__.'/services/scheduling.php';
require __DIR__.'/services/timeoff.php';
require __DIR__.'/services/payroll.php';
require __DIR__.'/services/communications.php';
require __DIR__.'/services/configuration.php';
require __DIR__.'/services/intelligence.php';
