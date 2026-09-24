<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

class Holiday extends Model
{
    use ApiSerializable;

    protected $fillable = ['date', 'name'];

    protected static function booted(): void
    {
        // Nobody works a holiday: a day that becomes one is cleared of the shifts already published for it,
        // and a day that stops being one is scheduled again (if its week was already scheduled).
        static::created(fn (Holiday $holiday) => \App\Services\ScheduleCleanup::forHoliday($holiday));
        static::deleted(fn (Holiday $holiday) => app(\App\Services\ScheduleGenerator::class)->refill(
            null, $holiday->date->toDateString(), $holiday->date->toDateString(), $holiday->date->format('M j').' is no longer a holiday'
        ));
    }

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d'];
    }
}
