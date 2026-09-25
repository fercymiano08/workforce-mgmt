<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\AttendanceAdjustment;
use App\Models\Employee;
use App\Models\OvertimeRequest;
use App\Models\ShiftSchedule;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * The rules behind a Correction (Time & Attendance > Corrections).
 *
 * Three kinds, in the employee's words:
 *   worked_past_shift  "I worked past my shift"        the clock-out failed, or was never counted, after the shift end
 *   kiosk_clock_in     "The kiosk did not clock me in"
 *   kiosk_clock_out    "The kiosk did not clock me out"
 *
 * The employee states WHAT HAPPENED (a time, a reason and a photo as proof), never how many hours they are owed.
 * Every number is derived from their scheduled shift, and only the Workforce Admin can turn a claim into a change - by
 * entering the final time by hand when approving. A claim can recover time, not invent it:
 *   - before the shift started        -> refused (that time was never scheduled)
 *   - in the future                   -> refused
 *   - more than the cap past the end  -> refused (one request cannot swallow a whole evening)
 *   - older than the window           -> refused (claims cannot be hoarded and filed later as a bundle)
 *   - a clock-out claimed past the end of the shift -> is "worked past my shift", not a kiosk failure
 */
class AttendanceAdjustmentService
{
    /** How far back a correction may be claimed at all. */
    public const BACKDATE_DAYS = 7;

    /** The most one claim may add past the end of the shift, in hours. */
    public const MAX_CLAIM_HOURS = 4;

    /** Repeat claims inside this window are shown to the admin. */
    public const PATTERN_WINDOW_DAYS = 30;

    /** More than this many recent claims is flagged as a pattern. */
    public const PATTERN_FLAG_COUNT = 3;

    /**
     * The scheduled shift for one employee on one date.
     *
     * @return array{start: string, end: string}|null
     */
    public static function shiftFor(string $employeeId, string $dateKey): ?array
    {
        $schedule = ShiftSchedule::with('shift')
            ->where('employee_id', $employeeId)
            ->whereDate('date', $dateKey)
            ->where('status', 'Scheduled')
            ->first();

        if (! $schedule?->shift?->start_time || ! $schedule?->shift?->end_time) {
            return null;
        }

        return [
            'start' => substr((string) $schedule->shift->start_time, 0, 5),
            'end' => substr((string) $schedule->shift->end_time, 0, 5),
        ];
    }

    /**
     * What a claim is worth, or why it is refused.
     *
     * `hours` is what the day is worth once the correction lands (paid hours, lunch taken off); `overtime` is only the
     * part past the end of the shift.
     *
     * @return array{hours: float, overtime: float, shift: array{start: string, end: string}}|array{error: string}
     */
    public static function derive(string $type, string $dateKey, ?string $claimedTime, ?array $shift, ?Attendance $attendance): array
    {
        if ($shift === null) {
            return ['error' => 'You were not scheduled to work on that date, so there are no hours to correct.'];
        }

        if (! $claimedTime || ! preg_match('/^\d{2}:\d{2}$/', $claimedTime)) {
            return ['error' => 'Please give the time that actually happened.'];
        }

        $timezone = ShiftHours::timezone();
        $shiftStart = ShiftHours::baseStart($dateKey, $shift['start'], $timezone);
        $shiftEnd = ShiftHours::baseEnd($dateKey, $shift['start'], $shift['end'], $timezone);
        $claimed = Carbon::parse($dateKey.' '.$claimedTime, $timezone);
        // Minutes PAST the end of the shift: positive only when the claim is later than the shift end.
        $afterShift = (int) $shiftEnd->diffInMinutes($claimed, false);

        if ($claimed->gt(Carbon::now($timezone))) {
            return ['error' => 'That time has not happened yet.'];
        }

        if ($type === AttendanceAdjustment::TYPE_WORKED_PAST_SHIFT) {
            if (! $attendance?->clock_in) {
                return ['error' => 'There is no clock-in recorded for that day. File "The kiosk did not clock me in" first, then this one.'];
            }
            if ($afterShift <= 0) {
                return ['error' => 'That time is not past the end of your shift, so it is not extra time.'];
            }
            if ($afterShift > self::MAX_CLAIM_HOURS * 60) {
                return ['error' => 'A single request cannot add more than '.self::MAX_CLAIM_HOURS.' hours past your shift. Please ask HR to review this day directly.'];
            }

            $clockIn = Carbon::parse($dateKey.' '.$attendance->clock_in, $timezone);

            return ['hours' => self::paidHours($clockIn, $claimed), 'overtime' => round($afterShift / 60, 2), 'shift' => $shift];
        }

        if ($type === AttendanceAdjustment::TYPE_KIOSK_CLOCK_IN) {
            // Arriving before the shift was never scheduled time: this is the "I was here at 6am for a 9am shift" case.
            if ($claimed->lt($shiftStart->copy()->subMinutes(ShiftHours::EARLY_ARRIVAL_MINUTES))) {
                return ['error' => 'That is before your shift even starts, so it cannot be recorded as time worked.'];
            }
            if ($claimed->gte($shiftEnd)) {
                return ['error' => 'That is after your shift ended. A clock-in has to be during your shift.'];
            }
            if ($attendance?->clock_in) {
                return ['error' => 'A clock-in was already recorded for that day.'];
            }

            // A missing clock-in is worth the rest of a normal day from the time given, minus the unpaid lunch.
            return ['hours' => self::paidHours($claimed, $shiftEnd), 'overtime' => 0.0, 'shift' => $shift];
        }

        if ($type === AttendanceAdjustment::TYPE_KIOSK_CLOCK_OUT) {
            if (! $attendance?->clock_in) {
                return ['error' => 'There is no clock-in recorded for that day. File "The kiosk did not clock me in" first, then this one.'];
            }
            if ($attendance->actual_clock_out || $attendance->clock_out) {
                return ['error' => 'A clock-out was already recorded for that day.'];
            }

            $clockIn = Carbon::parse($dateKey.' '.$attendance->clock_in, $timezone);
            if ($claimed->lte($clockIn)) {
                return ['error' => 'A clock-out has to be later than the clock-in.'];
            }
            if ($afterShift > 0) {
                return ['error' => 'That is past the end of your shift. Choose "I worked past my shift" instead.'];
            }

            return ['hours' => self::paidHours($clockIn, $claimed), 'overtime' => 0.0, 'shift' => $shift];
        }

        return ['error' => 'That kind of correction is not recognised.'];
    }

