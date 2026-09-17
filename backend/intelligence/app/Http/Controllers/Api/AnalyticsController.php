<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AnalyticsService;
use Illuminate\Http\JsonResponse;

class AnalyticsController extends Controller
{
    public function __construct(private readonly AnalyticsService $analytics) {}

    public function getAll(): JsonResponse
    {
        return response()->json(['data' => $this->analytics->all()]);
    }

    public function section(string $section): JsonResponse
    {
        $map = [
            'attendance-trend' => 'attendance_trend',
            'department-productivity' => 'department_productivity',
            'leave-trend' => 'leave_trend',
            'overtime-summary' => 'overtime_summary',
            'punctuality-score' => 'punctuality_score',
            'payroll-discrepancy' => 'payroll_discrepancy',
        ];

        $key = $map[$section] ?? null;
        if (! $key) {
            return response()->json(['message' => 'Unknown analytics section'], 404);
        }

        return response()->json(['data' => $this->analytics->section($key)]);
    }
}
