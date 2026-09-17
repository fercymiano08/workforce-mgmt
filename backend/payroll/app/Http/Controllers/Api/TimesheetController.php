<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Http\Controllers\Controller;
use App\Models\Timesheet;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TimesheetController extends Controller
{
    use AuthorizesEmployeeScope, GeneratesSequentialIds;

    public function index(): JsonResponse
    {
        $records = Timesheet::orderBy('week_end', 'desc')->orderBy('id')->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $record = Timesheet::find($id);
        if (! $record) {
            return response()->json(['message' => 'Timesheet not found'], 404);
        }

        $this->assertSelfOrAdmin($request, $record->employee_id);

        return response()->json(['data' => $record->toApiArray()]);
    }

    public function byEmployee(Request $request, string $employeeId): JsonResponse
    {
        $this->assertSelfOrAdmin($request, $employeeId);

        $records = Timesheet::where('employee_id', $employeeId)
            ->orderBy('week_end', 'desc')
            ->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = Timesheet::apiFillable($request->validate([
            'employeeId' => 'required|string|max:20',
            'employeeName' => 'required|string|max:150',
            'department' => 'required|string|max:100',
            'date' => 'required|date',
            'weekStart' => 'required|date',
            'weekEnd' => 'required|date',
            'regularHours' => 'nullable|numeric',
            'overtimeHours' => 'nullable|numeric',
            'breakHours' => 'nullable|numeric',
            'totalHours' => 'nullable|numeric',
            'status' => 'required|string|max:50',
            'submittedDate' => 'nullable|date',
            'approvedBy' => 'nullable|string|max:150',
            'notes' => 'nullable|string',
        ]));

        $record = Timesheet::create([
            ...$data,
            'id' => $this->nextIdFor(Timesheet::class, 'TS'),
        ]);

        if ($record->status === 'Submitted') {
            NotificationService::notifyAdmins(
                'timesheet_submitted',
                'Timesheet Submitted',
                "{$record->employee_name} submitted a timesheet for the week of ".$record->week_start->format('M d').' – '.$record->week_end->format('M d').'.',
                'medium',
                '/timesheets'
            );
        }

        return response()->json(['data' => $record->toApiArray()], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $record = Timesheet::find($id);
        if (! $record) {
            return response()->json(['message' => 'Timesheet not found'], 404);
        }

        $data = Timesheet::apiFillable($request->validate([
            'employeeId' => 'sometimes|string|max:20',
            'employeeName' => 'sometimes|string|max:150',
            'department' => 'sometimes|string|max:100',
            'date' => 'sometimes|date',
            'weekStart' => 'sometimes|date',
            'weekEnd' => 'sometimes|date',
            'regularHours' => 'nullable|numeric',
            'overtimeHours' => 'nullable|numeric',
            'breakHours' => 'nullable|numeric',
            'totalHours' => 'nullable|numeric',
            'status' => 'sometimes|string|max:50',
            'submittedDate' => 'nullable|date',
            'approvedBy' => 'nullable|string|max:150',
            'notes' => 'nullable|string',
        ]));

        $record->update($data);

        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    public function updateStatus(Request $request, string $id): JsonResponse
    {
        $record = Timesheet::find($id);
        if (! $record) {
            return response()->json(['message' => 'Timesheet not found'], 404);
        }

        $request->validate([
            'status' => 'required|string|max:50',
            'approvedBy' => 'nullable|string|max:150',
        ]);

        $status = $request->input('status');
        $isAdmin = $request->user()?->role === 'Administrator';

        if (! $isAdmin) {
            // Employees may only submit their own draft timesheet - nothing else.
            $isOwnDraft = $request->user()?->employee_id === $record->employee_id
                && $record->status === 'Draft';

            if (! $isOwnDraft || $status !== 'Submitted') {
                abort(403, 'You are not authorized to perform this action.');
            }
        }

        $record->update([
            'status' => $status,
            'approved_by' => $request->input('approvedBy'),
        ]);

        if (in_array($status, ['Approved', 'Rejected'], true)) {
            NotificationService::notifyEmployee(
                $record->employee_id,
                $status === 'Approved' ? 'timesheet_approved' : 'timesheet_rejected',
                $status === 'Approved' ? 'Timesheet Approved' : 'Timesheet Rejected',
                "Your timesheet for the week of ".$record->week_start->format('M d').' – '.$record->week_end->format('M d')." has been {$status}.",
                'medium',
                '/my-timesheet'
            );
        }

        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    public function destroy(string $id): JsonResponse
    {
        $record = Timesheet::find($id);
        if (! $record) {
            return response()->json(['message' => 'Timesheet not found'], 404);
        }

        $record->delete();

        return response()->json(['success' => true]);
    }
}
