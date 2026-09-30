<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\OvertimeRequest;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

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

        // An employee's request always starts Pending and unapproved, whatever the
        // request body says. Only an Administrator may create one already decided.
        if ($request->user()?->role !== 'Administrator') {
            $data['status'] = 'Pending';
            $data['approved_by'] = null;

            // Retroactive requests are allowed for the past week (someone worked late
            // without asking first and HR may still approve it) - not further back.
            $earliest = \Carbon\Carbon::now('Asia/Manila')->subDays(7)->toDateString();
            if (\Carbon\Carbon::parse($data['date'])->toDateString() < $earliest) {
                throw \Illuminate\Validation\ValidationException::withMessages([
                    'date' => ['Overtime can only be requested for today, the future, or the past 7 days. Please contact HR for older dates.'],
                ]);
            }
        }

        // One overtime request per person per day while an earlier one is still
        // Pending or Approved - a second is a duplicate (typically a double click).
        $duplicate = OvertimeRequest::where('employee_id', $data['employee_id'])
            ->whereDate('date', $data['date'])
            ->whereIn('status', ['Pending', 'Approved'])
            ->first();
        if ($duplicate) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'date' => ['You already have a '.$duplicate->status.' overtime request ('.$duplicate->id.') for '
                    .\Carbon\Carbon::parse($data['date'])->format('M j, Y').'. Cancel it first if you want to change it.'],
            ]);
        }

        $record = OvertimeRequest::create([
            ...$data,
            'id' => $this->nextIdFor(OvertimeRequest::class, 'OT'),
        ]);

        AuditLogger::record('timeoff', 'overtime.requested', 'OvertimeRequest', $record->id,
            actor: $request->user()?->name, actorId: $request->user()?->employee_id,
            after: $record->toApiArray(), meta: ['employeeId' => $record->employee_id]);

        NotificationService::notifyAdmins(
            'overtime_requested',
            'New Overtime Request',
            "{$record->employee_name} requested overtime on ".$record->date->format('M d, Y').'.',
            'medium',
            '/attendance'
        );

        return response()->json(['data' => $record->toApiArray()], 201);
    }

    /**
     * HR raising overtime for several people at once.
     *
     * One person per day is the same rule the single create enforces, and it is the reason this is not
     * just a loop of store() calls: a group either goes in whole or not at all. Somebody who ticked six
     * names and got three of them saved would have no way of knowing which three, and the rest would
     * look like HR had forgotten them.
     *
     * Per-person problems (already requested that day, name no longer on the roster) are reported back
     * by employee id rather than failing the batch, because a group of six where one already has a
     * request is a normal Tuesday, not a mistake worth making the administrator start over.
     */
    public function bulkStore(Request $request): JsonResponse
    {
        $this->assertAdmin($request);

        $data = $request->validate([
            'employeeIds' => ['required', 'array', 'min:1', 'max:100'],
            'employeeIds.*' => ['required', 'string', 'max:20', 'distinct'],
            'date' => 'required|date',
            'expectedHours' => 'nullable|numeric|min:0|max:24',
            'reason' => 'required|string',
            'status' => 'required|string|in:Pending,Approved,Rejected',
        ]);

        $date = \Carbon\Carbon::parse($data['date'])->toDateString();
        $roster = Employee::whereIn('id', $data['employeeIds'])
            ->where('status', '!=', 'Terminated')
            ->get(['id', 'first_name', 'last_name'])
            ->keyBy('id');

        $skipped = [];
        $created = [];

        DB::transaction(function () use ($data, $date, $roster, &$skipped, &$created, $request) {
            foreach ($data['employeeIds'] as $employeeId) {
                $employee = $roster->get($employeeId);
                if (! $employee) {
                    $skipped[] = ['employeeId' => $employeeId, 'reason' => 'not_found'];

                    continue;
                }

                $duplicate = OvertimeRequest::where('employee_id', $employeeId)
                    ->whereDate('date', $date)
                    ->whereIn('status', ['Pending', 'Approved'])
                    ->first();
                if ($duplicate) {
                    $skipped[] = [
                        'employeeId' => $employeeId,
                        'reason' => 'duplicate',
                        'message' => trim($employee->first_name.' '.$employee->last_name).' already has a '.$duplicate->status.' request for that day.',
                    ];

                    continue;
                }

                $record = OvertimeRequest::create([
                    'id' => $this->nextIdFor(OvertimeRequest::class, 'OT'),
                    'employee_id' => $employeeId,
                    'employee_name' => trim($employee->first_name.' '.$employee->last_name),
                    'date' => $date,
                    'expected_hours' => $data['expected_hours'] ?? null,
                    'reason' => $data['reason'],
                    'status' => $data['status'],
                    'requested_date' => now()->toDateString(),
                    'approved_by' => $data['status'] === 'Pending' ? null : $request->user()?->name,
                ]);

                $created[] = $record->toApiArray();
            }
        });

        if ($created) {
            $names = collect($created)->map(fn ($r) => $r['employeeName'])->take(3)->implode(', ');
            $more = count($created) > 3 ? ' and '.(count($created) - 3).' more' : '';
            AuditLogger::record('timeoff', 'overtime.bulk_requested', 'OvertimeRequest', 'bulk', actor: $request->user()?->name,
                actorId: $request->user()?->employee_id, meta: ['count' => count($created), 'date' => $date]);
            NotificationService::notifyAdmins(
                'overtime_requested',
                count($created) > 1 ? count($created).' Overtime Requests' : 'New Overtime Request',
                $names.$more.' on '.\Carbon\Carbon::parse($date)->format('M d, Y').'.',
                'medium',
                '/attendance'
            );
        }

        return response()->json([
            'data' => $created,
            'skipped' => $skipped,
            'message' => count($created).' request(s) created'
                .($skipped ? ', '.count($skipped).' skipped.' : '.'),
        ], count($created) ? 201 : 422);
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

            AuditLogger::record('timeoff', 'overtime.withdrawn', 'OvertimeRequest', $record->id,
                actor: $request->user()?->name, actorId: $request->user()?->employee_id,
                before: $record->toApiArray(), meta: ['employeeId' => $record->employee_id]);

            NotificationService::notifyAdmins(
                'overtime_cancelled',
                'Overtime Request Cancelled',
                "{$record->employee_name} withdrew their overtime request for ".$record->date->format('M d, Y').'.',
                'low',
                '/attendance'
            );

            return response()->json(['success' => true]);
        }

        $before = $record->toApiArray();
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

        // Who decided, and what it was before: a decided overtime request can be reopened, so the trail matters.
        AuditLogger::record('timeoff', 'overtime.status_changed', 'OvertimeRequest', $record->id,
            actor: $request->user()?->name, actorId: $request->user()?->employee_id,
            before: $before, after: $record->fresh()->toApiArray(),
            meta: ['status' => $status, 'employeeId' => $record->employee_id, 'was' => $before['status'] ?? null]);

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

        AuditLogger::record('timeoff', 'overtime.deleted', 'OvertimeRequest', $record->id,
            actor: $request->user()?->name, actorId: $request->user()?->employee_id,
            before: $record->toApiArray(), meta: ['employeeId' => $record->employee_id]);

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
            $before = $record->toApiArray();
            $record->update([
                'status' => $status,
                'approved_by' => $approvedBy ?? $record->approved_by,
                'approved_hours' => $status === 'Approved'
                    ? ($request->input('approvedHours') ?? $record->expected_hours)
                    : null,
                'approved_at' => $status === 'Approved' ? now() : null,
            ]);

            AuditLogger::record('timeoff', 'overtime.status_changed', 'OvertimeRequest', $record->id,
                actor: $request->user()?->name, actorId: $request->user()?->employee_id,
                before: $before, after: $record->fresh()->toApiArray(),
                meta: ['status' => $status, 'employeeId' => $record->employee_id, 'was' => $before['status'] ?? null, 'bulk' => true]);

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
