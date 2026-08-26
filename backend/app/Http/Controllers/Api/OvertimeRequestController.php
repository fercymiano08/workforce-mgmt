<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Http\Controllers\Controller;
use App\Models\OvertimeRequest;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class OvertimeRequestController extends Controller
{
    use AuthorizesEmployeeScope, GeneratesSequentialIds;

    public function index(): JsonResponse
    {
        $records = OvertimeRequest::orderBy('requested_date', 'desc')->orderBy('id')->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $record = OvertimeRequest::find($id);
        if (! $record) {
            return response()->json(['message' => 'Overtime request not found'], 404);
        }

        $this->assertSelfOrAdmin($request, $record->employee_id);

        return response()->json(['data' => $record->toApiArray()]);
    }

    public function byEmployee(Request $request, string $employeeId): JsonResponse
    {
        $this->assertSelfOrAdmin($request, $employeeId);

        $records = OvertimeRequest::where('employee_id', $employeeId)
            ->orderBy('requested_date', 'desc')
            ->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = OvertimeRequest::apiFillable($request->validate([
            'employeeId' => 'required|string|max:20',
            'employeeName' => 'required|string|max:150',
            'date' => 'required|date',
            'expectedHours' => 'nullable|numeric|min:0|max:24',
            'reason' => 'required|string',
            'status' => 'required|string|max:50',
            'requestedDate' => 'required|date',
            'approvedBy' => 'nullable|string|max:150',
            'comments' => 'nullable|string',
        ]));

        $this->assertSelfOrAdmin($request, $data['employee_id']);

        $record = OvertimeRequest::create([
            ...$data,
            'id' => $this->nextIdFor(OvertimeRequest::class, 'OT'),
        ]);

        NotificationService::notifyAdmins(
            'overtime_requested',
            'New Overtime Request',
            "{$record->employee_name} requested overtime on ".$record->date->format('M d, Y').'.',
            'medium',
            '/attendance'
        );

        return response()->json(['data' => $record->toApiArray()], 201);
    }

    public function updateStatus(Request $request, string $id): JsonResponse
    {
        $record = OvertimeRequest::find($id);
        if (! $record) {
            return response()->json(['message' => 'Overtime request not found'], 404);
        }

        $request->validate([
            'status' => 'required|string|max:50',
            'approvedBy' => 'nullable|string|max:150',
            'approvedHours' => 'nullable|numeric|min:0|max:24',
            'comments' => 'nullable|string',
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

            // A withdrawn request is removed entirely rather than lingering
            // in the system as a "Cancelled" row.
            $record->delete();

            NotificationService::notifyAdmins(
                'overtime_cancelled',
                'Overtime Request Cancelled',
                "{$record->employee_name} withdrew their overtime request for ".$record->date->format('M d, Y').'.',
                'low',
                '/attendance'
            );

            return response()->json(['success' => true]);
        }

        $record->update([
            'status' => $status,
            'approved_by' => $request->input('approvedBy', $record->approved_by),
            'approved_hours' => $status === 'Approved'
                ? ($request->input('approvedHours') ?? $record->expected_hours)
                : null,
            'approved_at' => $status === 'Approved' ? now() : null,
            'comments' => $request->has('comments')
                ? ($request->input('comments') ?: null)
                : $record->comments,
        ]);

        if ($status === 'Approved') {
            NotificationService::notifyEmployee(
                $record->employee_id,
                'overtime_approved',
                'Overtime Approved',
                'Your overtime request for '.$record->date->format('M d, Y').' has been approved.',
                'medium',
                '/attendance'
            );
        } elseif ($status === 'Rejected') {
            NotificationService::notifyEmployee(
                $record->employee_id,
                'overtime_rejected',
                'Overtime Rejected',
                'Your overtime request for '.$record->date->format('M d, Y').' has been rejected.',
                'high',
                '/attendance'
            );
        } elseif ($status === 'Cancelled') {
            NotificationService::notifyAdmins(
                'overtime_cancelled',
                'Overtime Request Cancelled',
                "{$record->employee_name} withdrew their overtime request for ".$record->date->format('M d, Y').'.',
                'low',
                '/attendance'
            );
        }

        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $record = OvertimeRequest::find($id);
        if (! $record) {
            return response()->json(['message' => 'Overtime request not found'], 404);
        }

        $this->assertSelfOrAdmin($request, $record->employee_id);

        $record->delete();

        return response()->json(['success' => true]);
    }

    public function bulkUpdateStatus(Request $request): JsonResponse
    {
        $request->validate([
            'ids' => 'required|array|min:1',
            'ids.*' => 'required|string',
            'status' => 'required|string|in:Approved,Rejected',
            'approvedBy' => 'nullable|string|max:150',
            'approvedHours' => 'nullable|numeric|min:0|max:24',
        ]);

        $status = $request->input('status');
        $approvedBy = $request->input('approvedBy');
        $records = OvertimeRequest::whereIn('id', $request->input('ids'))
            ->where('status', 'Pending')
            ->get();

        $updated = 0;
        foreach ($records as $record) {
            $record->update([
                'status' => $status,
                'approved_by' => $approvedBy ?? $record->approved_by,
                'approved_hours' => $status === 'Approved'
                    ? ($request->input('approvedHours') ?? $record->expected_hours)
                    : null,
                'approved_at' => $status === 'Approved' ? now() : null,
            ]);

            if ($status === 'Approved') {
                NotificationService::notifyEmployee(
                    $record->employee_id,
                    'overtime_approved',
                    'Overtime Approved',
                    'Your overtime request for '.$record->date->format('M d, Y').' has been approved.',
                    'medium',
                    '/attendance'
                );
            } else {
                NotificationService::notifyEmployee(
                    $record->employee_id,
                    'overtime_rejected',
                    'Overtime Rejected',
                    'Your overtime request for '.$record->date->format('M d, Y').' has been rejected.',
                    'high',
                    '/attendance'
                );
            }

            $updated++;
        }

        return response()->json(['success' => true, 'updated' => $updated]);
    }
}
