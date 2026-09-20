<?php

namespace App\Support;

use App\Models\Setting;
use Illuminate\Support\Carbon;

/**
 * "Now" and "today" on the company's wall clock (the kiosk's timezone, default
 * Asia/Manila).
 *
 * Every service runs in UTC, but shift times, attendance dates and the kiosk are all
 * wall-clock Manila time. Comparing a Manila shift start ("08:00") with a UTC "now"
 * made no-show alerts fire eight hours late. Anything that reasons about the working
 * day must use this instead of the framework's UTC now()/today().
 */
class LocalTime
{
    public static function timezone(): string
    {
        $kiosk = Setting::query()->first()?->kiosk;

        return (is_array($kiosk) && ! empty($kiosk['timezone'])) ? $kiosk['timezone'] : 'Asia/Manila';
    }

    public static function now(): Carbon
    {
        return Carbon::now(self::timezone());
    }

    /** Midnight at the start of the current local day. */
    public static function today(): Carbon
    {
        return self::now()->startOfDay();
    }
}