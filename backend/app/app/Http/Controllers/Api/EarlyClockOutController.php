<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Controller;
use App\Models\EarlyClockOut;
use App\Models\Employee;
use App\Services\AuditLogger;
use App\Services\EarlyLeavePolicy;
use App\Services\NotificationService;
use App\Services\TimeoffClient;
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
     *
     * Abuse controls are enforced here, not on the kiosk (the punch is always
     * accepted):
     *  - Rolling threshold: once an employee has reached the configured number
     *    of early outs within the window (default 2 in 30 days), the record is
     *    auto-classified UNPAID and both HR and the employee are told. HR can
     *    explicitly override with the `override` flag when the situation
     *    genuinely warrants mercy.
     *  - Medical-certificate rule: recurring SICK early outs (default 2)
     *    within the window flag the record as CERTIFICATE_REQUIRED so HR can
     *    collect proof. SICK classifications also auto-generate a pending Sick
     *    leave draft that HR approves in one click (consuming the Sick balance
     *    via the normal leave workflow).
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
            'override' => 'nullable|boolean',
        ]);

        $admin = $request->user();
        $override = (bool) $request->boolean('override');
        $policy = app(EarlyLeavePolicy::class);

        $enforcer = app(\App\Services\EarlyLeaveEnforcer::class);
        $windowStart = $enforcer->windowStart($record->date->toDateString());

        // Earlier early clock-outs only - the record being judged is not counted against itself,
        // so 'free allowance 2' really means two free ones and the THIRD is unexcused.
        $withinWindow = $enforcer->priorCount($record->employee_id, $record->date->toDateString(), $record->id);

        $chosen = $validated['classification'];
        $note = null;

        $limitHit = $withinWindow >= $policy->allowedCount();
        if (! $override && ! in_array($chosen, ['UNPAID', 'PENDING_REVIEW'], true) && $limitHit) {
            $chosen = 'UNPAID';
            $note = "Auto-classified UNPAID: {$withinWindow} earlier early clock-outs within {$policy->windowDays()} days already use the free allowance of {$policy->allowedCount()}.";
            NotificationService::notifyAdmins(
                'early_leave_auto_unpaid',
                'Early Clock-Out Auto-Classified Unpaid',
                "{$record->employee_name} ({$record->employee_id}) had an early clock-out on ".$record->date->format('M d, Y').' auto-classified as UNPAID - '.$withinWindow.' early outs within '.$policy->windowDays().' days.',
                'high',
                '/attendance'
            );
            NotificationService::notifyEmployee(
                $record->employee_id,
                'early_leave_auto_unpaid',
                'Early Clock-Out Classified as Unpaid',
                'Your early clock-out on '.$record->date->format('M d, Y').' was classified as unpaid because the team has a policy limit of '.$policy->allowedCount().' early clock-outs within '.$policy->windowDays().' days.',
                'high',
                '/my-attendance'
            );
        }

        // A SICK claim can't be verified at the kiosk: it is only excused with proof on file.
        if ($chosen === 'EXCUSED_SICK' && ! $override && empty($record->proof)) {
            return response()->json([
                'message' => 'No medical certificate is attached to this record. Ask the employee to upload one, or use Override if you have verified it another way.',
                'data' => ['reason' => 'proof_required'],
            ], 422);
        }

        $reasonStatus = $record->reason_status;
        if (in_array($chosen, ['EXCUSED_SICK'], true)) {
            $sickCount = EarlyClockOut::where('employee_id', $record->employee_id)
                ->where('date', '>=', $windowStart)
                ->where(function ($q): void {
                    $q->where('reason_code', 'SICK')->orWhere('classification', 'EXCUSED_SICK');
                })
                ->count();

            if (! $override && $sickCount >= $policy->sickCertThreshold()) {
                $reasonStatus = 'CERTIFICATE_REQUIRED';
                $note = trim(($note ? $note.' ' : '')."Medical certificate required: {$sickCount} SICK early clock-outs within the last {$policy->windowDays()} days exceeds the limit of {$policy->sickCertThreshold()}.");
                NotificationService::notifyEmployee(
                    $record->employee_id,
                    'early_leave_certificate_required',
                    'Medical Certificate Required',
                    'Please submit a medical certificate for your SICK early clock-out on '.$record->date->format('M d, Y').' so HR can excuse it.',
                    'medium',
                    '/my-attendance'
                );
                NotificationService::notifyAdmins(
                    'early_leave_certificate_required',
                    'Early Clock-Out Needs Medical Certificate',
                    "{$record->employee_name} ({$record->employee_id}) needs a medical certificate for the SICK early clock-out on ".$record->date->format('M d, Y').'.',
                    'medium',
                    '/attendance'
                );
            }
        }

        $record->update([
            'classification' => $chosen,
            'classification_note' => $note,
            'reason_status' => $reasonStatus,
            'classified_by' => $admin->name ?? $admin->email ?? null,
            'classified_at' => now(),
        ]);

        if ($chosen === 'EXCUSED_SICK') {
            $employee = Employee::find($record->employee_id);
            TimeoffClient::autoDraftSickLeave(
                $record->employee_id,
                $employee ? trim($employee->first_name.' '.$employee->last_name) : $record->employee_name,
                $record->date->toDateString(),
                $record->minutes_early,
                $record->id,
            );
        }

        AuditLogger::record('attendance', 
            'early_clockout.classified',
            'EarlyClockOut',
            $record->id,
            actor: $admin->name ?? $admin->email,
            actorId: $admin->employee_id,
            before: $record->getOriginal(),
            after: $record->fresh()->toApiArray(),
            meta: [
                'employeeId' => $record->employee_id,
                'date' => $record->date->toDateString(),
                'applied' => $chosen,
                'requested' => $validated['classification'],
                'override' => $override,
            ],
        );

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

        $newProof = $validated['proof'] ?? $record->proof;
        $hadProof = ! empty($record->proof);
        $reasonCode = $validated['reasonCode'] ?? $record->reason_code;

        // A reason that cannot be verified at the kiosk (SICK) stays 'certificate required'
        // until proof is attached; once it is, HR is told to review it.
        $status = $reasonCode ? 'PROVIDED' : 'PENDING';
        if ($reasonCode === 'SICK') {
            $status = ! empty($newProof) ? 'PROOF_SUBMITTED' : ($record->reason_status === 'CERTIFICATE_OVERDUE' ? 'CERTIFICATE_OVERDUE' : 'CERTIFICATE_REQUIRED');
        }

        $record->update([
            'reason_code' => $reasonCode,
            'reason_note' => $validated['reasonNote'] ?? $record->reason_note,
            'proof' => $newProof,
            'reason_status' => $status,
        ]);

        if (! $hadProof && ! empty($newProof)) {
            NotificationService::notifyAdmins(
                'early_leave_proof_submitted',
                'Early Clock-Out Proof Submitted',
                ($record->employee_name ?? $record->employee_id).' uploaded proof for the early clock-out on '.$record->date->format('M d, Y').'. Review and excuse it if it checks out.',
                'medium',
                '/attendance?view=early'
            );
        }

        $user = $request->user();
        AuditLogger::record('attendance', 
            'early_clockout.reason_updated',
            'EarlyClockOut',
            $record->id,
            actor: $user?->name,
            actorId: $user?->employee_id,
            after: $record->fresh()->toApiArray(),
            meta: ['employeeId' => $record->employee_id, 'date' => $record->date->toDateString()],
        );

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