<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

/**
 * A company holiday: nobody is scheduled on it (automated shift scheduling), leave is not counted
 * for it, and hours actually worked on it are paid at a premium - 200% on a 'regular' holiday,
 * 130% on a 'special_non_working' one (DOLE's holiday-pay rule), applied by ShiftHours::count().
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
    ];

    public function multiplier(): float
    {
        return self::MULTIPLIERS[$this->type] ?? self::MULTIPLIERS['regular'];
    }

    public function toApiArray(): array
    {
        return $this->camelizeKeys($this->attributesToArray()) + ['multiplier' => $this->multiplier()];
    }
}