    /** Paid hours between two moments: the elapsed time minus the unpaid lunch the break policy takes off. */
    private static function paidHours(Carbon $from, Carbon $to): float
    {
        $elapsed = max(0, (int) $from->diffInMinutes($to, false));
        $lunch = (int) min(app(BreakPolicy::class)->deductionFor($elapsed), $elapsed);

        return round(max(0, $elapsed - $lunch) / 60, 2);
    }

    /**
     * What the admin's entry would do to the day, for the review screen: the same derivation with the time the admin
     * typed, plus the day as it stands now.
     *
     * @return array{hours: float, overtime: float, shift: array{start: string, end: string}}|array{error: string}
     */
    public static function preview(AttendanceAdjustment $adjustment, ?string $time = null): array
    {
        $dateKey = $adjustment->date->toDateString();
        $attendance = Attendance::where('employee_id', $adjustment->employee_id)->whereDate('date', $dateKey)->first();
        $shift = $adjustment->shift_start && $adjustment->shift_end
            ? ['start' => substr($adjustment->shift_start, 0, 5), 'end' => substr($adjustment->shift_end, 0, 5)]
            : self::shiftFor($adjustment->employee_id, $dateKey);

        return self::derive($adjustment->type, $dateKey, $time ? substr($time, 0, 5) : substr((string) $adjustment->claimed_time, 0, 5), $shift, $attendance);
    }

    /** The window rule: corrections are for recent days, not for rebuilding last month. */
    public static function assertWithinWindow(string $dateKey): ?string
    {
        // Both sides are pinned to the same zone: a date-only value parsed in the app's zone and compared with one
        // parsed in Manila is off by hours, enough to say someone's own shift day "has not happened yet".
        $today = Carbon::now(ShiftHours::timezone())->startOfDay();
        $date = Carbon::parse($dateKey, ShiftHours::timezone())->startOfDay();
        $age = (int) $date->diffInDays($today, false);

        if ($age < 0) {
            return 'That date has not happened yet.';
        }

        return $age > self::BACKDATE_DAYS
            ? 'Corrections can only be made within '.self::BACKDATE_DAYS.' days. Please ask HR to review older records directly.'
            : null;
    }

    /** How many requests this person has made recently - shown to the admin, never used to block anyone. */
    public static function recentClaimCount(string $employeeId): int
    {
        return (int) AttendanceAdjustment::where('employee_id', $employeeId)
            ->where('created_at', '>=', now()->subDays(self::PATTERN_WINDOW_DAYS))
            ->count();
    }

