<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Http\Controllers\Controller;
use App\Models\Leave;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use App\Services\AuditClient;
use App\Services\NotificationService;
use App\Services\ScheduleGenerator;
use App\Services\ShiftReplicationClient;
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

        ShiftReplicationClient::pushSchedules([$record->id]);
        AuditClient::record('schedule.created', 'ShiftSchedule', $record->id, actor: $request->user()?->name, after: $record->toApiArray(), meta: ['employeeId' => $record->employee_id]);

        return response()->json(['data' => $record->toApiArray()], 201);
    }

    /**
     * Generate schedules for a date range. With `preview: true` nothing is created: the answer says what WOULD
     * be created and what would be skipped and why. Without it the schedules are created and recorded as a
     * batch that can be undone. The rules (work patterns, holidays, leave, existing shifts, coverage) live in
     * ScheduleGenerator, shared with the automatic weekly job.
     */
    public function generateSchedule(Request $request, ScheduleGenerator $generator): JsonResponse
    {
        $data = $request->validate([
            'startDate' => 'required|date',
            'endDate' => 'required|date|after_or_equal:startDate',
            'shiftId' => 'required|string|max:20|exists:shift_definitions,id',
            'employeeIds' => 'nullable|array',
            'employeeIds.*' => 'string|max:20',
            'skipWeekends' => 'nullable|boolean',
            'preview' => 'nullable|boolean',
        ]);

        $plan = $generator->plan($data['startDate'], $data['endDate'], $data['shiftId'], $data['employeeIds'] ?? null, (bool) ($data['skipWeekends'] ?? true));

        if ($request->boolean('preview')) {
            return response()->json(['data' => $generator->summary($plan) + ['preview' => true, 'sample' => array_slice($plan['rows'], 0, 60)]]);
        }

        return response()->json(['data' => $generator->commit($plan, 'manual', $request->user()?->name ?: 'Workforce Admin')]);
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
        AuditClient::record('schedule.updated', 'ShiftSchedule', $record->id, actor: $request->user()?->name, before: $before, after: $record->fresh()->toApiArray(), meta: ['employeeId' => $record->employee_id]);

        NotificationService::notifyEmployee(
            $record->employee_id,
            'schedule_change',
            'Schedule Updated',
            'Your shift schedule for '.$record->date->format('M d, Y').' has been updated.',
            'low',
            '/my-schedule'
        );

        ShiftReplicationClient::pushSchedules([$record->id]);

        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    public function destroySchedule(Request $request, string $id): JsonResponse
    {
        $record = ShiftSchedule::find($id);
        if (! $record) {
            return response()->json(['message' => 'Shift schedule not found'], 404);
        }

        AuditClient::record('schedule.deleted', 'ShiftSchedule', $record->id, actor: $request->user()?->name, before: $record->toApiArray(), meta: ['employeeId' => $record->employee_id]);
        $record->delete();

        return response()->json(['success' => true]);
    }
}
