<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

/**
 * The single row of automated-scheduling settings (id 1): the automatic switch, the calendar period to keep
 * scheduled (window: week, two_weeks, month or next_month - see ScheduleGenerator::WINDOWS), everyone's usual
 * work days (ISO weekdays, 1 = Monday ... 7 = Sunday), and the shift to schedule.
 */
class ScheduleSetting extends Model
{
    use ApiSerializable;

    public $incrementing = false;

    protected $fillable = ['id', 'auto_enabled', 'window', 'default_work_days', 'shift_id'];

    protected function casts(): array
    {
        return ['auto_enabled' => 'boolean', 'default_work_days' => 'array'];
    }

    public static function current(): self
    {
        return static::firstOrCreate(['id' => 1], ['auto_enabled' => false, 'window' => 'week', 'default_work_days' => [1, 2, 3, 4, 5]]);
    }

    /** @return list<int> */
    public function usualDays(): array
    {
        $days = $this->default_work_days;

        return is_array($days) && $days !== [] ? array_values(array_map('intval', $days)) : [1, 2, 3, 4, 5];
    }
}
