<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Notification;
use App\Models\ShiftSchedule;
use App\Services\ShiftHours;
use App\Services\AttendanceAlerts;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use App\Services\OvertimeReconciliationService;
use App\Services\TimesheetGenerationService;
use App\Services\SystemSettings;
use App\Support\LocalTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AttendanceController extends Controller
{
    use AuthorizesEmployeeScope, GeneratesSequentialIds;

    /**
     * Raise any attendance alerts that are due now (see AttendanceAlerts). The scheduler already does this every
     * minute; the dashboard calls it too, so an admin opening it sees an up-to-date bell straight away.
     */
    public function checkAlerts(): JsonResponse
    {
        return response()->json(['data' => app(AttendanceAlerts::class)->scan()]);
    }

    public function index(Request $request): JsonResponse
    {
        // Optional window (?from=YYYY-MM-DD&to=YYYY-MM-DD) so screens that only
        // need recent days don't download the whole history. No params = everything.
        $range = $request->validate([
            'from' => 'nullable|date_format:Y-m-d',
            'to' => 'nullable|date_format:Y-m-d',
        ]);

        $records = Attendance::query()
            ->when($range['from'] ?? null, fn ($q, $from) => $q->where('date', '>=', $from))
            ->when($range['to'] ?? null, fn ($q, $to) => $q->where('date', '<=', $to))
            ->orderBy('date', 'desc')->orderBy('id')->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    public function show(string $id): JsonResponse
    {
        $record = Attendance::find($id);
        if (! $record) {
            return response()->json(['message' => 'Attendance record not found'], 404);
        }

        return response()->json(['data' => $record->toApiArray()]);
    }

    public function byEmployee(Request $request, string $employeeId): JsonResponse
    {
        $this->assertSelfOrAdmin($request, $employeeId);

        $records = Attendance::where('employee_id', $employeeId)
            ->orderBy('date', 'desc')
            ->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    /**
     * Self-serve "time to clock out" nudge, fired by the employee's shift
     * timer once it reaches zero. Only works while they're still clocked in
     * today, and only one reminder per employee per day to avoid spam.
     */
    public function remindClockOut(Request $request): JsonResponse
    {
        $employeeId = $request->user()?->employee_id;
        if (! $employeeId) {
            return response()->json(['message' => 'You are not authorized to access this resource.'], 403);
        }

        $today = LocalTime::today()->toDateString();

        $active = Attendance::where('employee_id', $employeeId)
            ->where('date', $today)
            ->whereNotNull('clock_in')
            ->whereNull('clock_out')
            ->first();

        if (! $active) {
            return response()->json(['data' => ['created' => false]]);
        }

        $alreadySent = Notification::where('type', 'clock_out_reminder')
            ->where('employee_id', $employeeId)
            ->where('timestamp', '>=', LocalTime::today()->utc())
            ->exists();

        if ($alreadySent) {
            return response()->json(['data' => ['created' => false, 'alreadySent' => true]]);
        }

        NotificationService::notifyEmployee(
            $employeeId,
            'clock_out_reminder',
            'Time to Clock Out',
            'Your shift has ended. Please clock out now so your hours are recorded.',
            'high',
            '/attendance'
        );

        return response()->json(['data' => ['created' => true]]);
    }

    public function byDate(string $date): JsonResponse
    {
        $records = Attendance::where('date', $date)->orderBy('id')->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = Attendance::apiFillable($request->validate([
            'employeeId' => 'required|string|max:20',
            'date' => 'required|date',
            'clockIn' => 'nullable',
            'clockOut' => 'nullable',
            'status' => 'required|string|max:50',
            'overtime' => 'nullable|numeric',
            'regularHours' => 'nullable|numeric',
            'totalHours' => 'nullable|numeric',
            'breakHours' => 'nullable|numeric',
            'location' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
        ]));

        $duplicateMessage = ['date' => ['This employee already has an attendance record for that date (it may have been recorded automatically as Absent). Correct that record instead of adding another.']];
        if (Attendance::where('employee_id', $data['employee_id'])->whereDate('date', $data['date'])->exists()) {
            throw \Illuminate\Validation\ValidationException::withMessages($duplicateMessage);
        }

        try {
            $record = Attendance::create([
                ...$data,
                'id' => $this->nextIdFor(Attendance::class, 'ATT'),
            ]);
        } catch (\Illuminate\Database\UniqueConstraintViolationException) {
            // Lost a race with a simultaneous request - the database refused the duplicate.
            throw \Illuminate\Validation\ValidationException::withMessages($duplicateMessage);
        }

        $this->syncTimesheets($record->employee_id, $record->date);
        NotificationService::retractNoShowAlert($record->employee_id);
        $this->notifyIfLate($record);

        return response()->json(['data' => $record->toApiArray()], 201);
    }

    private function notifyIfLate(Attendance $record): void
    {
        if ($record->status !== 'Late') {
            return;
        }

        $employee = Employee::find($record->employee_id);
        $name = $employee ? trim($employee->first_name.' '.$employee->last_name) : $record->employee_id;

        NotificationService::notifyAdmins(
            'attendance_late',
            'Late Arrival',
            "{$name} clocked in late on ".$record->date->format('M d, Y').(($record->clock_in) ? ' at '.$record->clock_in : '').'.',
            'medium',
            '/attendance'
        );
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $record = Attendance::find($id);
        if (! $record) {
            return response()->json(['message' => 'Attendance record not found'], 404);
        }

        $before = $record->toApiArray();

        $data = Attendance::apiFillable($request->validate([
            'employeeId' => 'sometimes|string|max:20',
            'date' => 'sometimes|date',
            'clockIn' => 'nullable',
            'clockOut' => 'nullable',
            'status' => 'sometimes|string|max:50',
            'overtime' => 'nullable|numeric',
            'regularHours' => 'nullable|numeric',
            'totalHours' => 'nullable|numeric',
            'breakHours' => 'nullable|numeric',
            'location' => 'nullable|string|max:100',
            'notes' => 'nullable|string',
        ]));

        $record->update($this->withCountedHours($record, $data));

        $user = $request->user();
        AuditLogger::record('attendance', 
            'attendance.punch_corrected',
            'Attendance',
            $record->id,
            actor: $user?->name,
            actorId: $user?->employee_id,
            before: $before,
            after: $record->fresh()->toApiArray(),
            meta: ['id' => $record->id, 'date' => $record->date->toDateString()],
        );

        $this->syncTimesheets($record->employee_id, $record->date);

        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    /**
     * When a punch is corrected, the SERVER counts the hours again from the shift (same rule as the kiosk: only to
     * the end of the shift plus approved overtime, lunch by duration) instead of trusting the numbers sent with it.
     * Fixes a day recorded automatically as Absent: give it the real times and the hours follow.
     */
    private function withCountedHours(Attendance $record, array $data): array
    {
        if (! array_key_exists('clock_in', $data) && ! array_key_exists('clock_out', $data)) {
            return $data;
        }

        $clockIn = array_key_exists('clock_in', $data) ? $data['clock_in'] : $record->clock_in;
        $clockOut = array_key_exists('clock_out', $data) ? $data['clock_out'] : $record->clock_out;
        $dateKey = ($data['date'] ?? $record->date->toDateString());
        $dateKey = Carbon::parse($dateKey)->toDateString();
        $schedule = ShiftSchedule::with('shift')->where('employee_id', $data['employee_id'] ?? $record->employee_id)->where('date', $dateKey)->first();
        if (! $clockIn || ! $clockOut || ! $schedule || ! $schedule->shift) {
            return $data;
        }

        $timezone = ShiftHours::timezone();
        $shift = $schedule->shift;
        $employeeId = $data['employee_id'] ?? $record->employee_id;
        $hours = ShiftHours::count(
            Carbon::parse($dateKey.' '.$clockIn, $timezone),
            Carbon::parse($dateKey.' '.$clockOut, $timezone),
            ShiftHours::baseEnd($dateKey, $shift->start_time, $shift->end_time, $timezone),
            ShiftHours::effectiveEnd($employeeId, $dateKey, $shift->start_time, $shift->end_time, $timezone),
            null,
            ShiftHours::baseStart($dateKey, $shift->start_time, $timezone),
        );

        return array_merge($data, [
            'clock_out' => $hours['countedOut']->format('H:i:s'),
            'actual_clock_out' => Carbon::parse($clockOut)->format('H:i:s'),
            'regular_hours' => $hours['regular'],
            'overtime' => $hours['overtime'],
            'total_hours' => $hours['total'],
            'break_hours' => $hours['break'],
        ]);
    }

    public function destroy(string $id): JsonResponse
    {
        $record = Attendance::find($id);
        if (! $record) {
            return response()->json(['message' => 'Attendance record not found'], 404);
        }

        AuditLogger::record('attendance', 
            'attendance.deleted',
            'Attendance',
            $record->id,
            before: $record->toApiArray(),
            meta: ['date' => $record->date->toDateString()],
        );

        $record->delete();

        (new TimesheetGenerationService())->regenerateAll();

        return response()->json(['success' => true]);
    }

    private function syncTimesheets(string $employeeId, string $date): void
    {
        (new TimesheetGenerationService())->syncForEmployee($employeeId, now()->toDateString());
    }
}
