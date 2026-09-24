<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

/**
 * The single row of scheduling settings (id 1): the company's usual work days (ISO weekdays, 1 = Monday ... 7 = Sunday;
 * leave counting and the automated shift generator both start from them) and the most paid hours one employee
 * may be given in a week by the generator.
 */
class ScheduleSetting extends Model
{
    use ApiSerializable;

    public $incrementing = false;

    protected $fillable = ['id', 'default_work_days', 'max_weekly_hours'];

    protected function casts(): array
    {
        return ['default_work_days' => 'array', 'max_weekly_hours' => 'integer'];
    }

    public static function current(): self
    {
        return static::firstOrCreate(['id' => 1], ['default_work_days' => [1, 2, 3, 4, 5, 6], 'max_weekly_hours' => 48]);
    }

    /** @return list<int> */
    public function usualDays(): array
    {
        $days = $this->default_work_days;

        return is_array($days) && $days !== [] ? array_values(array_map('intval', $days)) : [1, 2, 3, 4, 5];
    }

    public function weeklyHoursLimit(): int
    {
        return max(1, (int) ($this->max_weekly_hours ?: 48));
    }
}
