<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\Employee;
use App\Models\OvertimeRequest;
use App\Models\SecurityEvent;
use App\Models\Setting;
use App\Models\ShiftSchedule;
use App\Services\NotificationService;
use App\Services\TimesheetGenerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

/**
 * Kiosk (entrance clock-in device) configuration and activity.
 *
 * The device itself is not an authenticated user, so it talks to the read and
 * verify endpoints without a token. Only authenticated HR Managers can change
 * the configuration or PIN.
 */
class KioskController extends Controller
{
    use GeneratesSequentialIds;

    private const DEFAULT_CONFIG = [
        'location' => 'Main Entrance',
        'deviceName' => 'Front Door Kiosk',
        'timezone' => 'Asia/Manila',
        'active' => false,
        'enabledAt' => null,
    ];

    private const MAX_LOGS = 200;

    // face-api.js's own convention for its 128-value descriptors: distances
    // at or below this are considered the same person.
    private const FACE_MATCH_THRESHOLD = 0.6;

    public function config(): JsonResponse
    {
        return response()->json(['data' => $this->publicConfig()]);
    }

    public function verifyPin(Request $request): JsonResponse
    {
        $request->validate(['pin' => 'required|string']);

        $kiosk = $this->kiosk();
        $hash = hash('sha256', 'wfp-kiosk:'.$request->input('pin'));

        return response()->json([
            'ok' => ! empty($kiosk['pinHash']) && hash_equals($kiosk['pinHash'], $hash),
        ]);
    }

    public function log(Request $request): JsonResponse
    {
        $request->validate([
            'type' => 'required|string|max:50',
            'message' => 'required|string|max:255',
            'detail' => 'nullable|string|max:255',
            'employeeId' => 'nullable|string|max:20',
        ]);

        $entry = [
            'id' => 'KLOG-'.strtoupper(substr(uniqid('', true), 0, 13)),
            'type' => $request->input('type'),
            'message' => $request->input('message'),
            'detail' => $request->input('detail'),
            'employeeId' => $request->input('employeeId'),
            'at' => now()->toISOString(),
        ];

        $setting = Setting::query()->firstOrCreate([]);
        $kiosk = $this->kiosk($setting);
        $kiosk['logs'] = array_slice([$entry, ...($kiosk['logs'] ?? [])], 0, self::MAX_LOGS);
        $setting->update(['kiosk' => $kiosk]);

        if ($entry['type'] === 'security') {
            $this->recordSecurityEvent($entry['message'], $entry['employeeId']);
        }

        return response()->json(['data' => $entry], 201);
    }

    /**
     * Persist security violations (face mismatch, failed PIN attempts) into the
     * security_events table so HR can review and act on them in AI Decision
     * Support. Successful unlocks and other maintenance events are not kept.
     */
    private function recordSecurityEvent(string $message, ?string $employeeId): void
    {
        $type = str_contains($message, 'Face mismatch') ? 'face_mismatch'
            : (str_contains($message, 'incorrect PIN') ? 'pin_failed' : null);

        if ($type === null) {
            return;
        }

        SecurityEvent::create([
            'id' => $this->nextIdFor(SecurityEvent::class, 'SEV'),
            'type' => $type,
            'message' => $message,
            'employee_id' => $employeeId,
            'detail' => $employeeId ? ['employee_id' => $employeeId] : null,
            'status' => 'Open',
        ]);
    }

    public function updateConfig(Request $request): JsonResponse
    {
        $request->validate([
            'location' => 'nullable|string|max:100',
            'deviceName' => 'nullable|string|max:100',
            'timezone' => 'nullable|string|max:50',
            'active' => 'nullable|boolean',
            'enabledAt' => 'nullable|string|max:40',
        ]);

        $setting = Setting::query()->firstOrCreate([]);
        $kiosk = $this->kiosk($setting);

        foreach (['location', 'deviceName', 'timezone', 'active', 'enabledAt'] as $key) {
            if ($request->has($key)) {
                $kiosk[$key] = $request->input($key);
            }
        }

        $setting->update(['kiosk' => $kiosk]);

        return response()->json(['data' => $this->publicConfig()]);
    }

