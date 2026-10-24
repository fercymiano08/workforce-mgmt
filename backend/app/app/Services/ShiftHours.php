<?php

namespace App\Services;

use App\Models\Holiday;
use App\Models\OvertimeRequest;
use App\Models\ScheduleSetting;
use App\Models\Setting;
use Illuminate\Support\Carbon;

/**
 * Which hours of a working day count.
 *
 * A day counts from clock-in to the moment the person left, but never past the END OF THE SHIFT
 * (5:00 PM), extended only by overtime that HR approved for that date. Minutes after that with
 * no approval are simply not counted. The real punch time is kept separately (`actual_clock_out`)
 * so an overtime request approved afterwards can bring those minutes back. The unpaid lunch is taken off
 * by duration (BreakPolicy).
 */
class ShiftHours
{
    public static function timezone(): string
    {
        $kiosk = Setting::query()->first()?->kiosk ?? [];

        return ($kiosk['timezone'] ?? null) ?: 'Asia/Manila';
    }

    /** The real end of the shift: the scheduled end, plus approved overtime hours for that date. */
    public static function effectiveEnd(string $employeeId, string $dateKey, ?string $startTime, ?string $endTime, string $timezone): ?Carbon
    {
        if (! $startTime || ! $endTime) {
            return null;
        }

        $shiftEnds = self::baseEnd($dateKey, $startTime, $endTime, $timezone);

        $approvedOtHours = OvertimeRequest::where('employee_id', $employeeId)
            ->where('date', $dateKey)
            ->where('status', 'Approved')
            ->get()
            ->sum(fn (OvertimeRequest $r) => (float) ($r->approved_hours ?? $r->expected_hours ?? 0));

        if ($approvedOtHours > 0) {
            $shiftEnds->addMinutes((int) round($approvedOtHours * 60));
        }

        return $shiftEnds;
    }

    /** How many minutes before the shift starts the kiosk lets a person clock in. Earlier than this is refused. */
    public const EARLY_ARRIVAL_MINUTES = 30;

    /** The scheduled start of the shift. */
    public static function baseStart(string $dateKey, string $startTime, string $timezone): Carbon
    {
        return Carbon::parse($dateKey.' '.$startTime, $timezone);
    }

    /** The scheduled end of the shift, without any overtime. */
    public static function baseEnd(string $dateKey, string $startTime, string $endTime, string $timezone): Carbon
    {
        $start = Carbon::parse($dateKey.' '.$startTime, $timezone);
        $end = Carbon::parse($dateKey.' '.$endTime, $timezone);

        return $end->lte($start) ? $end->addDay() : $end;
    }

    /** How many minutes late a clock-in is allowed to be before it counts as Late / adds to late_minutes. */
    public static function graceMinutes(): int
    {
        return max(0, (int) app(SystemSettings::class)->get('late_grace_minutes', 15));
    }

    /** Whether this date falls outside the company's usual work days - independent of any shift or holiday. */
    public static function isRestDay(Carbon $date): bool
    {
        return ! in_array($date->isoWeekday(), ScheduleSetting::current()->usualDays(), true);
    }

    /**
     * @return array{countedOut: Carbon, uncountedMinutes: int, regular: float, regularHoliday: float, specialHoliday: float, overtime: float, total: float, break: float, holidayType: ?string, lateMinutes: int, undertimeMinutes: int, isRestDay: bool}
     */
    public static function count(Carbon $clockIn, Carbon $actualOut, Carbon $baseEnd, ?Carbon $effectiveEnd, ?int $lunchMinutes = null, ?Carbon $baseStart = null): array
    {
        $rawClockIn = $clockIn->copy();

        // Paid time starts at the shift start, not at the tap-in: arriving early is recorded but is not counted
        // (the same way time after the end only counts when overtime was approved).
        if ($baseStart && $clockIn->lt($baseStart)) {
            $clockIn = $baseStart;
        }

        $countedOut = $actualOut;
        $uncounted = 0;
        if ($effectiveEnd && $actualOut->gt($effectiveEnd)) {
            $countedOut = $effectiveEnd;
            $uncounted = (int) abs($effectiveEnd->diffInMinutes($actualOut));
        }

        $elapsed = max(0, $clockIn->diffInMinutes($countedOut, false));
        // Lunch comes off by duration once enough was worked (see BreakPolicy). A re-count passes the minutes
        // that were deducted originally, so a later change of the policy never rewrites past days.
        $lunch = $lunchMinutes ?? app(BreakPolicy::class)->deductionFor((int) $elapsed);
        $lunch = (int) min($lunch, $elapsed);

        $total = max(0, $elapsed - $lunch) / 60;
        $overtime = max(0, $baseEnd->diffInMinutes($countedOut, false)) / 60;
        $regular = round(max(0, $total - $overtime), 2);

        // A day worked on a holiday moves its regular hours into one holiday bucket instead of the
        // other, so the same hour is never paid as both plain regular and holiday premium. Overtime
        // keeps its own separate treatment either way - the two premiums are not stacked here. A
        // 'special_working' day is deliberately left alone: DOLE pays it exactly like an ordinary
        // day (100% worked, no premium), so reclassifying it would just move hours into a bucket
        // worth the same as the one they started in - holidayType below still reports it, the hours
        // themselves do not move.
        $holiday = Holiday::query()->where('date', $clockIn->toDateString())->first();
        $regularHoliday = 0.0;
        $specialHoliday = 0.0;
        if ($holiday && $holiday->type !== 'special_working') {
            if ($holiday->type === 'special_non_working') {
                $specialHoliday = $regular;
            } else {
                $regularHoliday = $regular;
            }
            $regular = 0.0;
        }

        // Lateness is measured from the REAL tap-in, before it gets clamped to the shift start above -
        // otherwise a late arrival would always read as zero minutes late (it's the clamping that makes
        // the lost time not count towards pay; it must still count as lateness).
        $lateMinutes = $baseStart
            ? max(0, (int) round($baseStart->diffInMinutes($rawClockIn, false)) - self::graceMinutes())
            : 0;
        $undertimeMinutes = max(0, (int) round($actualOut->diffInMinutes($baseEnd, false)));

        return [
            'countedOut' => $countedOut,
            'uncountedMinutes' => $uncounted,
            'regular' => $regular,
            'regularHoliday' => round($regularHoliday, 2),
            'specialHoliday' => round($specialHoliday, 2),
            'overtime' => round($overtime, 2),
            'total' => round($total, 2),
            'break' => round($lunch / 60, 2),
            'holidayType' => $holiday?->type,
            'lateMinutes' => $lateMinutes,
            'undertimeMinutes' => $undertimeMinutes,
            'isRestDay' => self::isRestDay($rawClockIn),
        ];
    }
}
