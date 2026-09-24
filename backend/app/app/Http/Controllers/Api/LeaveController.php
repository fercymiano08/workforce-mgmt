<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Leave;
use App\Services\AuditLogger;
use App\Services\WorkingDays;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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

        // An employee's request always starts Pending and unapproved, whatever the
        // request body says. Only an Administrator may create one already decided.
        if ($request->user()?->role !== 'Administrator') {
            $data['status'] = 'Pending';
            $data['approved_by'] = null;

            // Employees cannot file leave for days that have already begun. (An
            // Administrator may still record a past absence on someone's behalf.)
            $today = Carbon::now('Asia/Manila')->toDateString();
            if (Carbon::parse($data['start_date'])->toDateString() < $today) {
                throw ValidationException::withMessages([
                    'startDate' => ['Leave cannot start in the past. Choose today or a later date.'],
                ]);
            }
        }

        if (Carbon::parse($data['end_date'])->lt(Carbon::parse($data['start_date']))) {
            throw ValidationException::withMessages([
                'endDate' => ['The end date cannot be before the start date.'],
            ]);
        }

        // A second request for days that are already covered by a Pending or
        // Approved one is a duplicate (typically a double click). Refuse it.
        $overlap = Leave::where('employee_id', $data['employee_id'])
            ->whereIn('status', ['Pending', 'Approved'])
            ->whereDate('start_date', '<=', $data['end_date'])
            ->whereDate('end_date', '>=', $data['start_date'])
            ->first();
        if ($overlap) {
            throw ValidationException::withMessages([
                'startDate' => ['You already have a '.$overlap->status.' '.$overlap->leave_type.' leave request ('.$overlap->id.') from '
                    .$overlap->start_date->format('M j').' to '.$overlap->end_date->format('M j, Y')
                    .' that overlaps these dates. Cancel it first if you want to change it.'],
            ]);
        }

        // Leave costs WORKING days: nobody is charged for a weekend, a holiday or a day off.
        $counted = (new WorkingDays())->count($data['employee_id'], $data['start_date'], $data['end_date']);
        if ($counted['days'] < 1) {
            throw ValidationException::withMessages([
                'startDate' => ['These dates contain no working days (they fall on weekends, holidays or days off). Choose dates that include at least one working day.'],
            ]);
        }

        $this->assertSufficientBalance($data['employee_id'], $data['leave_type'], $counted['days']);

        $record = Leave::create([
            ...$data,
            'days' => $counted['days'],
            'id' => $this->nextIdFor(Leave::class, 'LVE'),
        ]);

        AuditLogger::record('timeoff', 
            'leave.created',
            'Leave',
            $record->id,
            actor: $request->user()?->name,
            actorId: $request->user()?->employee_id,
            after: $record->toApiArray(),
            meta: ['employeeId' => $record->employee_id, 'leaveType' => $record->leave_type],
        );

        NotificationService::notifyAdmins(
            'leave_request',
            'New Leave Request',
            "{$record->employee_name} requested {$record->leave_type} leave from {$record->start_date->format('M d')} to {$record->end_date->format('M d')}.",
            'medium',
            '/leave'
        );

        return response()->json(['data' => $record->toApiArray()], 201);
    }

    /**
     * What a leave request would cost, before it is filed: the working days in the range and which days were
     * skipped (holidays, days off). The Leave form shows this as the person picks dates.
     */
    public function workingDays(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employeeId' => 'required|string|max:20',
            'startDate' => 'required|date',
            'endDate' => 'required|date|after_or_equal:startDate',
        ]);
        $this->assertSelfOrAdmin($request, $data['employeeId']);

        return response()->json(['data' => (new WorkingDays())->count($data['employeeId'], $data['startDate'], $data['endDate'])]);
    }

    private function assertSufficientBalance(string $employeeId, string $leaveType, float|int $requested): void
    {
        $employee = Employee::find($employeeId);
        if (! $employee) {
            return;
        }

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

        $before = $record->toApiArray();
        // Moving the dates moves the cost: count the working days again.
        if (isset($data['start_date']) || isset($data['end_date'])) {
            $start = $data['start_date'] ?? $record->start_date->toDateString();
            $end = $data['end_date'] ?? $record->end_date->toDateString();
            if ($end < $start) {
                throw ValidationException::withMessages(['endDate' => ['The end date cannot be before the start date.']]);
            }
            $counted = (new WorkingDays())->count($data['employee_id'] ?? $record->employee_id, $start, $end);
            if ($counted['days'] < 1) {
                throw ValidationException::withMessages(['startDate' => ['These dates contain no working days (they fall on weekends, holidays or days off).']]);
            }
            $data['days'] = $counted['days'];
        }
        $record->update($data);

        AuditLogger::record('timeoff', 
            'leave.updated',
            'Leave',
            $record->id,
            actor: $request->user()?->name,
            actorId: $request->user()?->employee_id,
            before: $before,
            after: $record->fresh()->toApiArray(),
        );

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

        AuditLogger::record('timeoff', 
            'leave.status_changed',
            'Leave',
            $record->id,
            actor: $request->user()?->name,
            actorId: $request->user()?->employee_id,
            after: $record->fresh()->toApiArray(),
            meta: ['status' => $status, 'employeeId' => $record->employee_id],
        );

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

        AuditLogger::record('timeoff', 
            'leave.deleted',
            'Leave',
            $record->id,
            before: $record->toApiArray(),
        );

        $record->delete();

        return response()->json(['success' => true]);
    }
}
