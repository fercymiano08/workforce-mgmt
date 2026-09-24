<?php

use Illuminate\Support\Facades\Schedule;

// A SICK early clock-out without a medical certificate by its deadline becomes unexcused.
Schedule::command('early-outs:expire-certificates')->hourly()->withoutOverlapping();

// Approving (or withdrawing) an overtime request changes which minutes of a past day count. The
// real clock-out is kept, so re-count the recent days a minute after the request data changes.
Schedule::command('attendance:recount-hours')->everyMinute()->withoutOverlapping();

// Close out each finished day: scheduled, never clocked in, not on approved leave = Absent. Run shortly after
// midnight Manila time (and again at noon as a safety net); it only ever looks at days that are already over.
Schedule::command('attendance:mark-absent')->dailyAt('00:10')->timezone('Asia/Manila')->withoutOverlapping();
Schedule::command('attendance:mark-absent')->dailyAt('12:00')->timezone('Asia/Manila')->withoutOverlapping();

// Automatic scheduling: checks every hour, and does its work once per week at the day and hour HR chose
// (only when switched on). See AutoGenerateSchedules.
Schedule::command('schedules:auto-generate')->hourly()->withoutOverlapping();

// Timesheet workflow: submit unsubmitted finished weeks at the deadline (Monday 12:00 Manila time) and
// send the one-time reminders. Both are safe to run repeatedly.
Schedule::command('timesheets:auto-submit')->hourly()->withoutOverlapping();
Schedule::command('timesheets:remind')->hourly()->withoutOverlapping();

// Attendance alerts for the admins (possible no-show, incomplete record, unauthorized overtime, staffing shortage):
// checked every minute so each appears about a minute after it happens, not only when someone opens the dashboard.
Schedule::command('attendance:check-alerts')->everyMinute()->withoutOverlapping();

// Rebuild recent timesheets right after a punch or overtime approval changes the figures behind them.
Schedule::command('timesheets:refresh')->everyMinute()->withoutOverlapping();
