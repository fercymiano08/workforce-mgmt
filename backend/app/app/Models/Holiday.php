<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

class Holiday extends Model
{
    use ApiSerializable;

    protected $fillable = ['date', 'name'];

    protected function casts(): array
    {
        return ['date' => 'date:Y-m-d'];
    }
}
