<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

/** One run of the schedule generator (by an admin, or by the automatic job). */
class ScheduleBatch extends Model
{
    use ApiSerializable;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'source', 'created_by', 'start_date', 'end_date', 'shift_id', 'created_count', 'summary',
        'status', 'undone_at', 'undone_by',
    ];

    protected function casts(): array
    {
        return ['start_date' => 'date:Y-m-d', 'end_date' => 'date:Y-m-d', 'summary' => 'array', 'undone_at' => 'datetime', 'created_count' => 'integer'];
    }
}
