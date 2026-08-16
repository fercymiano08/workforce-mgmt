<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Leave;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

class LeaveController extends Controller
{
    use AuthorizesEmployeeScope, GeneratesSequentialIds;

    public function index(): JsonResponse
    {
        $records = Leave::orderBy('applied_date', 'desc')->orderBy('id')->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $record = Leave::find($id);
        if (! $record) {
            return response()->json(['message' => 'Leave request not found'], 404);
        }

        $this->assertSelfOrAdmin($request, $record->employee_id);

        return response()->json(['data' => $record->toApiArray()]);
    }

    public function byEmployee(Request $request, string $employeeId): JsonResponse
    {
        $this->assertSelfOrAdmin($request, $employeeId);

        $records = Leave::where('employee_id', $employeeId)
            ->orderBy('applied_date', 'desc')
            ->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    public function balances(Request $request, string $employeeId): JsonResponse
    {
        $this->assertSelfOrAdmin($request, $employeeId);

        $employee = Employee::find($employeeId);

        if ($employee) {
            return response()->json(['data' => $employee->leaveBalances()]);
        }

        $totals = Employee::defaultLeaveBalances();
        $data = array_map(
            fn ($type, $total) => [
                'type' => $type,
                'total' => (float) $total,
                'used' => 0.0,
                'remaining' => (float) $total,
            ],
            array_keys($totals),
            array_values($totals)
        );

        return response()->json(['data' => $data]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = Leave::apiFillable($request->validate([
            'employeeId' => 'required|string|max:20',
            'employeeName' => 'required|string|max:150',
            'leaveType' => 'required|string|max:50',
            'startDate' => 'required|date',
            'endDate' => 'required|date',
            'reason' => 'required|string',
            'status' => 'required|string|max:50',
            'appliedDate' => 'required|date',
            'approvedBy' => 'nullable|string|max:150',
            'comments' => 'nullable|string',
            'documents' => 'nullable|array',
        ]));

        $this->assertSelfOrAdmin($request, $data['employee_id']);

        $this->assertSufficientBalance(
            $data['employee_id'],
            $data['leave_type'],
            $data['start_date'],
            $data['end_date']
        );

        $record = Leave::create([
            ...$data,
            'id' => $this->nextIdFor(Leave::class, 'LVE'),
        ]);

        NotificationService::notifyAdmins(
            'leave_request',
            'New Leave Request',
            "{$record->employee_name} requested {$record->leave_type} leave from {$record->start_date->format('M d')} to {$record->end_date->format('M d')}.",
            'medium',
            '/leave'
        );

        return response()->json(['data' => $record->toApiArray()], 201);
    }

    private function assertSufficientBalance(
        string $employeeId,
        string $leaveType,
        string $startDate,
        string $endDate
    ): void {
        $employee = Employee::find($employeeId);
        if (! $employee) {
            return;
        }

        $requested = \Carbon\Carbon::parse($startDate)
            ->diffInDays(\Carbon\Carbon::parse($endDate)) + 1;

        $balance = collect($employee->leaveBalances())->firstWhere('type', $leaveType);
        if ($balance && $balance['remaining'] < $requested) {
            throw ValidationException::withMessages([
                'leaveType' => ["Insufficient balance. Only {$balance['remaining']} day(s) of {$leaveType} leave remaining."],
            ]);
        }
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $record = Leave::find($id);
        if (! $record) {
            return response()->json(['message' => 'Leave request not found'], 404);
        }

        $data = Leave::apiFillable($request->validate([
            'employeeId' => 'sometimes|string|max:20',
            'employeeName' => 'sometimes|string|max:150',
            'leaveType' => 'sometimes|string|max:50',
            'startDate' => 'sometimes|date',
            'endDate' => 'sometimes|date',
            'reason' => 'sometimes|string',
            'status' => 'sometimes|string|max:50',
            'appliedDate' => 'sometimes|date',
            'approvedBy' => 'nullable|string|max:150',
            'comments' => 'nullable|string',
            'documents' => 'nullable|array',
        ]));

        $record->update($data);

        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    public function updateStatus(Request $request, string $id): JsonResponse
    {
        $record = Leave::find($id);
        if (! $record) {
            return response()->json(['message' => 'Leave request not found'], 404);
        }

        $request->validate([
            'status' => 'required|string|max:50',
            'approvedBy' => 'nullable|string|max:150',
        ]);

        $status = $request->input('status');
        $isAdmin = $request->user()?->role === 'Administrator';

        if (! $isAdmin) {
            // Employees may only withdraw their own still-pending request -
            // nothing else. Approving/rejecting stays Administrator-only.
            $isOwnPending = $request->user()?->employee_id === $record->employee_id
                && $record->status === 'Pending';

            if (! $isOwnPending || $status !== 'Cancelled') {
                abort(403, 'You are not authorized to perform this action.');
            }
        }

        $record->update([
            'status' => $status,
            'approved_by' => $request->input('approvedBy', $record->approved_by),
        ]);

        if ($status === 'Approved') {
            NotificationService::notifyEmployee(
                $record->employee_id,
                'leave_approved',
                'Leave Approved',
                "Your {$record->leave_type} leave (".$record->start_date->format('M d').' – '.$record->end_date->format('M d').') has been approved.',
                'medium',
                '/leave'
            );
        } elseif ($status === 'Rejected') {
            NotificationService::notifyEmployee(
                $record->employee_id,
                'leave_rejected',
                'Leave Rejected',
                "Your {$record->leave_type} leave (".$record->start_date->format('M d').' – '.$record->end_date->format('M d').') has been rejected.',
                'high',
                '/leave'
            );
        } elseif ($status === 'Cancelled') {
            NotificationService::notifyAdmins(
                'leave_cancelled',
                'Leave Request Cancelled',
                "{$record->employee_name} withdrew their {$record->leave_type} leave request (".$record->start_date->format('M d').' – '.$record->end_date->format('M d').').',
                'low',
                '/leave'
            );
        }

        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    public function destroy(string $id): JsonResponse
    {
        $record = Leave::find($id);
        if (! $record) {
            return response()->json(['message' => 'Leave request not found'], 404);
        }

        $record->delete();

        return response()->json(['success' => true]);
    }
}
