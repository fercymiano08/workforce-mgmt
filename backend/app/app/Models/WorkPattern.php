<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

/** Which weekdays (ISO 1 = Monday ... 7 = Sunday) a department or an employee works. */
class WorkPattern extends Model
{
    use ApiSerializable;

    protected $fillable = ['scope', 'scope_key', 'work_days'];

    protected function casts(): array
    {
        return ['work_days' => 'array'];
    }
}
