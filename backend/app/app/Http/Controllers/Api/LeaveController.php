<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\LeaveType;
use App\Services\AuditLogger;
use App\Services\LeaveEligibility;
use App\Services\LeaveLedger;
use App\Services\LeavePayResolver;
use App\Services\WorkingDays;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\Rule;
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

        // No employee to read a ledger for yet - zero balances for every balance-requiring type,
        // rather than guessing at a default total (there is no such thing anymore; balance is
        // entirely ledger-accrued).
        $data = LeaveType::where('requires_balance', true)->where('active', true)->get()
            ->map(fn (LeaveType $type) => ['type' => $type->code, 'total' => 0.0, 'used' => 0.0, 'remaining' => 0.0])
            ->values()->all();

        return response()->json(['data' => $data]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = Leave::apiFillable($request->validate([
            'employeeId' => 'required|string|max:20',
            'employeeName' => 'required|string|max:150',
            'leaveType' => ['required', 'string', 'max:50', Rule::in(Employee::leaveTypes())],
            'startDate' => 'required|date',
            'endDate' => 'required|date',
            'reason' => 'required|string',
            'status' => 'required|string|max:50',
            'appliedDate' => 'required|date',
            'approvedBy' => 'nullable|string|max:150',
            'comments' => 'nullable|string',
            'documents' => 'nullable|array',
            'acceptSplit' => 'sometimes|boolean',
        ]));

        $acceptSplit = (bool) $request->input('acceptSplit', false);

        $this->assertSelfOrAdmin($request, $data['employee_id']);

        $type = LeaveType::where('code', $data['leave_type'])->first();
        $isAdmin = $request->user()?->role === 'Administrator';

        // An employee's request always starts Pending and unapproved, whatever the
        // request body says. Only an Administrator may create one already decided.
        if (! $isAdmin) {
            $data['status'] = 'Pending';
            $data['approved_by'] = null;

            $today = Carbon::now('Asia/Manila')->toDateString();
            $startDate = Carbon::parse($data['start_date'])->toDateString();
            $endDate = Carbon::parse($data['end_date'])->toDateString();

            if ($type && $type->locked_to_today) {
                // Nobody can plan ahead for this, and filing it after the fact defeats the point of
                // it: it has to be today, and only today - not a multi-day range starting today either.
                if ($startDate !== $today || $endDate !== $today) {
                    throw ValidationException::withMessages([
                        'startDate' => ["{$type->name} can only be filed for today ({$today}), for a single day."],
                    ]);
                }
            } elseif ($type && $type->retroactive_allowed) {
                // Nobody can predict needing this type - filed for today, the future, or the past
                // retroactive_window_days (the same latitude Overtime already allows, for the same reason).
                $earliestBackdate = Carbon::now('Asia/Manila')->subDays($type->retroactive_window_days)->toDateString();
                if ($startDate < $earliestBackdate) {
                    throw ValidationException::withMessages([
                        'startDate' => ["{$type->name} can only be filed for today, the future, or the past {$type->retroactive_window_days} day(s). Please contact HR for older dates."],
                    ]);
                }
            } elseif ($startDate < $today) {
                // Every other type still cannot start in the past. (An Administrator may still
                // record a past absence on someone's behalf.)
                throw ValidationException::withMessages([
                    'startDate' => ['Leave cannot start in the past. Choose today or a later date.'],
                ]);
            }

            if ($type && ! $type->locked_to_today && $type->advance_notice_days > 0) {
                // Planned time off is not a same-day decision - it needs lead time so the schedule
                // can actually absorb it.
                $earliestStart = Carbon::now('Asia/Manila')->addDays($type->advance_notice_days)->toDateString();
                if ($startDate < $earliestStart) {
                    throw ValidationException::withMessages([
                        'startDate' => ["{$type->name} must be filed at least {$type->advance_notice_days} day(s) before the start date."],
                    ]);
                }
            }

            if ($type) {
                $this->assertEligibleForType($data['employee_id'], $type);
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

        // Consecutive-day cap is measured in CALENDAR days (matches the statutory Maternity/
        // Paternity definitions), not working days - a 105-day maternity leave spans ~120+
        // calendar days once weekends are included, and that is the number being bounded.
        if ($type && $type->max_consecutive_days && $counted['calendarDays'] > $type->max_consecutive_days) {
            throw ValidationException::withMessages([
                'endDate' => ["{$type->name} cannot exceed {$type->max_consecutive_days} consecutive day(s)."],
            ]);
        }

        if ($type && $type->requires_proof && $counted['calendarDays'] > $type->proof_threshold_days && empty($data['documents'])) {
            throw ValidationException::withMessages([
                'documents' => ["{$type->name} requires supporting proof (e.g. a medical or death certificate) for a request of this length."],
            ]);
        }

        $payType = null;
        $paidDays = null;
        $unpaidDays = null;
        $employee = Employee::find($data['employee_id']);

        if ($type && $employee) {
            $resolved = LeavePayResolver::resolve($employee, $type, (float) $counted['days'], $acceptSplit);

            if ($resolved['requiresConsent']) {
                throw ValidationException::withMessages([
                    'leaveType' => ["Insufficient balance. Only {$resolved['balanceBefore']} day(s) of {$type->code} leave remaining, {$resolved['shortfall']} day(s) short. "
                        ."Resubmit with acceptSplit to take {$resolved['balanceBefore']} day(s) paid and {$resolved['shortfall']} day(s) unpaid, or choose different dates."],
                ]);
            }

            $payType = $resolved['payType'];
            $paidDays = $resolved['paidDays'];
            $unpaidDays = $resolved['unpaidDays'];
        }

        // No ledger write happens here - only at approval (see updateStatus()). The numbers below
        // are a snapshot, trusted as-is even if the balance moves before this is decided.
        $record = Leave::create([
            ...$data,
            'days' => $counted['days'],
            'pay_type' => $payType,
            'paid_days' => $paidDays,
            'unpaid_days' => $unpaidDays,
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
     * skipped (holidays, days off). The Leave form shows this as the person picks dates. When leaveTypeCode is
     * also given, the pay/split breakdown (LeavePayResolver) is merged in too - the same preview that would be
     * computed at submission time, shown live as the employee picks dates and a type, with no extra round trip.
     */
    public function workingDays(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employeeId' => 'required|string|max:20',
            'startDate' => 'required|date',
            'endDate' => 'required|date|after_or_equal:startDate',
            'leaveTypeCode' => 'sometimes|string|max:50',
        ]);
        $this->assertSelfOrAdmin($request, $data['employeeId']);

        $counted = (new WorkingDays())->count($data['employeeId'], $data['startDate'], $data['endDate']);

        if (! empty($data['leaveTypeCode'])) {
            $type = LeaveType::where('code', $data['leaveTypeCode'])->where('active', true)->first();
            $employee = Employee::find($data['employeeId']);
            if ($type && $employee) {
                $counted = [...$counted, ...LeavePayResolver::resolve($employee, $type, (float) $counted['days'], false)];
            }
        }

        return response()->json(['data' => $counted]);
    }

    /**
     * Type-specific eligibility, enforced only for an employee's own request - an Administrator may
     * still record any type on someone's behalf (e.g. logging a maternity leave already taken, or a
     * probationary employee's approved exception), the same latitude the past-date rule above gives.
     */
    private function assertEligibleForType(string $employeeId, LeaveType $type): void
    {
        $employee = Employee::find($employeeId);
        if (! $employee) {
            return;
        }

        $reasons = LeaveEligibility::ineligibilityReasons($employee, $type);
        if ($reasons !== []) {
            throw ValidationException::withMessages(['leaveType' => $reasons]);
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
            'leaveType' => ['sometimes', 'string', 'max:50', Rule::in(Employee::leaveTypes())],
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
        $employeeId = $data['employee_id'] ?? $record->employee_id;
        $leaveType = $data['leave_type'] ?? $record->leave_type;

        // Moving the dates or the type moves the cost: count the working days (and, for a still-
        // Approved request, the pay resolution) again.
        if (isset($data['start_date']) || isset($data['end_date']) || isset($data['leave_type'])) {
            $start = $data['start_date'] ?? $record->start_date->toDateString();
            $end = $data['end_date'] ?? $record->end_date->toDateString();
            if ($end < $start) {
                throw ValidationException::withMessages(['endDate' => ['The end date cannot be before the start date.']]);
            }
            $counted = (new WorkingDays())->count($employeeId, $start, $end);
            if ($counted['days'] < 1) {
                throw ValidationException::withMessages(['startDate' => ['These dates contain no working days (they fall on weekends, holidays or days off).']]);
            }
            $data['days'] = $counted['days'];

            $type = LeaveType::where('code', $leaveType)->first();
            $employee = Employee::find($employeeId);
            if ($type && $employee) {
                // Admin-only route - never needs the employee's split consent.
                $resolved = LeavePayResolver::resolve($employee, $type, (float) $counted['days'], true);
                $data['pay_type'] = $resolved['payType'];
                $data['paid_days'] = $resolved['paidDays'];
                $data['unpaid_days'] = $resolved['unpaidDays'];
            }
        }

        $wasApproved = $record->status === 'Approved';
        $record->update($data);

        // If this request was (and remains) Approved under PaidWithBalance, Leave::booted() already
        // reversed the OLD paid_days the moment leave_type/paid_days changed - write the new amount
        // back in so the ledger reflects the edited request instead of nothing.
        if ($wasApproved && $record->status === 'Approved' && $record->pay_type === 'PaidWithBalance'
            && (float) $record->paid_days > 0 && ($record->wasChanged('leave_type') || $record->wasChanged('paid_days'))) {
            LeaveLedger::write(
                $record->employee_id,
                $record->leave_type,
                'Usage',
                -(float) $record->paid_days,
                $record->id,
                null,
                $request->user()?->name ?? 'SYSTEM',
            );
        }

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
            'comments' => 'nullable|string|max:1000',
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

        // A rejection with no explanation leaves the employee (and whoever audits the decision later)
        // guessing why. Unlike approval, it is never self-evident, so it is the one decision that must
        // always carry a reason.
        $comments = trim((string) $request->input('comments', ''));
        if ($isAdmin && $status === 'Rejected' && mb_strlen($comments) < 5) {
            throw ValidationException::withMessages([
                'comments' => ['Please tell the employee why this leave request is being rejected (at least a few words).'],
            ]);
        }

        $record->update([
            'status' => $status,
            'approved_by' => $request->input('approvedBy', $record->approved_by),
            'comments' => $request->has('comments') ? ($comments ?: null) : $record->comments,
        ]);

        // Approving a PaidWithBalance request deducts from the ledger NOW, not at submission - the
        // paid/unpaid numbers were snapshotted at submission time and are trusted as-is, even if the
        // balance has since moved (re-resolving here would need a second, undesigned admin-side
        // consent flow). If the balance already can't cover it, the deduction still happens, but it's
        // flagged rather than hidden.
        $meta = ['status' => $status, 'employeeId' => $record->employee_id];
        if ($status === 'Approved' && $record->pay_type === 'PaidWithBalance' && (float) $record->paid_days > 0) {
            $balanceBefore = LeaveLedger::currentBalance($record->employee_id, $record->leave_type);
            if ($balanceBefore < (float) $record->paid_days) {
                $meta['balanceDriftDetected'] = true;
            }
            LeaveLedger::write(
                $record->employee_id,
                $record->leave_type,
                'Usage',
                -(float) $record->paid_days,
                $record->id,
                null,
                $request->user()?->name ?? 'SYSTEM',
            );
        }

        AuditLogger::record('timeoff',
            'leave.status_changed',
            'Leave',
            $record->id,
            actor: $request->user()?->name,
            actorId: $request->user()?->employee_id,
            after: $record->fresh()->toApiArray(),
            meta: $meta,
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
                "Your {$record->leave_type} leave (".$record->start_date->format('M d').' – '.$record->end_date->format('M d').') has been rejected: '.$record->comments,
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

    public function destroy(Request $request, string $id): JsonResponse
    {
        $record = Leave::find($id);
        if (! $record) {
            return response()->json(['message' => 'Leave request not found'], 404);
        }

        // The model's booted() hook only reverses a ledger deduction on save() - a hard delete
        // never fires it, so the credit-back has to happen explicitly here, before the row is gone.
        if ($record->status === 'Approved' && $record->pay_type === 'PaidWithBalance' && (float) $record->paid_days > 0) {
            LeaveLedger::write(
                $record->employee_id,
                $record->leave_type,
                'Adjustment',
                (float) $record->paid_days,
                $record->id,
                'Reversal: leave record deleted',
                $request->user()?->name ?? 'SYSTEM',
            );
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
