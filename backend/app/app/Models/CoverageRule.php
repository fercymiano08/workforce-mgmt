<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

/** The fewest people a department needs scheduled on a working day. */
class CoverageRule extends Model
{
    use ApiSerializable;

    protected $fillable = ['department', 'min_staff'];

    protected function casts(): array
    {
        return ['min_staff' => 'integer'];
    }
}
