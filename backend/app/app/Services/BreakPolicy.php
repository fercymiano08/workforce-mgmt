<?php

namespace App\Services;

/**
 * The unpaid lunch break, as HR configures it (Settings > Attendance rules).
 *
 * Like most enterprise time systems it is DURATION based, not tied to a clock window: once someone has
 * worked at least `minimumHours`, `lunchMinutes` are deducted from the day - whenever lunch was taken.
 * A shorter day (a sick early leave, a half day) loses nothing. Setting the minutes to 0 turns it off.
 */
class BreakPolicy
{
    public const DEFAULT_LUNCH_MINUTES = 60;

    public const DEFAULT_MINIMUM_HOURS = 5;

    public function __construct(private readonly SystemSettings $settings)
    {
    }

    public function lunchMinutes(): int
    {
        return max(0, min(180, (int) $this->settings->get('lunch_break_minutes', self::DEFAULT_LUNCH_MINUTES)));
    }

    public function minimumHours(): float
    {
        return max(0.0, min(12.0, (float) $this->settings->get('lunch_minimum_hours', self::DEFAULT_MINIMUM_HOURS)));
    }

    /** Minutes to deduct for a day in which `$workedMinutes` were worked. */
    public function deductionFor(int $workedMinutes): int
    {
        return $workedMinutes >= (int) round($this->minimumHours() * 60) ? $this->lunchMinutes() : 0;
    }
}
