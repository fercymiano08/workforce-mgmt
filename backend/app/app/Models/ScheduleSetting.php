<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

/** The single row of automatic-scheduling settings (id 1). */
class ScheduleSetting extends Model
{
    use ApiSerializable;

    public $incrementing = false;

    protected $fillable = ['id', 'auto_enabled', 'run_day', 'run_hour', 'weeks_ahead', 'default_work_days', 'shift_id'];

    protected function casts(): array
    {
        return ['auto_enabled' => 'boolean', 'run_day' => 'integer', 'run_hour' => 'integer', 'weeks_ahead' => 'integer', 'default_work_days' => 'array'];
    }

    public static function current(): self
    {
        return static::firstOrCreate(['id' => 1], ['auto_enabled' => false, 'run_day' => 5, 'run_hour' => 17, 'weeks_ahead' => 1, 'default_work_days' => [1, 2, 3, 4, 5]]);
    }

    /** @return list<int> */
    public function usualDays(): array
    {
        $days = $this->default_work_days;

        return is_array($days) && $days !== [] ? array_values(array_map('intval', $days)) : [1, 2, 3, 4, 5];
    }
}
