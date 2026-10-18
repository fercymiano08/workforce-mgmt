<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\LeaveType;
use App\Services\AuditLogger;
use App\Services\LeaveEligibility;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * Admin CRUD for the rules behind every leave type - what used to be hardcoded string
 * comparisons in LeaveController. Mirrors SettingsController/ShiftController conventions:
 * apiFillable(), AuditLogger on every mutation, every response wrapped in ['data' => ...].
 */
class LeaveTypeController extends Controller
{
    use AuthorizesEmployeeScope, GeneratesSequentialIds;

    public function index(): JsonResponse
    {
        $records = LeaveType::orderBy('code')->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = LeaveType::apiFillable($this->validated($request));

        $record = LeaveType::create([
            ...$data,
            'id' => $this->nextIdFor(LeaveType::class, 'LVT'),
            'active' => true,
        ]);

        AuditLogger::record('timeoff', 'leaveType.created', 'LeaveType', $record->id,
            actor: $request->user()?->name, actorId: $request->user()?->employee_id,
            after: $record->toApiArray());

        return response()->json(['data' => $record->toApiArray()], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $record = LeaveType::find($id);
        if (! $record) {
            return response()->json(['message' => 'Leave type not found'], 404);
        }

        $data = LeaveType::apiFillable($this->validated($request, $id, sometimes: true));

        $before = $record->toApiArray();
        $record->update($data);

        // Editing a type's rules never touches a Leave row already on the books - every request
        // snapshotted its own pay_type/paid_days/unpaid_days at submission time, so a rule change
        // here is never retroactive.
        AuditLogger::record('timeoff', 'leaveType.updated', 'LeaveType', $record->id,
            actor: $request->user()?->name, actorId: $request->user()?->employee_id,
            before: $before, after: $record->fresh()->toApiArray());

        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $record = LeaveType::find($id);
        if (! $record) {
            return response()->json(['message' => 'Leave type not found'], 404);
        }

        // Never a hard delete - historical leaves.leave_type strings must keep resolving.
        $before = $record->toApiArray();
        $record->update(['active' => false]);

        AuditLogger::record('timeoff', 'leaveType.deactivated', 'LeaveType', $record->id,
            actor: $request->user()?->name, actorId: $request->user()?->employee_id,
            before: $before, after: $record->fresh()->toApiArray());

        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    /**
     * Every active leave type, annotated for one employee: whether they're eligible (and why
     * not, if not) and their current ledger balance where the type requires one. What the
     * employee-side dropdown renders from, instead of a hardcoded array + plain-language notes.
     */
    public function eligibleForEmployee(Request $request, string $employeeId): JsonResponse
    {
        $this->assertSelfOrAdmin($request, $employeeId);

        $employee = Employee::find($employeeId);
        if (! $employee) {
            return response()->json(['message' => 'Employee not found'], 404);
        }

        $balances = collect($employee->leaveBalances())->keyBy('type');

        $data = LeaveType::where('active', true)->orderBy('code')->get()
            ->map(function (LeaveType $type) use ($employee, $balances) {
                $reasons = LeaveEligibility::ineligibilityReasons($employee, $type);

                return [
                    ...$type->toApiArray(),
                    'eligible' => $reasons === [],
                    'ineligibilityReasons' => $reasons,
                    'balance' => $balances->get($type->code),
                ];
            })->values();

        return response()->json(['data' => $data]);
    }

    private function validated(Request $request, ?string $id = null, bool $sometimes = false): array
    {
        $req = $sometimes ? 'sometimes' : 'required';

        return $request->validate([
            'code' => [$req, 'string', 'max:30', Rule::unique('leave_types', 'code')->ignore($id, 'id')],
            'name' => [$req, 'string', 'max:100'],
            'applicableGender' => [$req, Rule::in(['Any', 'Male', 'Female'])],
            'minTenureMonths' => [$req, 'integer', 'min:0'],
            'payType' => [$req, Rule::in(['PaidWithBalance', 'PaidWithoutBalance', 'Unpaid'])],
            'requiresBalance' => [$req, 'boolean'],
            'accrualPolicy' => [$req, Rule::in(['None', 'Monthly'])],
            'accrualRate' => [$req, 'numeric', 'min:0'],
            'maxCarryoverDays' => ['nullable', 'integer', 'min:0'],
            'advanceNoticeDays' => [$req, 'integer', 'min:0'],
            'retroactiveAllowed' => [$req, 'boolean'],
            'retroactiveWindowDays' => [$req, 'integer', 'min:0'],
            'maxConsecutiveDays' => ['nullable', 'integer', 'min:0'],
            'requiresProof' => [$req, 'boolean'],
            'proofThresholdDays' => [$req, 'integer', 'min:0'],
            // Not required on create (store() forces every new type active) - present so update()
            // can also reactivate a type, since destroy() only ever flips this to false.
            'active' => 'sometimes|boolean',
        ]);
    }
}