    /**
     * Real face matching (client-side face-api.js computes a 128-value
     * descriptor from the live camera frame; this compares it against the
     * descriptor captured at registration via Euclidean distance).
     *
     * This is not a liveness/anti-spoofing check - that would need
     * blink/motion detection, which isn't implemented here. Only identity
     * matching is real; the response says so plainly rather than pretending.
     */
    public function verifyFace(Request $request): JsonResponse
    {
        $request->validate([
            'employeeId' => 'required|string|max:20',
            'descriptor' => 'required|array|size:128',
            'descriptor.*' => 'numeric',
        ]);

        $employee = Employee::find($request->input('employeeId'));
        if (! $employee) {
            return response()->json(['ok' => false, 'message' => 'Employee not found'], 404);
        }

        if (! $employee->face_registered || empty($employee->face_descriptor)) {
            return response()->json([
                'ok' => false,
                'message' => 'No face is registered for this employee yet. Ask HR to register your face first.',
            ], 422);
        }

        $distance = $this->euclideanDistance($employee->face_descriptor, $request->input('descriptor'));
        $matched = $distance <= self::FACE_MATCH_THRESHOLD;

        // Simple linear distance-to-percentage mapping for display only -
        // not a calibrated probability.
        $confidence = max(0, round((1 - min($distance, 1)) * 100, 1));

        if (! $matched) {
            return response()->json([
                'ok' => false,
                'message' => 'Face did not match the registered employee. Please try again.',
                'data' => ['confidence' => $confidence],
            ], 401);
        }

        return response()->json([
            'ok' => true,
            'data' => [
                'status' => 'Verified',
                'confidence' => $confidence,
                'liveness' => 'Not Checked',
                'approval' => 'Successful',
                'faceRegistered' => true,
            ],
        ]);
    }

    private function euclideanDistance(array $a, array $b): float
    {
        if (count($a) !== count($b)) {
            return PHP_FLOAT_MAX;
        }

        $sum = 0.0;
        foreach (array_values($a) as $i => $value) {
            $sum += ((float) $value - (float) $b[$i]) ** 2;
        }

        return sqrt($sum);
    }

    public function setPin(Request $request): JsonResponse
    {
        $request->validate(['pin' => 'required|string|digits_between:4,10']);

        $setting = Setting::query()->firstOrCreate([]);
        $kiosk = $this->kiosk($setting);
        $kiosk['pinHash'] = hash('sha256', 'wfp-kiosk:'.$request->input('pin'));
        $setting->update(['kiosk' => $kiosk]);

        return response()->json(['success' => true]);
    }

    public function reset(): JsonResponse
    {
        $setting = Setting::query()->firstOrCreate([]);
        $setting->update(['kiosk' => self::DEFAULT_CONFIG]);

        return response()->json(['data' => $this->publicConfig()]);
    }

    /**
     * Minimal, non-sensitive employee directory for the kiosk's search box.
     * Never includes salary, email, phone, address, etc. - this endpoint is
     * reachable with no login, from the physical entrance device.
     */
    public function employeeDirectory(): JsonResponse
    {
        $employees = Employee::orderBy('id')
            ->get(['id', 'first_name', 'last_name', 'department', 'position', 'avatar']);

        return response()->json([
            'data' => $employees->map(fn (Employee $e) => [
                'id' => $e->id,
                'firstName' => $e->first_name,
                'lastName' => $e->last_name,
                'department' => $e->department,
                'position' => $e->position,
                'avatar' => $e->avatar,
            ])->values(),
        ]);
    }