    public static function isPattern(AttendanceAdjustment $adjustment): bool
    {
        return self::recentClaimCount($adjustment->employee_id) > self::PATTERN_FLAG_COUNT;
    }

    /**
     * Applies an approved correction to the real record - the manual entry - then re-runs the normal hour arithmetic.
     * The time used is the one the admin entered (`final_time`), else the one the employee claimed.
     *
     * @return array{attendanceId: ?string, hours: float}
     */
    public static function apply(AttendanceAdjustment $adjustment): array
    {
        $timezone = ShiftHours::timezone();
        $dateKey = $adjustment->date->toDateString();
        $employee = Employee::find($adjustment->employee_id);
        $name = $adjustment->employee_name ?: trim(($employee?->first_name ?? '').' '.($employee?->last_name ?? ''));
        $time = self::asClockTime($adjustment->final_time ?: $adjustment->claimed_time);

        $attendance = Attendance::where('employee_id', $adjustment->employee_id)->whereDate('date', $dateKey)->first();

        if ($adjustment->type === AttendanceAdjustment::TYPE_KIOSK_CLOCK_IN) {
            $attendance = $attendance ?: self::newRecord($adjustment, $dateKey);
            $attendance->clock_in = $time;
            // Present or Late by the very rule the kiosk uses, from the time entered - not whatever the row said before
            // (an automatic "Absent" for a day nobody could clock in is exactly what this corrects).
            $grace = max(0, (int) app(SystemSettings::class)->get('late_grace_minutes', 15));
            $start = ShiftHours::baseStart($dateKey, (string) $adjustment->shift_start, $timezone);
            $attendance->status = Carbon::parse($dateKey.' '.$time, $timezone)->gt($start->copy()->addMinutes($grace)) ? 'Late' : 'Present';

            // A day that is already over has no one left to clock out: it ends at the scheduled end. A day still in
            // progress stays open, so the person can still clock out normally.
            $end = ShiftHours::baseEnd($dateKey, (string) $adjustment->shift_start, (string) $adjustment->shift_end, $timezone);
            if (! $attendance->clock_out && Carbon::now($timezone)->gte($end)) {
                $attendance->clock_out = self::asClockTime($adjustment->shift_end);
                $attendance->actual_clock_out = self::asClockTime($adjustment->shift_end);
            }

            return self::finish(self::recount($attendance, $adjustment, $timezone, $dateKey), $adjustment, $dateKey);
        }

        if (! $attendance?->clock_in) {
            return ['attendanceId' => $attendance?->id, 'hours' => 0.0];   // nothing to correct: derive() refuses these first
        }

        if ($adjustment->type === AttendanceAdjustment::TYPE_WORKED_PAST_SHIFT) {
            // The extra time only counts as overtime that was approved, so approving this IS that approval - but only
            // for the hours not already approved for the day, or the day would be paid twice.
            $end = ShiftHours::baseEnd($dateKey, (string) $adjustment->shift_start, (string) $adjustment->shift_end, $timezone);
            $past = round(max(0, (int) $end->diffInMinutes(Carbon::parse($dateKey.' '.$time, $timezone), false)) / 60, 2);
            self::topUpOvertime($adjustment, $dateKey, $name, $past);
        }

        // Worked past the shift and kiosk clock-out fail both end with the same manual entry: the clock-out time.
        $attendance->actual_clock_out = $time;
        $attendance->clock_out = $time;

        return self::finish(self::recount($attendance, $adjustment, $timezone, $dateKey), $adjustment, $dateKey);
    }

    /**
     * Overtime goes in as an approved OvertimeRequest rather than being added to the attendance row directly:
     * ShiftHours::effectiveEnd already reads those, so payroll, the timesheet and the kiosk all pick the change up
     * through the one path they already understand. Only the hours NOT already approved for that day are added.
     */
    private static function topUpOvertime(AttendanceAdjustment $adjustment, string $dateKey, string $name, float $neededHours): void
    {
        $alreadyApproved = (float) OvertimeRequest::where('employee_id', $adjustment->employee_id)
            ->where('date', $dateKey)->where('status', 'Approved')->get()
            ->sum(fn (OvertimeRequest $r) => (float) ($r->approved_hours ?? $r->expected_hours ?? 0));
        $extra = round($neededHours - $alreadyApproved, 2);
        if ($extra <= 0) {
            return;
        }

        OvertimeRequest::create([
            'id' => self::nextId('overtime_requests', 'OTR'),
            'employee_id' => $adjustment->employee_id,
            'employee_name' => $name,
            'date' => $dateKey,
            'expected_hours' => $extra,
            'approved_hours' => $extra,
            'approved_at' => now(),
            'approved_by' => $adjustment->decided_by,
            'reason' => 'Correction '.$adjustment->id.': '.$adjustment->reason,
            'status' => 'Approved',
            'requested_date' => $adjustment->requested_date->toDateString(),
            'comments' => 'Recorded from a correction the Workforce Admin approved, not a request made in advance.',
        ]);
    }

