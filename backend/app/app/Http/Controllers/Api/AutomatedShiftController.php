<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\ShiftPlanner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Automated shift scheduling, as the Workforce Admin drives it: preview builds the draft (writes nothing),
 * approve saves the draft as it stands on screen - including any change HR made to it. The shift is always the
 * Standard Shift. See ShiftPlanner.
 */
class AutomatedShiftController extends Controller
{
    public function preview(Request $request, ShiftPlanner $planner): JsonResponse
    {
        return response()->json(['data' => $planner->plan($planner->normalize($this->validated($request)))]);
    }

    public function approve(Request $request, ShiftPlanner $planner): JsonResponse
    {
        $data = $this->validated($request, [
            'assignments' => 'required|array|min:1|max:5000',
            'assignments.*.employeeId' => 'required|string|max:20',
            'assignments.*.date' => 'required|date_format:Y-m-d',
        ]);

        $result = $planner->commit($planner->normalize($data), $data['assignments'], $request->user()?->name ?: 'Workforce Admin');
        if ($result['created'] === 0) {
            return response()->json([
                'message' => 'Nothing could be saved: every assignment was no longer valid (leave, an existing shift, or an inactive employee).',
                'data' => $result,
            ], 422);
        }

        return response()->json(['data' => $result], 201);
    }

    /** @param  array<string, mixed>  $extra */
    private function validated(Request $request, array $extra = []): array
    {
        return $request->validate([
            'startDate' => ['required', 'date_format:Y-m-d', function (string $attribute, mixed $value, \Closure $fail): void {
                if ($value < ShiftPlanner::earliestStart()) {
                    $fail('Pick a start date from tomorrow on. A shift for today is added with Standard Shift Assign.');
                }
            }],
            'weeks' => 'required|integer|between:1,'.ShiftPlanner::MAX_WEEKS,
            'required' => 'required|integer|between:1,500',
            'department' => 'nullable|string|max:100',
            'position' => 'nullable|string|max:100',
            'workDays' => 'nullable|array|min:1',
            'workDays.*' => 'integer|between:1,7',
            'maxWeeklyHours' => 'nullable|numeric|between:1,168',
        ] + $extra);
    }
}
