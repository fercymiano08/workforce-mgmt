<?php

namespace App\Services;

use App\Models\OvertimeRequest;
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

    /** The scheduled end of the shift, without any overtime. */
    public static function baseEnd(string $dateKey, string $startTime, string $endTime, string $timezone): Carbon
    {
        $start = Carbon::parse($dateKey.' '.$startTime, $timezone);
        $end = Carbon::parse($dateKey.' '.$endTime, $timezone);

        return $end->lte($start) ? $end->addDay() : $end;
    }

    /**
     * @return array{countedOut: Carbon, uncountedMinutes: int, regular: float, overtime: float, total: float, break: float}
     */
    public static function count(Carbon $clockIn, Carbon $actualOut, Carbon $baseEnd, ?Carbon $effectiveEnd, ?int $lunchMinutes = null): array
    {
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

        return [
            'countedOut' => $countedOut,
            'uncountedMinutes' => $uncounted,
            'regular' => round(max(0, $total - $overtime), 2),
            'overtime' => round($overtime, 2),
            'total' => round($total, 2),
            'break' => round($lunch / 60, 2),
        ];
    }
}
