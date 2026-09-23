<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

class Analytics extends Model
{
    use ApiSerializable;

    protected $table = 'analytics';

    protected $fillable = [
        'attendance_trend', 'department_productivity', 'leave_trend',
        'overtime_summary', 'punctuality_score', 'payroll_discrepancy',
    ];

    protected function casts(): array
    {
        return [
            'attendance_trend' => 'array',
            'department_productivity' => 'array',
            'leave_trend' => 'array',
            'overtime_summary' => 'array',
            'punctuality_score' => 'array',
            'payroll_discrepancy' => 'array',
        ];
    }

    protected function apiNullToEmpty(): array
    {
        return [
            'attendanceTrend', 'departmentProductivity', 'leaveTrend',
            'overtimeSummary', 'punctualityScore', 'payrollDiscrepancy',
        ];
    }
}
