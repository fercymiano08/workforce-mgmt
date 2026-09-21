<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Controller;
use App\Models\Timesheet;
use App\Services\AuditClient;
use App\Services\NotificationService;
use App\Services\TimesheetWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Collection;

/**
 * Timesheets are produced by the system from attendance; nobody types hours in. What people do is move a
 * timesheet through its workflow (see TimesheetWorkflow): the employee submits, the admin approves or
 * rejects, and approved timesheets are sent to payroll.
 */
class TimesheetController extends Controller
{
    use AuthorizesEmployeeScope;

    public function __construct(private readonly TimesheetWorkflow $workflow)
    {
    }

    public function index(): JsonResponse
    {
        $records = Timesheet::orderBy('week_end', 'desc')->orderBy('id')->get();

        return response()->json(['data' => $this->present($records)]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $record = Timesheet::find($id);
        if (! $record) {
            return response()->json(['message' => 'Timesheet not found'], 404);
        }

        $this->assertSelfOrAdmin($request, $record->employee_id);

        return response()->json(['data' => $this->present(collect([$record]))[0]]);
    }

    public function byEmployee(Request $request, string $employeeId): JsonResponse
    {
        $this->assertSelfOrAdmin($request, $employeeId);

        $records = Timesheet::where('employee_id', $employeeId)->orderBy('week_end', 'desc')->get();

        return response()->json(['data' => $this->present($records)]);
    }

    /** Hours cannot be typed in or edited: they come from attendance. Only the admin's note can change. */
    public function update(Request $request, string $id): JsonResponse
    {
        $record = Timesheet::find($id);
        if (! $record) {
            return response()->json(['message' => 'Timesheet not found'], 404);
        }

        $data = $request->validate(['notes' => 'nullable|string|max:1000']);
        $before = $record->toApiArray();
        $record->update(['notes' => $data['notes'] ?? '']);

        AuditClient::record(
            'timesheet.updated',
            'Timesheet',
            $record->id,
            actor: $request->user()?->name,
            actorId: $request->user()?->employee_id,
            before: $before,
            after: $record->fresh()->toApiArray(),
        );

        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    /**
     * The one endpoint that moves a timesheet through its workflow.
     *   employee (owner): status = Submitted
     *   admin: status = Approved | Rejected (reason required) | Draft (= reopen, reason required)
     */
    public function updateStatus(Request $request, string $id): JsonResponse
    {
        $record = Timesheet::find($id);
        if (! $record) {
            return response()->json(['message' => 'Timesheet not found'], 404);
        }

        $request->validate([
            'status' => 'required|string|in:Submitted,Approved,Rejected,Draft',
            'approvedBy' => 'nullable|string|max:150',
            'reason' => 'nullable|string|max:1000',
        ]);

        $status = $request->input('status');
        $user = $request->user();
        $isAdmin = $user?->role === 'Administrator';
        $who = $user?->name ?: ($isAdmin ? 'Workforce Admin' : 'Employee');
        $reason = (string) $request->input('reason', '');

        if (! $isAdmin) {
            // Employees may only submit their own timesheet - nothing else.
            if ($user?->employee_id !== $record->employee_id || $status !== 'Submitted') {
                abort(403, 'You are not authorized to perform this action.');
            }
        } elseif ($status === 'Submitted') {
            abort(403, 'Only the employee can submit their own timesheet.');
        }

        $before = $record->toApiArray();
        $updated = match ($status) {
            'Submitted' => $this->workflow->submit($record, $who),
            'Approved' => $this->workflow->approve($record, $who),
            'Rejected' => $this->workflow->reject($record, $who, $reason),
            'Draft' => $this->workflow->reopen($record, $who, $reason),
        };

        AuditClient::record(
            'timesheet.status_changed',
            'Timesheet',
            $updated->id,
            actor: $user?->name,
            actorId: $user?->employee_id,
            before: $before,
            after: $updated->toApiArray(),
            meta: ['status' => $status, 'employeeId' => $updated->employee_id, 'reason' => $reason ?: null],
        );

        $this->notify($updated, $status, $reason);

        return response()->json(['data' => $this->present(collect([$updated]))[0]]);
    }

    /**
     * Send approved timesheets to payroll: returns them and marks them as sent, so the same week is never
     * paid twice. Body: from / to (week start dates, optional), ids (optional, to send specific ones).
     */
    public function payrollExport(Request $request): JsonResponse
    {
        $request->validate([
            'from' => 'nullable|date',
            'to' => 'nullable|date',
            'ids' => 'nullable|array',
            'ids.*' => 'string',
        ]);

        $sheets = Timesheet::where('status', 'Approved')->whereNull('exported_at')
            ->when($request->filled('from'), fn ($q) => $q->where('week_start', '>=', $request->input('from')))
            ->when($request->filled('to'), fn ($q) => $q->where('week_start', '<=', $request->input('to')))
            ->when($request->filled('ids'), fn ($q) => $q->whereIn('id', $request->input('ids')))
            ->orderBy('week_start')->orderBy('employee_name')
            ->get();

        if ($sheets->isEmpty()) {
            return response()->json(['message' => 'There are no approved timesheets waiting to be sent to payroll.'], 422);
        }

        $by = $request->user()?->name ?: 'Workforce Admin';
        $this->workflow->markExported($sheets, $by);

        AuditClient::record(
            'timesheet.exported',
            'Timesheet',
            'batch',
            actor: $request->user()?->name,
            meta: ['count' => $sheets->count(), 'ids' => $sheets->pluck('id')->all()],
        );

        return response()->json(['data' => $this->present(Timesheet::whereIn('id', $sheets->pluck('id'))->orderBy('week_start')->orderBy('employee_name')->get())]);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $record = Timesheet::find($id);
        if (! $record) {
            return response()->json(['message' => 'Timesheet not found'], 404);
        }

        if (in_array($record->status, ['Submitted', 'Approved'], true)) {
            return response()->json(['message' => 'A submitted or approved timesheet cannot be deleted. Reopen it first.'], 409);
        }

        AuditClient::record(
            'timesheet.deleted',
            'Timesheet',
            $record->id,
            actor: $request->user()?->name,
            before: $record->toApiArray(),
            meta: ['employeeId' => $record->employee_id],
        );

        $record->delete();

        return response()->json(['success' => true]);
    }

    // ------------------------------------------------------------------------------------------------

    /** @param Collection<int, Timesheet> $records */
    private function present(Collection $records): array
    {
        $flags = $this->workflow->flagsFor($records);

        return $records->map(fn (Timesheet $t) => $this->workflow->present($t, $flags[$t->id] ?? []))->values()->all();
    }

    private function notify(Timesheet $t, string $status, string $reason): void
    {
        $week = $t->week_start->format('M d').' – '.$t->week_end->format('M d');

        if ($status === 'Submitted') {
            NotificationService::notifyAdmins(
                'timesheet_submitted',
                'Timesheet Submitted',
                "{$t->employee_name} submitted a timesheet for the week of {$week}.",
                'medium',
                '/timesheets'
            );

            return;
        }

        [$type, $title, $message] = match ($status) {
            'Approved' => ['timesheet_approved', 'Timesheet Approved', "Your timesheet for the week of {$week} has been approved."],
            'Rejected' => ['timesheet_rejected', 'Timesheet Rejected', "Your timesheet for the week of {$week} was rejected: {$reason}"],
            default => ['timesheet_rejected', 'Timesheet Reopened', "Your timesheet for the week of {$week} was reopened for correction: {$reason}"],
        };

        NotificationService::notifyEmployee($t->employee_id, $type, $title, $message, 'medium', '/my-timesheet');
    }
}
