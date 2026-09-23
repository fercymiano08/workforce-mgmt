<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class ScheduleBatchItem extends Model
{
    public $timestamps = false;

    protected $fillable = ['batch_id', 'schedule_id'];
}
