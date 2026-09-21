<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Http\Controllers\Controller;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use App\Services\NotificationService;
use App\Services\ShiftReplicationClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class ShiftController extends Controller
{
    use AuthorizesEmployeeScope, GeneratesSequentialIds;

    // A day where more than this share of active employees are on approved
    // leave gets flagged to HR as a staffing risk.
    private const SHORTAGE_THRESHOLD = 0.2;

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

        return response()->json(['data' => $record->toApiArray()], 201);
    }

    /**
     * Bulk-generate the recurring schedule for a date range instead of HR
     * creating one row per employee per day by hand. Skips employees who
     * already have a schedule for that date, and skips employees with an
     * approved leave covering that date. Flags any date where too large a
     * share of the active workforce is on leave.
     */
    public function generateSchedule(Request $request): JsonResponse
    {
        $data = $request->validate([
            'startDate' => 'required|date',
            'endDate' => 'required|date|after_or_equal:startDate',
            'shiftId' => 'required|string|max:20|exists:shift_definitions,id',
            'employeeIds' => 'nullable|array',
            'employeeIds.*' => 'string|max:20',
            'skipWeekends' => 'nullable|boolean',
        ]);

        $skipWeekends = $data['skipWeekends'] ?? true;

        $employees = filled($data['employeeIds'] ?? null)
            ? Employee::whereIn('id', $data['employeeIds'])->get()
            : Employee::where('status', '!=', 'Inactive')->get();

        if ($employees->isEmpty()) {
            return response()->json(['data' => [
                'created' => 0, 'skippedExisting' => 0, 'skippedOnLeave' => 0, 'shortageDates' => [],
            ]]);
        }

        $start = Carbon::parse($data['startDate'])->startOfDay();
        $end = Carbon::parse($data['endDate'])->startOfDay();

        $existingDates = ShiftSchedule::whereIn('employee_id', $employees->pluck('id'))
            ->whereBetween('date', [$start->toDateString(), $end->toDateString()])
            ->get(['employee_id', 'date'])
            ->map(fn ($s) => $s->employee_id.'|'.$s->date->toDateString())
            ->flip();

        $approvedLeaves = Leave::whereIn('employee_id', $employees->pluck('id'))
            ->where('status', 'Approved')
            ->where('start_date', '<=', $end->toDateString())
            ->where('end_date', '>=', $start->toDateString())
            ->get(['employee_id', 'start_date', 'end_date']);

        $created = 0;
        $skippedExisting = 0;
        $skippedOnLeave = 0;
        $employeesScheduled = []; // employee_id => count of new shifts
        $shortageDates = [];
        $createdIds = [];

        for ($day = $start->copy(); $day->lte($end); $day->addDay()) {
            if ($skipWeekends && $day->isWeekend()) {
                continue;
            }
            $dateKey = $day->toDateString();
            $onLeaveToday = 0;

            foreach ($employees as $employee) {
                $onLeave = $approvedLeaves->contains(fn ($l) => $l->employee_id === $employee->id
                    && $l->start_date->toDateString() <= $dateKey
                    && $l->end_date->toDateString() >= $dateKey);

                if ($onLeave) {
                    $onLeaveToday++;
                    $skippedOnLeave++;
                    continue;
                }

                if ($existingDates->has($employee->id.'|'.$dateKey)) {
                    $skippedExisting++;
                    continue;
                }

                try {
                    $newSchedule = ShiftSchedule::create([
                        'id' => $this->nextIdFor(ShiftSchedule::class, 'SCH'),
                        'employee_id' => $employee->id,
                        'employee_name' => trim($employee->first_name.' '.$employee->last_name),
                        'shift_id' => $data['shiftId'],
                        'date' => $dateKey,
                        'status' => 'Scheduled',
                    ]);
                } catch (\Illuminate\Database\UniqueConstraintViolationException) {
                    // Someone else scheduled this person for this day a moment ago.
                    $skippedExisting++;
                    continue;
                }
                $createdIds[] = $newSchedule->id;
                $created++;
                $employeesScheduled[$employee->id] = ($employeesScheduled[$employee->id] ?? 0) + 1;
            }

            if ($employees->count() > 0 && ($onLeaveToday / $employees->count()) > self::SHORTAGE_THRESHOLD) {
                $shortageDates[] = $dateKey;
                $alreadyFlagged = \App\Models\Notification::where('type', 'staff_shortage')
                    ->whereDate('timestamp', now())
                    ->where('message', 'like', "%{$dateKey}%")
                    ->exists();
                if (! $alreadyFlagged) {
                    NotificationService::notifyAdmins(
                        'staff_shortage',
                        'Possible Staffing Shortage',
                        "{$onLeaveToday} of {$employees->count()} employees are on approved leave on ".Carbon::parse($dateKey)->format('M d, Y').'.',
                        'high',
                        '/shifts'
                    );
                }
            }
        }

        foreach ($employeesScheduled as $employeeId => $count) {
            $employee = $employees->firstWhere('id', $employeeId);
            NotificationService::notifyEmployee(
                $employeeId,
                'shift_assigned',
                'Schedule Generated',
                "You've been scheduled {$start->format('M d')} – {$end->format('M d, Y')} ({$count} shift".($count === 1 ? '' : 's').').',
                'low',
                '/my-schedule'
            );
        }

        ShiftReplicationClient::pushSchedules($createdIds);

        return response()->json(['data' => [
            'created' => $created,
            'skippedExisting' => $skippedExisting,
            'skippedOnLeave' => $skippedOnLeave,
            'shortageDates' => array_values(array_unique($shortageDates)),
        ]]);
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

        $record->update($data);

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

    public function destroySchedule(string $id): JsonResponse
    {
        $record = ShiftSchedule::find($id);
        if (! $record) {
            return response()->json(['message' => 'Shift schedule not found'], 404);
        }

        $record->delete();

        return response()->json(['success' => true]);
    }
}
