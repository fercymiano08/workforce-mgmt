<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

/** A company holiday: nobody is scheduled on it (automated shift scheduling) and leave is not counted for it. */
class Holiday extends Model
{
    use ApiSerializable;

    protected $fillable = ['date', 'name'];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d'];
    }
}
