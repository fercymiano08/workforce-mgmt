<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

/**
 * A company holiday: nobody is scheduled on it (automated shift scheduling), leave is not counted
 * for it, and hours actually worked on it are paid at a premium - 200% on a 'regular' holiday,
 * 130% on a 'special_non_working' one (DOLE's holiday-pay rule), applied by ShiftHours::count().
 * 'special_working' is the third DOLE category (a day proclaimed "special" but paid exactly like
 * an ordinary one - 100% worked, no pay if absent, no premium either way) - it exists so these
 * days can still be marked and seen on the calendar without ShiftHours treating them as a holiday
 * for pay purposes at all.
 */
class Holiday extends Model
{
    use ApiSerializable;

    protected $fillable = ['date', 'name', 'type'];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d'];
    }

    public const MULTIPLIERS = [
        'regular' => 2.0,
        'special_non_working' => 1.3,
        'special_working' => 1.0,
    ];

    public function multiplier(): float
    {
        // An unrecognized type defaults to the SAFE (no premium) rate, not the most expensive one -
        // a typo in `type` must never silently double someone's pay.
        return self::MULTIPLIERS[$this->type] ?? 1.0;
    }

    public function toApiArray(): array
    {
        return $this->camelizeKeys($this->attributesToArray()) + ['multiplier' => $this->multiplier()];
    }
}
