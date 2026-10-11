<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ShiftController extends Controller
{
    use AuthorizesEmployeeScope, GeneratesSequentialIds;

    public function definitions(): JsonResponse
    {
        return response()->json([
            'data' => ShiftDefinition::orderBy('id')->get()->map->toApiArray()->values(),
        ]);
    }

    public function schedules(): JsonResponse
    {
        $records = ShiftSchedule::orderBy('date', 'desc')->orderBy('id')->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    public function schedulesByEmployee(Request $request, string $employeeId): JsonResponse
    {
        $this->assertSelfOrAdmin($request, $employeeId);

        $records = ShiftSchedule::where('employee_id', $employeeId)
            ->orderBy('date', 'desc')
            ->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    public function createSchedule(Request $request): JsonResponse
    {
        $data = ShiftSchedule::apiFillable($request->validate([
            'employeeId' => 'required|string|max:20',
            'employeeName' => 'required|string|max:150',
            'shiftId' => 'required|string|max:20|exists:shift_definitions,id',
            'date' => 'required|date',
            'status' => 'required|string|max:50',
        ]));

        // One shift per employee per day. A second assignment for the same day is
        // a duplicate (typically a double click) - refuse it and say where it is.
        $existing = ShiftSchedule::where('employee_id', $data['employee_id'])
            ->whereDate('date', $data['date'])
            ->first();
        if ($existing) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'date' => [$data['employee_name'].' already has a shift ('.$existing->id.') on '
                    .\Carbon\Carbon::parse($data['date'])->format('M j, Y').'. Edit or delete it instead of adding another.'],
            ]);
        }

        $this->assertNotOnApprovedLeave($data['employee_id'], $data['date'], $data['employee_name'] ?? null);

        try {
            $record = ShiftSchedule::create([
                ...$data,
                'id' => $this->nextIdFor(ShiftSchedule::class, 'SCH'),
            ]);
        } catch (\Illuminate\Database\UniqueConstraintViolationException) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'date' => [$data['employee_name'].' already has a shift on '.\Carbon\Carbon::parse($data['date'])->format('M j, Y').'. Edit or delete it instead of adding another.'],
            ]);
        }

        $definition = ShiftDefinition::find($record->shift_id);
        NotificationService::notifyEmployee(
            $record->employee_id,
            'shift_assigned',
            'Shift Assigned',
            "You have been assigned a new shift (".($definition->name ?? $record->shift_id).') on '.$record->date->format('M d, Y').'.',
            'low',
            '/my-schedule'
        );

        AuditLogger::record('scheduling', 'schedule.created', 'ShiftSchedule', $record->id, actor: $request->user()?->name, after: $record->toApiArray(), meta: ['employeeId' => $record->employee_id]);

        return response()->json(['data' => $record->toApiArray()], 201);
    }

    /**
     * Assign the same shift, on the same day, to several employees at once - replaces the automated
     * scheduler (a panel review called it unnecessary busywork when the shift is always the Standard
     * Shift anyway: easier to just let HR tick everyone who needs it and assign once).
     *
     * Each employee is checked independently; one person's conflict (already has a shift, or is on
     * approved leave that day) skips only them rather than failing the whole batch, and the skipped
     * list says why.
     */
    public function createScheduleBulk(Request $request): JsonResponse
    {
        $data = $request->validate([
            'employeeIds' => 'required|array|min:1|max:500',
            'employeeIds.*' => 'required|string|max:20',
            'shiftId' => 'required|string|max:20|exists:shift_definitions,id',
            'date' => 'required|date',
            'status' => 'required|string|max:50',
        ]);

        $employees = Employee::whereIn('id', $data['employeeIds'])->get(['id', 'first_name', 'last_name'])->keyBy('id');
        $definition = ShiftDefinition::find($data['shiftId']);
        $scheduledDate = Carbon::parse($data['date'])->toDateString();

        // Already-scheduled and already-on-leave people for this one day, fetched once rather than
        // once per employee in the loop below.
        $alreadyScheduled = ShiftSchedule::whereDate('date', $scheduledDate)
            ->whereIn('employee_id', $data['employeeIds'])
            ->pluck('employee_id')->flip();
        $onApprovedLeave = Leave::where('status', 'Approved')
            ->whereIn('employee_id', $data['employeeIds'])
            ->whereDate('start_date', '<=', $scheduledDate)
            ->whereDate('end_date', '>=', $scheduledDate)
            ->get(['employee_id', 'leave_type'])->keyBy('employee_id');

        $created = [];
        $skipped = [];

        foreach ($data['employeeIds'] as $employeeId) {
            $employee = $employees->get($employeeId);
            $employeeName = $employee ? trim($employee->first_name.' '.$employee->last_name) : $employeeId;

            if (! $employee) {
                $skipped[] = ['employeeId' => $employeeId, 'employeeName' => $employeeName, 'reason' => 'Employee not found.'];
            } elseif ($alreadyScheduled->has($employeeId)) {
                $skipped[] = ['employeeId' => $employeeId, 'employeeName' => $employeeName, 'reason' => 'Already has a shift that day.'];
            } elseif ($onApprovedLeave->has($employeeId)) {
                $skipped[] = ['employeeId' => $employeeId, 'employeeName' => $employeeName, 'reason' => 'On approved '.$onApprovedLeave[$employeeId]->leave_type.' leave that day.'];
            } else {
                try {
                    $record = ShiftSchedule::create([
                        'id' => $this->nextIdFor(ShiftSchedule::class, 'SCH'),
                        'employee_id' => $employeeId,
                        'employee_name' => $employeeName,
                        'shift_id' => $data['shiftId'],
                        'date' => $scheduledDate,
                        'status' => $data['status'],
                    ]);
                } catch (\Illuminate\Database\UniqueConstraintViolationException) {
                    $skipped[] = ['employeeId' => $employeeId, 'employeeName' => $employeeName, 'reason' => 'Already has a shift that day.'];
                    continue;
                }

                AuditLogger::record('scheduling', 'schedule.created', 'ShiftSchedule', $record->id,
                    actor: $request->user()?->name, after: $record->toApiArray(),
                    meta: ['employeeId' => $employeeId, 'bulk' => true]);

                NotificationService::notifyEmployee(
                    $employeeId,
                    'shift_assigned',
                    'Shift Assigned',
                    'You have been assigned a new shift ('.($definition->name ?? $data['shiftId']).') on '.Carbon::parse($scheduledDate)->format('M d, Y').'.',
                    'low',
                    '/my-schedule'
                );

                $created[] = $record->toApiArray();
            }
        }

        if (count($created) === 0) {
            return response()->json([
                'message' => 'Nothing could be saved: every selected employee already has a conflict for this day.',
                'data' => ['created' => $created, 'skipped' => $skipped],
            ], 422);
        }

        return response()->json(['data' => ['created' => $created, 'skipped' => $skipped]], 201);
    }

    /**
     * Nobody can be scheduled for a day they are on approved leave - they could not clock in
     * anyway (the kiosk refuses), so the schedule would only create a false 'no-show'.
     * (Generating a whole range already skips leave days on its own.)
     */
    private function assertNotOnApprovedLeave(string $employeeId, string $date, ?string $name = null): void
    {
        $leave = Leave::where('employee_id', $employeeId)
            ->where('status', 'Approved')
            ->whereDate('start_date', '<=', $date)
            ->whereDate('end_date', '>=', $date)
            ->first();

        if ($leave) {
            throw \Illuminate\Validation\ValidationException::withMessages([
                'date' => [($name ?: $employeeId).' is on approved '.$leave->leave_type.' leave ('.$leave->start_date->format('M j').' - '.$leave->end_date->format('M j, Y').') on '.Carbon::parse($date)->format('M j, Y').', so a shift cannot be scheduled for that day.'],
            ]);
        }
    }

    public function updateSchedule(Request $request, string $id): JsonResponse
    {
        $record = ShiftSchedule::find($id);
        if (! $record) {
            return response()->json(['message' => 'Shift schedule not found'], 404);
        }

        $data = ShiftSchedule::apiFillable($request->validate([
            'employeeId' => 'sometimes|string|max:20',
            'employeeName' => 'sometimes|string|max:150',
            'shiftId' => 'sometimes|string|max:20',
            'date' => 'sometimes|date',
            'status' => 'sometimes|string|max:50',
        ]));

        // Moving a shift onto another day or person is a new assignment: the same leave rule applies.
        $newEmployee = $data['employee_id'] ?? $record->employee_id;
        $newDate = isset($data['date']) ? Carbon::parse($data['date'])->toDateString() : $record->date->toDateString();
        if ($newEmployee !== $record->employee_id || $newDate !== $record->date->toDateString()) {
            $this->assertNotOnApprovedLeave($newEmployee, $newDate, $data['employee_name'] ?? $record->employee_name);
        }

        $before = $record->toApiArray();
        $record->update($data);
        AuditLogger::record('scheduling', 'schedule.updated', 'ShiftSchedule', $record->id, actor: $request->user()?->name, before: $before, after: $record->fresh()->toApiArray(), meta: ['employeeId' => $record->employee_id]);

        NotificationService::notifyEmployee(
            $record->employee_id,
            'schedule_change',
            'Schedule Updated',
            'Your shift schedule for '.$record->date->format('M d, Y').' has been updated.',
            'low',
            '/my-schedule'
        );


        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    public function destroySchedule(Request $request, string $id): JsonResponse
    {
        $record = ShiftSchedule::find($id);
        if (! $record) {
            return response()->json(['message' => 'Shift schedule not found'], 404);
        }

        AuditLogger::record('scheduling', 'schedule.deleted', 'ShiftSchedule', $record->id, actor: $request->user()?->name, before: $record->toApiArray(), meta: ['employeeId' => $record->employee_id]);
        $record->delete();

        return response()->json(['success' => true]);
    }
}
