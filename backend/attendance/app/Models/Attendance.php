<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

class Attendance extends Model
{
    use ApiSerializable;

    protected $table = 'attendance';

    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'employee_id', 'date', 'clock_in', 'clock_out', 'status', 'overtime',
        'regular_hours', 'total_hours', 'break_hours', 'location', 'notes',
    ];

    protected function casts(): array
    {
        return [
            'date' => 'date:Y-m-d',
            'clock_in' => 'string',
            'clock_out' => 'string',
            'overtime' => 'float',
            'regular_hours' => 'float',
            'total_hours' => 'float',
            'break_hours' => 'float',
        ];
    }

    public function employee()
    {
        return $this->belongsTo(Employee::class, 'employee_id');
    }

    public function toApiArray(): array
    {
        $out = $this->camelizeKeys($this->attributesToArray());

        $recon = app(\App\Services\OvertimeReconciliationService::class)->forAttendance($this);
        if ($recon) {
            $out['overtimeReconciliation'] = $recon;
        }

        return $out;
    }
}
