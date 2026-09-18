<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Leave;
use App\Models\OvertimeRequest;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Machine-to-machine endpoints for the Time Off service. Only peers presenting
 * the shared SERVICE_TOKEN (X-Service-Token header) may call these.
 * updateLeaveStatus / updateOvertimeStatus exist so the AI (intelligence)
 * service can approve or reject requests over HTTP without DB access here.
 */
class InternalApiController extends Controller
{
    /** @var list<string> Tables this service owns (served to peers on request). */
    protected array $ownedTables = ['leaves', 'overtime_requests'];

    public function snapshot(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $snapshot = [];
        foreach ($this->ownedTables as $table) {
            $snapshot[$table] = DB::table($table)->orderBy('id')->get();
        }

        return response()->json(['data' => $snapshot]);
    }

    public function updateLeaveStatus(Request $request, string $id): JsonResponse
    {
        $this->authorizeService($request);

        $leave = Leave::findOrFail($id);
        $data = $request->validate([
            'status' => 'required|in:Approved,Rejected,Pending,Cancelled',
            'approvedBy' => 'nullable|string|max:100',
            'comments' => 'nullable|string',
        ]);

        $leave->status = $data['status'];
        $leave->approved_by = $data['approvedBy'] ?? $leave->approved_by;
        if (isset($data['comments'])) {
            $leave->comments = $data['comments'];
        }
        $leave->save();

        if (in_array($data['status'], ['Approved', 'Rejected'], true)) {
            NotificationService::notifyEmployee(
                $leave->employee_id,
                $data['status'] === 'Approved' ? 'leave_approved' : 'leave_rejected',
                'Leave Request '.ucfirst(strtolower($data['status'])),
                'Your ' . $leave->leave_type . ' leave ('.$leave->start_date.' to '.$leave->end_date.') was '.strtolower($data['status']).'.',
                'medium',
                '/leave'
            );
        }

        return response()->json(['data' => $leave->toApiArray()]);
    }

    public function updateOvertimeStatus(Request $request, string $id): JsonResponse
    {
        $this->authorizeService($request);

        $overtime = OvertimeRequest::findOrFail($id);
        $data = $request->validate([
            'status' => 'required|in:Approved,Rejected,Pending,Cancelled',
            'approvedBy' => 'nullable|string|max:100',
            'approvedHours' => 'nullable|numeric|min:0|max:24',
            'comments' => 'nullable|string',
        ]);

        $overtime->status = $data['status'];
        $overtime->approved_by = $data['approvedBy'] ?? $overtime->approved_by;
        if (isset($data['comments'])) {
            $overtime->comments = $data['comments'];
        }
        if ($data['status'] === 'Approved') {
            $overtime->approved_hours = $data['approvedHours'] ?? $overtime->expected_hours;
            $overtime->approved_at = now();
        } else {
            $overtime->approved_hours = null;
            $overtime->approved_at = null;
        }
        $overtime->save();

        if (in_array($data['status'], ['Approved', 'Rejected'], true)) {
            NotificationService::notifyEmployee(
                $overtime->employee_id,
                $data['status'] === 'Approved' ? 'overtime_approved' : 'overtime_rejected',
                'Overtime Request '.ucfirst(strtolower($data['status'])),
                'Your overtime request for '.$overtime->date.' was '.strtolower($data['status']).'.',
                'medium',
                '/timesheets'
            );
        }

        return response()->json(['data' => $overtime->toApiArray()]);
    }

    public function syncEmployee(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $data = $request->all();
        if (empty($data['id'])) {
            abort(422, 'Missing employee id');
        }

        DB::table('employees')->updateOrInsert(['id' => $data['id']], $data);

        return response()->json(['data' => ['synced' => true]]);
    }

    protected function authorizeService(Request $request): void
    {
        $token = (string) $request->header('X-Service-Token', '');
        $expected = (string) config('svc.token', '');

        if ($expected === '' || ! hash_equals($expected, $token)) {
            abort(403, 'Unauthorized');
        }
    }
}