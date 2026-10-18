<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Controller;
use App\Models\LeaveBalanceLedger;
use App\Models\LeaveType;
use App\Services\AuditLogger;
use App\Services\LeaveLedger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Illuminate\Validation\ValidationException;

/**
 * Read history / write manual adjustments for leave_balance_ledger. This is the literal answer
 * to "where does the balance come from, who modifies it" - every row here is one entry in that
 * answer, not a single editable number.
 */
class LeaveBalanceLedgerController extends Controller
{
    use AuthorizesEmployeeScope;

    public function index(Request $request, string $employeeId): JsonResponse
    {
        $this->assertSelfOrAdmin($request, $employeeId);

        $records = LeaveBalanceLedger::where('employee_id', $employeeId)
            ->orderBy('created_at', 'desc')
            ->orderBy('id', 'desc')
            ->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    public function adjust(Request $request): JsonResponse
    {
        $this->assertAdmin($request);

        $data = $request->validate([
            'employeeId' => 'required|string|max:20',
            'leaveTypeCode' => ['required', 'string', Rule::in(LeaveType::activeCodes())],
            'daysDelta' => 'required|numeric',
            'reason' => 'required|string',
        ]);

        // A manual adjustment with no explanation is the exact thing a panel flags as risky -
        // the same >=5-char rule already enforced on a leave rejection comment.
        if (mb_strlen(trim($data['reason'])) < 5) {
            throw ValidationException::withMessages([
                'reason' => ['Please explain this adjustment (at least a few words).'],
            ]);
        }

        $record = LeaveLedger::write(
            $data['employeeId'],
            $data['leaveTypeCode'],
            'Adjustment',
            (float) $data['daysDelta'],
            null,
            trim($data['reason']),
            $request->user()?->name,
        );

        AuditLogger::record('timeoff', 'leaveLedger.adjusted', 'LeaveBalanceLedger', (string) $record->id,
            actor: $request->user()?->name, actorId: $request->user()?->employee_id,
            after: $record->toApiArray(),
            meta: ['employeeId' => $data['employeeId'], 'leaveTypeCode' => $data['leaveTypeCode']]);

        return response()->json(['data' => $record->toApiArray()], 201);
    }
}