    /** The timesheet for that week follows the corrected day straight away. */
    private static function finish(array $result, AttendanceAdjustment $adjustment, string $dateKey): array
    {
        try {
            app(TimesheetGenerationService::class)->syncForEmployee($adjustment->employee_id, $dateKey);
        } catch (\Throwable) {
            // the every-minute timesheet refresh will pick the change up anyway
        }

        return $result;
    }

    /** "17:30" -> "17:30:00": the punch columns are times, and a half-written one reads as null later. */
    private static function asClockTime(?string $time): ?string
    {
        if (! $time) {
            return null;
        }

        $time = substr($time, 0, 5);

        return preg_match('/^\d{2}:\d{2}$/', $time) ? $time.':00' : null;
    }

    private static function newRecord(AttendanceAdjustment $adjustment, string $dateKey): Attendance
    {
        $record = new Attendance;
        $record->id = self::nextId('attendance', 'ATT');
        $record->employee_id = $adjustment->employee_id;
        $record->date = $dateKey;
        $record->status = 'Present';
        $record->location = 'Manual entry';
        $record->save();

        return $record;
    }

    /** ATT -> ATT001, OTR -> OTR001. Only digit suffixes count, so ATT and ATTIC never collide. */
    private static function nextId(string $table, string $prefix): string
    {
        $max = 0;
        foreach (DB::table($table)->where('id', 'like', $prefix.'%')->pluck('id') as $id) {
            $suffix = substr((string) $id, strlen($prefix));
            if (ctype_digit($suffix) && (int) $suffix > $max) {
                $max = (int) $suffix;
            }
        }

        return $prefix.str_pad((string) ($max + 1), 3, '0', STR_PAD_LEFT);
    }

    /**
     * Re-runs the normal hour arithmetic for a day, so a correction is counted by the same rules as a live punch -
     * break policy, shift end, approved overtime - instead of by its own arithmetic.
     *
     * @return array{attendanceId: ?string, hours: float}
     */
    private static function recount(Attendance $attendance, AttendanceAdjustment $adjustment, string $timezone, string $dateKey): array
    {
        $note = 'Manually entered via '.$adjustment->id.($adjustment->decided_by ? ' by '.$adjustment->decided_by : '').'.';
        $attendance->notes = trim(($attendance->notes ? $attendance->notes.' ' : '').$note);

        $actualOut = $attendance->actual_clock_out ?: $attendance->clock_out;
        if (! $attendance->clock_in || ! $actualOut) {
            $attendance->regular_hours = 0;
            $attendance->overtime = 0;
            $attendance->total_hours = 0;
            $attendance->save();

            return ['attendanceId' => $attendance->id, 'hours' => 0.0];
        }

        $shift = ['start' => $adjustment->shift_start, 'end' => $adjustment->shift_end];
        $clockIn = Carbon::parse($dateKey.' '.$attendance->clock_in, $timezone);
        $out = Carbon::parse($dateKey.' '.$actualOut, $timezone);
        $baseStart = ShiftHours::baseStart($dateKey, $shift['start'], $timezone);
        $baseEnd = ShiftHours::baseEnd($dateKey, $shift['start'], $shift['end'], $timezone);
        $effectiveEnd = ShiftHours::effectiveEnd($adjustment->employee_id, $dateKey, $shift['start'], $shift['end'], $timezone);

        $counts = ShiftHours::count($clockIn, $out, $baseEnd, $effectiveEnd, null, $baseStart);

        $attendance->clock_out = $counts['countedOut']->format('H:i:s');
        $attendance->regular_hours = $counts['regular'];
        $attendance->overtime = $counts['overtime'];
        $attendance->total_hours = $counts['total'];
        $attendance->break_hours = $counts['break'];
        $attendance->save();

        return ['attendanceId' => $attendance->id, 'hours' => (float) $counts['total']];
    }
}
