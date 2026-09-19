<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Controller;
use App\Models\EarlyClockOut;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Admin review + employee self-service for early clock-outs.
 *
 * The punch is recorded by the kiosk the moment someone leaves (see
 * KioskController::clockOut). This controller is the post-hoc side: HR
 * classifies the reason after the fact, and the employee can attach a reason,
 * note, or proof later. Nothing here can un-ring the punch - only the payroll
 * consequence of the shortfall is adjustable.
 */
class EarlyClockOutController extends Controller
{
    use AuthorizesEmployeeScope;

    public function index(): JsonResponse
    {
        $records = EarlyClockOut::orderBy('date', 'desc')->orderBy('id')->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    public function show(string $id): JsonResponse
    {
        $record = EarlyClockOut::find($id);

        if (! $record) {
            return response()->json(['message' => 'Early clock-out record not found'], 404);
        }

        return response()->json(['data' => $record->toApiArray()]);
    }

    public function byEmployee(Request $request, string $employeeId): JsonResponse
    {
        $this->assertSelfOrAdmin($request, $employeeId);

        $records = EarlyClockOut::where('employee_id', $employeeId)
            ->orderBy('date', 'desc')
            ->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    /**
     * HR classifies an early clock-out after the fact. Allowed because a
     * reason can only adjust the payroll consequence - it never invalidates
     * the punch or retroactively rejects the employee's right to leave.
     */
    public function classify(Request $request, string $id): JsonResponse
    {
        $this->assertAdmin($request);

        $record = EarlyClockOut::find($id);

        if (! $record) {
            return response()->json(['message' => 'Early clock-out record not found'], 404);
        }

        $validated = $request->validate([
            'classification' => 'required|string|in:PENDING_REVIEW,EXCUSED_SICK,EXCUSED_EMERGENCY,EXCUSED_EARLY_LEAVE,UNPAID',
        ]);

        $admin = $request->user();

        $record->update([
            'classification' => $validated['classification'],
            'classified_by' => $admin->name ?? $admin->email ?? null,
            'classified_at' => now(),
        ]);

        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    /**
     * Employee (or admin) sets or updates the reason, note, and proof after
     * the punch. A punch never needs a reason to exist - a reason can arrive
     * anytime afterwards.
     */
    public function updateReason(Request $request, string $id): JsonResponse
    {
        $record = EarlyClockOut::find($id);

        if (! $record) {
            return response()->json(['message' => 'Early clock-out record not found'], 404);
        }

        $this->assertSelfOrAdmin($request, $record->employee_id);

        $validated = $request->validate([
            'reasonCode' => 'nullable|string|max:40',
            'reasonNote' => 'nullable|string|max:1000',
            'proof' => 'nullable|array',
        ]);

        $record->update([
            'reason_code' => $validated['reasonCode'] ?? $record->reason_code,
            'reason_note' => $validated['reasonNote'] ?? $record->reason_note,
            'proof' => $validated['proof'] ?? $record->proof,
            'reason_status' => ($validated['reasonCode'] ?? $record->reason_code) ? 'PROVIDED' : 'PENDING',
        ]);

        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    /** Count of records still awaiting HR review (for dashboard badges). */
    public function pending(): JsonResponse
    {
        return response()->json([
            'data' => ['pending' => EarlyClockOut::where('classification', 'PENDING_REVIEW')->count()],
        ]);
    }
}