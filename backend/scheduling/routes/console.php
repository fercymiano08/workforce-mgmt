<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Safety net for replica freshness. Employees are kept current in real time
// by an explicit push from core (see InternalApiController::syncEmployee) -
// this covers everything else (leaves, notifications) with a 1-minute worst
// case instead of "only when someone remembers to run snapshot:sync by
// hand". Started by start-all.ps1 via `schedule:work`.
Schedule::command('snapshot:sync')->everyMinute()->withoutOverlapping();
