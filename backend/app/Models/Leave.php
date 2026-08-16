<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

class Leave extends Model
{
    use ApiSerializable;

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'employee_id', 'employee_name', 'leave_type', 'start_date', 'end_date',
        'reason', 'status', 'applied_date', 'approved_by', 'comments', 'documents',
    ];

    protected function casts(): array
    {
        return [
            'start_date' => 'date:Y-m-d',
            'end_date' => 'date:Y-m-d',
            'applied_date' => 'date:Y-m-d',
            'documents' => 'array',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id');
    }
}
