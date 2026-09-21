<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Safety net for replica freshness. Employees and shift_schedules are kept
// current in real time by explicit pushes from their owning services (see
// EmployeeReplicationClient / ShiftReplicationClient) - this covers
// everything else (leaves, overtime_requests, notifications, settings) with
// a 1-minute worst case instead of "only when someone remembers to run
// snapshot:sync by hand". Started by start-all.ps1 via `schedule:work`.
Schedule::command('snapshot:sync')->everyMinute()->withoutOverlapping();

// A SICK early clock-out without a medical certificate by its deadline becomes unexcused.
Schedule::command('early-outs:expire-certificates')->hourly()->withoutOverlapping();

// Approving (or withdrawing) an overtime request changes which minutes of a past day count. The
// real clock-out is kept, so re-count the recent days a minute after the request data arrives.
Schedule::command('attendance:recount-hours')->everyMinute()->withoutOverlapping();

// Close out each finished day: scheduled, never clocked in, not on approved leave = Absent. Run shortly after
// midnight Manila time (and again at noon as a safety net); it only ever looks at days that are already over.
Schedule::command('attendance:mark-absent')->dailyAt('00:10')->timezone('Asia/Manila')->withoutOverlapping();
Schedule::command('attendance:mark-absent')->dailyAt('12:00')->timezone('Asia/Manila')->withoutOverlapping();
