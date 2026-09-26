<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\AttendanceAdjustment;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Whether a correction claim agrees with what the machines already know.
 *
 * The kiosk stamps every punch with the SERVER's clock and only accepts a face-authenticated request
 * (KioskController), so a punch is a record the employee did not make and cannot argue with. A claim
 * is not. These checks put the two side by side, so an admin decides with the evidence on screen
 * instead of a photo of a clock - photos arrive as pasted data URLs with no EXIF, so they cannot
 * show when they were taken and prove nothing about a time.
 *
 * Two outcomes, deliberately kept apart:
 *   fail - the claim is CONTRADICTED by a record the employee cannot change. Refused outright.
 *   warn - corroboration is merely ABSENT. Absence of evidence is not evidence of a lie, so these
 *          are shown to the admin and never block anyone.
 */
class CorrectionCorroboration
{
    /** How far a claimed time may sit from the employee's own punch before it reads as a different time. */
    public const PUNCH_TOLERANCE_MINUTES = 5;

    /** How close another employee's punch has to be to still show the kiosk was in service. */
    public const KIOSK_ALIVE_MINUTES = 15;

    /**
     * @return list<array{state: 'pass'|'warn'|'fail', label: string, detail: string}>
     */
    public static function forClaim(string $type, string $dateKey, ?string $claimedTime, ?Attendance $attendance, string $employeeId): array
    {
        if (! $claimedTime) {
            return [];
        }

        $claimed = Carbon::createFromFormat('Y-m-d H:i', $dateKey.' '.$claimedTime);

        return match ($type) {
            AttendanceAdjustment::TYPE_WORKED_PAST_SHIFT => [self::punchCeiling($attendance, $claimed)],
            AttendanceAdjustment::TYPE_KIOSK_CLOCK_IN => self::faultChecks($claimed, $attendance, $employeeId, 'in'),
            AttendanceAdjustment::TYPE_KIOSK_CLOCK_OUT => self::faultChecks($claimed, $attendance, $employeeId, 'out'),
            default => [],
        };
    }

    /** The only hard rule, and it is the one that matters most. */
    public static function firstFailure(array $checks): ?array
    {
        foreach ($checks as $check) {
            if ($check['state'] === 'fail') {
                return $check;
            }
        }

        return null;
    }

    /**
     * A kiosk clock-out is a face-authenticated, server-timestamped record of when this person walked
     * out, so it is a ceiling on how late their day can be - whatever the timesheet claims. This is
     * what makes "I think I left around 8" settleable: the kiosk already knows.
     *
     * Only `actual_clock_out` is treated as that ceiling. `clock_out` is the COUNTED end of the day
     * and is deliberately capped at the shift end, so using it here would refuse honest claims by
     * comparing a real time against a capped one.
     */
    private static function punchCeiling(?Attendance $attendance, Carbon $claimed): array
    {
        $punch = $attendance?->actual_clock_out;

        if (! $punch) {
            return ['state' => 'warn', 'label' => 'No kiosk clock-out to check against',
                'detail' => 'The kiosk never recorded a clock-out for this day, so the claimed time cannot be compared with the machine.'];
        }

        $punchedAt = Carbon::createFromFormat('Y-m-d H:i', $attendance->date->toDateString().' '.substr((string) $punch, 0, 5));
        $claimedAt = $claimed->format('g:i A');
        $punchedAtLabel = $punchedAt->format('g:i A');

        // Signed by hand: the version of diffInMinutes that returns a sign has changed between Carbon
        // majors, and this number decides whether someone gets refused.
        $lateBy = (int) round(($claimed->getTimestamp() - $punchedAt->getTimestamp()) / 60);

        if ($lateBy > self::PUNCH_TOLERANCE_MINUTES) {
            return ['state' => 'fail', 'label' => 'Later than their own kiosk clock-out',
                'detail' => "The kiosk recorded this employee clocking out at {$punchedAtLabel}. The claimed {$claimedAt} is {$lateBy} minutes after that."];
        }

        if ($lateBy < -self::PUNCH_TOLERANCE_MINUTES) {
            return ['state' => 'pass', 'label' => 'Earlier than their own kiosk clock-out',
                'detail' => "The kiosk recorded a clock-out at {$punchedAtLabel}. The claim is earlier, which only costs this employee their own time."];
        }

        return ['state' => 'pass', 'label' => 'Matches their own kiosk clock-out',
            'detail' => "The kiosk recorded this employee clocking out at {$punchedAtLabel}, which matches the claim."];
    }

