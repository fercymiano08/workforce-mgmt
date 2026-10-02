<?php

use Illuminate\Support\Facades\Schedule;

// A SICK early clock-out without a medical certificate by its deadline becomes unexcused.
Schedule::command('early-outs:expire-certificates')->hourly()->withoutOverlapping();

// Approving (or withdrawing) an overtime request changes which minutes of a past day count. The
// real clock-out is kept, so re-count the recent days a minute after the request data changes.
Schedule::command('attendance:recount-hours')->everyMinute()->withoutOverlapping();

// Close out each finished day: scheduled, never clocked in, not on approved leave = Absent. Run shortly after
// midnight Manila time (and again at noon as a safety net); it only ever looks at days that are already over.
//
// The demo rebuild goes FIRST, deliberately. The demo employees are shipped with schedules running weeks
// ahead, and nothing else can ever clock them in, so any day that passes without a rebuild is a day the
// marker below would record as Absent for all of them - 20 rows with no clock-in and no clock-out, on a
// dashboard that otherwise says those people worked. Running the rebuild at 00:05 and the marker at 00:10
// means the marker finds a real record for yesterday and has nothing to do. Set REFRESH_DEMO_DAILY=false to
// turn the rebuild off; the marker still runs.
if (filter_var(env('REFRESH_DEMO_DAILY', true), FILTER_VALIDATE_BOOLEAN)) {
    Schedule::command('demo:refresh --spare-today')->dailyAt('00:05')->timezone('Asia/Manila')->withoutOverlapping();
}
Schedule::command('attendance:mark-absent')->dailyAt('00:10')->timezone('Asia/Manila')->withoutOverlapping();
Schedule::command('attendance:mark-absent')->dailyAt('12:00')->timezone('Asia/Manila')->withoutOverlapping();

// Timesheet workflow: submit unsubmitted finished weeks at the deadline (Monday 12:00 Manila time) and
// send the one-time reminders. Both are safe to run repeatedly.
Schedule::command('timesheets:auto-submit')->hourly()->withoutOverlapping();
Schedule::command('timesheets:remind')->hourly()->withoutOverlapping();

// Attendance alerts for the admins (possible no-show, incomplete record, unauthorized overtime, staffing shortage):
// checked every minute so each appears about a minute after it happens, not only when someone opens the dashboard.
Schedule::command('attendance:check-alerts')->everyMinute()->withoutOverlapping();

// The bell is for what needs acting on now, not an archive: without a cleanup the unread badge only ever grew,
// counting every resolved week-ago alert forever. Drop whatever is older than the month window nightly.
Schedule::command('notifications:prune')->dailyAt('02:00')->timezone('Asia/Manila')->withoutOverlapping();

// Rebuild recent timesheets right after a punch or overtime approval changes the figures behind them.
Schedule::command('timesheets:refresh')->everyMinute()->withoutOverlapping();