    /**
     * A single employee's attendance history - needed so the kiosk can tell
     * whether they're already clocked in/out today. Scoped to one employee
     * at a time; never exposes the full attendance table.
     */
    public function attendanceByEmployee(string $employeeId): JsonResponse
    {
        $records = Attendance::where('employee_id', $employeeId)
            ->orderBy('date', 'desc')
            ->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    /**
     * Whether the employee has a shift scheduled on the given date (defaults
     * to today). The kiosk uses this to show "no shift today" warnings before
     * an unscheduled clock-in is recorded. Only the shift's schedule-relevant
     * fields are exposed - nothing sensitive. Approved overtime hours for the
     * date are included so the device can compute the effective shift end.
     */
    public function todaySchedule(Request $request, string $employeeId): JsonResponse
    {
        $dateKey = $request->input('date', Carbon::now($this->kioskTimezone())->toDateString());

        $schedule = ShiftSchedule::with('shift')
            ->where('employee_id', $employeeId)
            ->where('date', $dateKey)
            ->first();

        if (! $schedule || ! $schedule->shift) {
            return response()->json(['data' => ['hasShift' => false]]);
        }

        $shift = $schedule->shift;

        $approvedOtHours = OvertimeRequest::where('employee_id', $employeeId)
            ->where('date', $dateKey)
            ->where('status', 'Approved')
            ->get()
            ->sum(fn (OvertimeRequest $r) => (float) ($r->approved_hours ?? $r->expected_hours ?? 0));

        return response()->json([
            'data' => [
                'hasShift' => true,
                'shiftId' => $shift->id,
                'shiftName' => $shift->name,
                'startTime' => $shift->start_time,
                'endTime' => $shift->end_time,
                'approvedOvertimeHours' => $approvedOtHours,
            ],
        ]);
    }

    public function clockIn(Request $request): JsonResponse
    {
        $data = Attendance::apiFillable($request->validate([
            'employeeId' => 'required|string|max:20|exists:employees,id',
            'date' => 'required|date',
            'clockIn' => 'required',
            'status' => 'required|string|max:50',
            'location' => 'nullable|string|max:100',
        ]));

        $alreadyClockedIn = Attendance::where('employee_id', $data['employee_id'])
            ->where('date', $data['date'])
            ->exists();

        if ($alreadyClockedIn) {
            return response()->json(['message' => 'This employee already has an attendance record for today.'], 409);
        }

        $record = Attendance::create([
            ...$data,
            'id' => $this->nextIdFor(Attendance::class, 'ATT'),
        ]);

        app(TimesheetGenerationService::class)->syncForEmployee($record->employee_id, $record->date);

        if ($record->status === 'Late') {
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

        return response()->json(['data' => $record->toApiArray()], 201);
    }

    public function clockOut(Request $request, string $id): JsonResponse
    {
        $record = Attendance::find($id);
        if (! $record) {
            return response()->json(['message' => 'Attendance record not found'], 404);
        }

        if (! $record->clock_in || $record->clock_out) {
            return response()->json(['message' => 'This attendance record cannot be clocked out.'], 409);
        }

        // Employees may not clock out before their shift - including any
        // approved overtime for the day - is actually over. Shift times are
        // wall-clock in the kiosk's timezone, so both "now" and the effective
        // end are compared in that timezone (never UTC).
        $timezone = $this->kioskTimezone();
        $dateKey = $record->date->toDateString();
        $schedule = ShiftSchedule::with('shift')
            ->where('employee_id', $record->employee_id)
            ->where('date', $dateKey)
            ->first();

        $effectiveEnd = $schedule && $schedule->shift
            ? $this->effectiveShiftEnd(
                $record->employee_id,
                $dateKey,
                $schedule->shift->start_time,
                $schedule->shift->end_time,
                $timezone
            )
            : null;

        if ($effectiveEnd && Carbon::now($timezone)->lt($effectiveEnd)) {
            return response()->json([
                'message' => 'Your shift is still ongoing. You cannot clock out until '.$effectiveEnd->format('g:i A').'.',
                'data' => ['shiftEndsAt' => $effectiveEnd->toISOString()],
            ], 422);
        }

        $data = Attendance::apiFillable($request->validate([
            'clockOut' => 'required',
            'regularHours' => 'nullable|numeric',
            'overtime' => 'nullable|numeric',
            'totalHours' => 'nullable|numeric',
            'breakHours' => 'nullable|numeric',
        ]));

        $record->update($data);

        app(TimesheetGenerationService::class)->syncForEmployee($record->employee_id, $record->date);

        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    /**
     * The real point in time a shift ends: the scheduled end, extended by the
     * employee's approved overtime hours for that date. Overnight shifts (and
     * overtime that pushes the end past midnight) land on the correct day.
     * Shift times are wall-clock in the kiosk's timezone, so the result is a
     * timezone-aware instant in that same timezone.
     */
    private function effectiveShiftEnd(string $employeeId, string $dateKey, ?string $startTime, ?string $endTime, string $timezone): ?Carbon
    {
        if (! $startTime || ! $endTime) {
            return null;
        }

        $shiftStarts = Carbon::parse($dateKey.' '.$startTime, $timezone);
        $shiftEnds = Carbon::parse($dateKey.' '.$endTime, $timezone);

        if ($shiftEnds->lte($shiftStarts)) {
            $shiftEnds->addDay();
        }

        $approvedOtHours = OvertimeRequest::where('employee_id', $employeeId)
            ->where('date', $dateKey)
            ->where('status', 'Approved')
            ->get()
            ->sum(fn (OvertimeRequest $r) => (float) ($r->approved_hours ?? $r->expected_hours ?? 0));

        if ($approvedOtHours > 0) {
            $shiftEnds->addMinutes((int) round($approvedOtHours * 60));
        }

        return $shiftEnds;
    }

    /**
     * The wall-clock timezone the kiosk operates in. Fallbacks: the kiosk
     * config value, then the app default. Shift times and "now" comparisons
     * for the device all use this.
     */
    private function kioskTimezone(): string
    {
        $kiosk = $this->kiosk();

        return $kiosk['timezone'] ?: 'Asia/Manila';
    }

    private function publicConfig(): array
    {
        $kiosk = $this->kiosk();

        return [
            'location' => $kiosk['location'],
            'deviceName' => $kiosk['deviceName'],
            'timezone' => $kiosk['timezone'],
            'active' => (bool) $kiosk['active'],
            'enabledAt' => $kiosk['enabledAt'],
            'hasPin' => ! empty($kiosk['pinHash']),
            'logs' => $kiosk['logs'] ?? [],
        ];
    }

    private function kiosk(?Setting $setting = null): array
    {
        $setting ??= Setting::query()->firstOrCreate([]);

        return array_merge(self::DEFAULT_CONFIG, ['pinHash' => null, 'logs' => []], $setting->kiosk ?? []);
    }
}