    /**
     * The "the kiosk was broken" claims. Nothing was recorded, so there is no punch to compare
     * against - the question becomes whether the rest of the building agrees with the story.
     *
     * A failed identity check is the common honest reason (it is recorded server-side, so a tampered
     * terminal cannot hide it), and when one is on file the kiosk being in service is no contradiction
     * at all - it is the expected result.
     *
     * @return list<array{state: 'pass'|'warn'|'fail', label: string, detail: string}>
     */
    private static function faultChecks(Carbon $claimed, ?Attendance $attendance, string $employeeId, string $side): array
    {
        $arriving = $side === 'in';
        $otherPunch = $arriving ? 'clock_in' : 'clock_out';
        $claimedAt = $claimed->format('g:i A');

        $window = self::KIOSK_ALIVE_MINUTES;
        $from = $claimed->copy()->subMinutes($window)->format('H:i:s');
        $to = $claimed->copy()->addMinutes($window)->format('H:i:s');

        $othersPunching = Attendance::whereDate('date', $attendance?->date ?? $claimed->toDateString())
            ->where('employee_id', '!=', $employeeId)
            ->where(fn ($q) => $q->whereBetween($otherPunch, [$from, $to])->orWhereBetween('actual_clock_out', [$from, $to]))
            ->count();

        $identityFailure = self::identityFailureOn($employeeId, $claimed);

        $checks = [];

        if ($identityFailure) {
            $checks[] = ['state' => 'pass', 'label' => 'The kiosk recorded a failed check for this employee',
                'detail' => "There is a {$identityFailure} logged against this employee on this date, which is what a kiosk that was working but could not identify them looks like."];
        }

        $others = $othersPunching === 1 ? '1 other employee' : "{$othersPunching} other employees";

        if ($othersPunching > 0) {
            $checks[] = ['state' => 'warn', 'label' => 'The kiosk was in service around that time',
                'detail' => $others.' punched '.$otherPunch.' within '.$window.' minutes of '.$claimedAt.', so the kiosk was working when this one was not recorded.'];
        } else {
            $checks[] = ['state' => 'pass', 'label' => 'The kiosk was quiet around that time',
                'detail' => 'No other employee punched within '.$window.' minutes of '.$claimedAt.', which fits a fault at the kiosk.'];
        }

        $onClock = self::onClockAt($claimed, $employeeId);

        if ($onClock === 0 && $othersPunching === 0) {
            $checks[] = ['state' => 'warn', 'label' => 'Nobody else was on the clock',
                'detail' => 'No other employee was clocked in at '.$claimedAt.', so nothing at all corroborates this time.'];
        } elseif ($onClock > 0) {
            $checks[] = ['state' => 'pass', 'label' => 'Others were on the clock at that time',
                'detail' => $onClock === 1 ? '1 other employee was clocked in at '.$claimedAt.'.' : "{$onClock} other employees were clocked in at {$claimedAt}."];
        }

        return $checks;
    }

    /** The honest reason a working kiosk did not record someone: it could not identify them. */
    private static function identityFailureOn(string $employeeId, Carbon $claimed): ?string
    {
        $row = DB::table('security_events')
            ->where('employee_id', $employeeId)
            ->whereIn('type', ['face_mismatch', 'pin_failed'])
            ->whereBetween('created_at', [
                $claimed->copy()->subDay()->startOfDay(),
                $claimed->copy()->endOfDay(),
            ])
            ->latest('created_at')
            ->first(['type', 'created_at']);

        if (! $row) {
            return null;
        }

        return $row->type === 'face_mismatch' ? 'face mismatch' : 'failed PIN attempt';
    }

    private static function onClockAt(Carbon $claimed, string $employeeId): int
    {
        return Attendance::whereDate('date', $claimed->toDateString())
            ->where('employee_id', '!=', $employeeId)
            ->whereNotNull('clock_in')
            ->where('clock_in', '<=', $claimed->format('H:i:s'))
            ->where(fn ($q) => $q->whereNull('clock_out')->orWhere('clock_out', '>=', $claimed->format('H:i:s')))
            ->count();
    }
}
