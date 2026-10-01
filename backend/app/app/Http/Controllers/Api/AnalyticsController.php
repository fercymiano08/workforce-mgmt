<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AnalyticsService;
use Illuminate\Http\Request;
use Illuminate\Http\JsonResponse;

class AnalyticsController extends Controller
{
    public function __construct(private readonly AnalyticsService $analytics) {}

    /**
     * How many completed months the windowed figures cover. The attendance and leave trends are
     * whole arrays the page slices itself, so only productivity actually asks for a window - it
     * is one number, so it cannot be cut down client-side without recomputing it here.
     */
    private function months(Request $request): int
    {
        // Absent or unparseable means the default. A value that is present but nonsense is still
        // passed through, so windowMonths() can clamp it rather than quietly ignoring the caller.
        $raw = $request->query('months');

        if ($raw === null || ! is_numeric($raw)) {
            return AnalyticsService::windowMonths(null);
        }

        return AnalyticsService::windowMonths((int) $raw);
    }

    public function getAll(Request $request): JsonResponse
    {
        return response()->json(['data' => $this->analytics->all($this->months($request))]);
    }

    public function section(Request $request, string $section): JsonResponse
    {
        $map = [
            'attendance-trend' => 'attendance_trend',
            'department-productivity' => 'department_productivity',
            'leave-trend' => 'leave_trend',
            'overtime-summary' => 'overtime_summary',
            'punctuality-score' => 'punctuality_score',
        ];

        $key = $map[$section] ?? null;
        if (! $key) {
            return response()->json(['message' => 'Unknown analytics section'], 404);
        }

        return response()->json(['data' => $this->analytics->section($key, $this->months($request))]);
    }
}
