<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Leave;
use App\Models\ShiftSchedule;
use App\Models\Timesheet;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use App\Services\TimesheetWorkflow;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
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

    /**
     * A Draft timesheet is still the employee's own in-progress week - not yet submitted, and not
     * the admin's to look at. A panel review called this out directly: the admin seeing live,
     * unfinished hours before the employee has chosen to submit them reads as unfair. Every method
     * below that the admin can browse (index, byEmployee, show) excludes Draft rows for them; the
     * employee viewing their own timesheet is unaffected.
     */
    public function index(Request $request): JsonResponse
    {
        $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date']);

        $records = Timesheet::where('status', '!=', 'Draft')
            ->when($request->filled('from'), fn ($q) => $q->where('week_start', '>=', $request->input('from')))
            ->when($request->filled('to'), fn ($q) => $q->where('week_start', '<=', $request->input('to')))
            ->orderBy('week_end', 'desc')->orderBy('id')->get();

        return response()->json(['data' => $this->present($records)]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $record = Timesheet::find($id);
        if (! $record) {
            return response()->json(['message' => 'Timesheet not found'], 404);
        }

        $this->assertSelfOrAdmin($request, $record->employee_id);

        $isAdmin = $request->user()?->role === 'Administrator';
        if ($isAdmin && $record->status === 'Draft') {
            return response()->json(['message' => 'Timesheet not found'], 404);
        }

        return response()->json(['data' => $this->present(collect([$record]))[0]]);
    }

    public function byEmployee(Request $request, string $employeeId): JsonResponse
    {
        $this->assertSelfOrAdmin($request, $employeeId);
        $request->validate(['from' => 'nullable|date', 'to' => 'nullable|date']);

        $isAdmin = $request->user()?->role === 'Administrator';
        $records = Timesheet::where('employee_id', $employeeId)
            ->when($isAdmin, fn ($q) => $q->where('status', '!=', 'Draft'))
            ->when($request->filled('from'), fn ($q) => $q->where('week_start', '>=', $request->input('from')))
            ->when($request->filled('to'), fn ($q) => $q->where('week_start', '<=', $request->input('to')))
            ->orderBy('week_end', 'desc')->get();

        return response()->json(['data' => $this->present($records)]);
    }

    /**
     * One row per calendar day in [from, to] for the day grid: the scheduled shift (if any), the
     * actual attendance for that day (if any), and whether it was a leave day - everything the grid
     * needs to show Scheduled vs. Reported side by side without the frontend assembling it from three
     * separate fetches itself. Read-only: this is a view over Attendance/ShiftSchedule/Leave, never a
     * place that writes to any of them.
     */
    public function days(Request $request, string $employeeId): JsonResponse
    {
        $this->assertSelfOrAdmin($request, $employeeId);
        $range = $request->validate([
            'from' => 'required|date_format:Y-m-d',
            'to' => 'required|date_format:Y-m-d',
        ]);

        $attendanceByDate = Attendance::where('employee_id', $employeeId)
            ->whereBetween('date', [$range['from'], $range['to']])
            ->get()->keyBy(fn (Attendance $a) => $a->date->toDateString());

        $scheduleByDate = ShiftSchedule::with('shift')
            ->where('employee_id', $employeeId)
            ->where('status', '!=', 'Cancelled')
            ->whereBetween('date', [$range['from'], $range['to']])
            ->get()->keyBy(fn (ShiftSchedule $s) => $s->date->toDateString());

        // Any day inside an Approved leave counts as a leave day, not just the leave's own
        // start/end - a 5-day Vacation spans several attendance-less days in between.
        $leaves = Leave::where('employee_id', $employeeId)
            ->where('status', 'Approved')
            ->where('start_date', '<=', $range['to'])
            ->where('end_date', '>=', $range['from'])
            ->get(['leave_type', 'start_date', 'end_date']);

        $days = [];
        for ($d = Carbon::parse($range['from']); $d->toDateString() <= $range['to']; $d->addDay()) {
            $dateKey = $d->toDateString();
            $attendance = $attendanceByDate->get($dateKey);
            $schedule = $scheduleByDate->get($dateKey);
            $leave = $leaves->first(fn (Leave $l) => $dateKey >= $l->start_date->toDateString() && $dateKey <= $l->end_date->toDateString());

            $days[] = [
                'date' => $dateKey,
                'scheduledStart' => $schedule?->shift?->start_time,
                'scheduledEnd' => $schedule?->shift?->end_time,
                'shiftId' => $schedule?->shift_id,
                'leaveType' => $leave?->leave_type,
                'attendance' => $attendance?->toApiArray(),
            ];
        }

        return response()->json(['data' => $days]);
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

        AuditLogger::record('payroll', 
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
     *   employee (owner): status = Submitted, or Draft (= withdraw their own still-unreviewed
     *                      submission, no reason needed - distinct from the admin's reopen below)
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
        $who = $user?->name ?: ($isAdmin ? 'HR Admin' : 'Employee');
        $reason = (string) $request->input('reason', '');

        if (! $isAdmin) {
            // Employees may only act on their own timesheet, and only to submit it or withdraw
            // their own still-unreviewed submission - nothing else.
            if ($user?->employee_id !== $record->employee_id || ! in_array($status, ['Submitted', 'Draft'], true)) {
                abort(403, 'You are not authorized to perform this action.');
            }
        } elseif ($status === 'Submitted') {
            abort(403, 'Only the employee can submit their own timesheet.');
        }

        $before = $record->toApiArray();
        $updated = match (true) {
            $status === 'Submitted' => $this->workflow->submit($record, $who),
            $status === 'Approved' => $this->workflow->approve($record, $who),
            $status === 'Rejected' => $this->workflow->reject($record, $who, $reason),
            $status === 'Draft' && $isAdmin => $this->workflow->reopen($record, $who, $reason),
            default => $this->workflow->withdraw($record, $who),
        };

        AuditLogger::record('payroll',
            'timesheet.status_changed',
            'Timesheet',
            $updated->id,
            actor: $user?->name,
            actorId: $user?->employee_id,
            before: $before,
            after: $updated->toApiArray(),
            meta: ['status' => $status, 'employeeId' => $updated->employee_id, 'reason' => $reason ?: null],
        );

        // A self-withdraw is the employee undoing their own not-yet-reviewed action - nobody else
        // saw it happen (it never became visible to admins while still Submitted-but-unreviewed in
        // this flow) and the employee does not need to be told about their own click.
        if (! ($status === 'Draft' && ! $isAdmin)) {
            $this->notify($updated, $status, $reason);
        }

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

        $by = $request->user()?->name ?: 'HR Admin';
        $this->workflow->markExported($sheets, $by);

        AuditLogger::record('payroll', 
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

        AuditLogger::record('payroll', 
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
                "{$t->employee_name} submitted a timesheet for the pay period of {$week}.",
                'medium',
                '/timesheets'
            );

            return;
        }

        [$type, $title, $message] = match ($status) {
            'Approved' => ['timesheet_approved', 'Timesheet Approved', "Your timesheet for the pay period of {$week} has been approved."],
            'Rejected' => ['timesheet_rejected', 'Timesheet Rejected', "Your timesheet for the pay period of {$week} was rejected: {$reason}"],
            default => ['timesheet_rejected', 'Timesheet Reopened', "Your timesheet for the pay period of {$week} was reopened for correction: {$reason}"],
        };

        NotificationService::notifyEmployee($t->employee_id, $type, $title, $message, 'medium', '/my-timesheet');
    }
}
