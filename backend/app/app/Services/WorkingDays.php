<?php

namespace App\Services;

use App\Models\Holiday;
use App\Models\ScheduleSetting;
use Illuminate\Support\Carbon;

/**
 * How many WORKING days a date range contains for one person: the company's usual work days (Settings),
 * minus company holidays. The time-off
 * service asks this when someone requests leave, so a Friday-to-Monday leave costs 2 days of balance, not 4
 * (nobody is charged for a weekend, a holiday or a day off).
 */
class WorkingDays
{
    /**
     * @return array{days: int, calendarDays: int, holidays: array<string, string>, offDays: int}
     */
    public function count(string $employeeId, string $startDate, string $endDate): array
    {
        $start = Carbon::parse($startDate)->startOfDay();
        $end = Carbon::parse($endDate)->startOfDay();

        $workDays = ScheduleSetting::current()->usualDays();

        $holidays = Holiday::whereBetween('date', [$start->toDateString(), $end->toDateString()])->get()
            ->mapWithKeys(fn ($h) => [$h->date->toDateString() => $h->name]);

        $days = 0;
        $calendar = 0;
        $off = 0;
        $skippedHolidays = [];
        for ($d = $start->copy(); $d->lte($end); $d->addDay()) {
            $calendar++;
            if (! in_array($d->isoWeekday(), $workDays, true)) {
                $off++;
                continue;
            }
            if ($holidays->has($d->toDateString())) {
                $skippedHolidays[$d->toDateString()] = $holidays[$d->toDateString()];
                continue;
            }
            $days++;
        }

        return ['days' => $days, 'calendarDays' => $calendar, 'holidays' => $skippedHolidays, 'offDays' => $off];
    }
}
