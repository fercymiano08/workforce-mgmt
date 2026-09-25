<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\EarlyClockOut;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\OvertimeRequest;
use App\Models\SecurityEvent;
use App\Models\Setting;
use App\Models\ShiftSchedule;
use App\Services\SettingsUpdater;
use App\Services\EarlyLeaveEnforcer;
use App\Services\NotificationService;
use App\Services\TimesheetGenerationService;
use App\Services\ShiftHours;
use App\Services\SystemSettings;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Services\KioskDeviceToken;
use App\Services\KioskFaceLockout;
use App\Services\KioskFaceTicket;
use Illuminate\Support\Carbon;

/**
 * Kiosk (entrance clock-in device) configuration and activity.
 *
 * The device itself is not an authenticated user, so it talks to the read and
 * verify endpoints without a token. Only authenticated Workforce Admins can change
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

    // Minutes after a shift's start that a clock-in still counts as on time.
    // HR-configurable (Settings > Time Manager); this is only the fallback.
    private const DEFAULT_LATE_GRACE_MINUTES = 15;

    private function lateGraceMinutes(): int
    {
        return max(0, (int) app(SystemSettings::class)->get('late_grace_minutes', self::DEFAULT_LATE_GRACE_MINUTES));
    }

    // Face matching on face-api.js's 128-value descriptors (Euclidean distance: lower = more alike). Its
    // library default of 0.6 is tuned for "probably the same person" and lets close relatives through, so the
    // kiosk is stricter: the AVERAGE over several live frames must be at or below FACE_MATCH_THRESHOLD, and
    // no single frame may be further than FACE_FRAME_LIMIT. Typical same-person distances are 0.25-0.45.
    private const FACE_MATCH_THRESHOLD = 0.5;

    private const FACE_FRAME_LIMIT = 0.55;

    // All live frames must show one and the same face (no swapping people mid-scan).
    private const FACE_SAME_SCAN_LIMIT = 0.6;

    // 1:N check against every other enrolled employee: if someone else is closer, or within this margin of
    // the claimed employee, the scan cannot tell the two apart (siblings, twins, look-alikes) and is refused.
    private const FACE_AMBIGUITY_MARGIN = 0.08;

    /** The activity log (employee names, clock times, security attempts): Administrator only. */
    public function logs(): JsonResponse
    {
        return response()->json(['data' => $this->kiosk()['logs'] ?? []]);
    }

    /**
     * Everything the Kiosk Management screen shows at a glance, worked out on the server in the kiosk's own
     * time zone: today's counts, who has not clocked in, what is not ready yet, and the latest activity.
     */
    public function overview(): JsonResponse
    {
        $timezone = ShiftHours::timezone();
        $today = now($timezone)->toDateString();
        $startUtc = now($timezone)->startOfDay()->utc();
        $kiosk = $this->kiosk();
        $logs = collect($kiosk['logs'] ?? []);
        $todayLogs = $logs->filter(fn ($l) => isset($l['at']) && Carbon::parse($l['at'])->gte($startUtc));

        $records = Attendance::where('date', $today)->get(['employee_id', 'clock_in', 'clock_out']);
        $clockedIn = $records->pluck('employee_id')->flip();
        $onLeave = Leave::where('status', 'Approved')->whereDate('start_date', '<=', $today)->whereDate('end_date', '>=', $today)
            ->pluck('employee_id')->flip();

        $scheduled = ShiftSchedule::with('shift')->where('date', $today)->where('status', 'Scheduled')->get();
        $now = now($timezone);
        // Not clocked in yet: scheduled, not on leave, and the shift has already started
        $waiting = $scheduled
            ->filter(fn ($s) => ! isset($clockedIn[$s->employee_id]) && ! isset($onLeave[$s->employee_id])
                && $s->shift && Carbon::parse($today.' '.$s->shift->start_time, $timezone)->lte($now))
            ->map(fn ($s) => [
                'employeeId' => $s->employee_id,
                'name' => $s->employee_name,
                'shiftStart' => substr((string) $s->shift->start_time, 0, 5),
                'minutesLate' => (int) Carbon::parse($today.' '.$s->shift->start_time, $timezone)->diffInMinutes($now),
            ])->sortByDesc('minutesLate')->values();

        // Everyone who is not Inactive can be at the door (Active and On Leave), the same count the Employees page uses
        $active = Employee::where('status', '!=', 'Inactive');
        $readiness = [
            'pinSet' => ! empty($kiosk['pinHash']),
            'kioskActive' => (bool) $kiosk['active'],
            'withoutFace' => (clone $active)->where(fn ($q) => $q->where('face_registered', false)->orWhereNull('face_registered'))->count(),
            'activeEmployees' => (clone $active)->count(),
        ];

        $last = $logs->first(fn ($l) => in_array($l['type'] ?? '', ['clock-in', 'clock-out'], true));

        return response()->json(['data' => [
            'today' => $today,
            'timezone' => $timezone,
            'sessionEndsAt' => now($timezone)->addDay()->startOfDay()->toISOString(),
            'clockIns' => $records->whereNotNull('clock_in')->count(),
            'clockOuts' => $records->whereNotNull('clock_out')->count(),
            'scheduledToday' => $scheduled->count(),
            // Only real alerts (wrong PIN, face mismatch): a successful unlock is also a "security" entry but not a problem
            'failedAttempts' => $todayLogs->filter(fn ($l) => ($l['type'] ?? '') === 'security'
                && preg_match('/^(failed|face mismatch)/i', (string) ($l['message'] ?? '')))->count(),
            'lastActivity' => $last,
            'waiting' => $waiting,
            'readiness' => $readiness,
        ]]);
    }

    public function config(): JsonResponse
    {
        return response()->json(['data' => $this->publicConfig()]);
    }

    public function verifyPin(Request $request): JsonResponse
    {
        $request->validate(['pin' => 'required|string']);

        $kiosk = $this->kiosk();
        $hash = hash('sha256', 'wfp-kiosk:'.$request->input('pin'));
        $ok = ! empty($kiosk['pinHash']) && hash_equals($kiosk['pinHash'], $hash);

        if (! $ok) {
            // Logged here, not by the terminal: a locked device has no token yet,
            // and this way the record cannot be forged or skipped by a client.
            if (! empty($kiosk['pinHash'])) {
                $this->appendLog('security', 'Failed attempt to unlock the kiosk (incorrect PIN)');
            }

            return response()->json(['ok' => false]);
        }

        $device = KioskDeviceToken::issue();

        return response()->json([
            'ok' => true,
            'token' => $device['token'],
            'expiresAt' => $device['expiresAt'],
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

        $entry = $this->appendLog(
            $request->input('type'),
            $request->input('message'),
            $request->input('detail'),
            $request->input('employeeId'),
        );

        return response()->json(['data' => $entry], 201);
    }

    /** Adds an entry to the kiosk activity log (and a security event when it is one). */
    private function appendLog(string $type, string $message, ?string $detail = null, ?string $employeeId = null): array
    {
        $entry = $this->logEntry($type, $message, $detail, $employeeId);

        $setting = Setting::query()->firstOrCreate([]);
        $kiosk = $this->kiosk($setting);
        $kiosk['logs'] = array_slice([$entry, ...($kiosk['logs'] ?? [])], 0, self::MAX_LOGS);
        SettingsUpdater::updateKiosk($kiosk);

        if ($type === 'security') {
            $this->recordSecurityEvent($message, $employeeId);
        }

        return $entry;
    }

    private function logEntry(string $type, string $message, ?string $detail = null, ?string $employeeId = null): array
    {
        return [
            'id' => 'KLOG-'.strtoupper(substr(uniqid('', true), 0, 13)),
            'type' => $type,
            'message' => $message,
            'detail' => $detail,
            'employeeId' => $employeeId,
            'at' => now()->toISOString(),
        ];
    }

    /**
     * Persist security violations (face mismatch, failed PIN attempts) into the
     * security_events table so HR can review and act on them in AI Decision
     * Support. Successful unlocks and other maintenance events are not kept.
     */
    private function recordSecurityEvent(string $message, ?string $employeeId): void
    {
        // A punch without a verified face scan is someone trying to clock in as a person they did not prove to be.
        $type = str_contains($message, 'Face mismatch') || str_contains($message, 'no verified face scan') ? 'face_mismatch'
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

        // Someone tried to clock in as another person: the Workforce Admins are
        // told right away (bell + Notifications page), not only on review.
        if ($type === 'face_mismatch') {
            $employee = $employeeId ? Employee::find($employeeId) : null;
            $name = $employee ? trim($employee->first_name.' '.$employee->last_name) : ($employeeId ?: 'an employee');

            NotificationService::notifyAdmins(
                'security_face_mismatch',
                'Face Mismatch at Kiosk',
                "Someone tried to clock in as {$name}".($employeeId ? " (#{$employeeId})" : '').' but their face did not match the registered photo.',
                'high',
                '/ai-decision-support'
            );
        }
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

        SettingsUpdater::updateKiosk($kiosk);

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
            'descriptors' => 'required|array|min:1|max:5',
            'descriptors.*' => 'required|array|size:128',
            'descriptors.*.*' => 'numeric',
        ]);

        // Checked before anything else: while the reader is paused, every scan is refused without
        // even being looked at. Enforced server-side so reloading the terminal does not clear it.
        if (KioskFaceLockout::isLocked()) {
            return response()->json([
                'ok' => false,
                'code' => 'face_locked',
                'message' => 'Too many failed face attempts. Face verification is paused for a moment - please wait and try again.',
                'data' => ['retryAfter' => KioskFaceLockout::secondsRemaining()],
            ], 429);
        }

        $employee = Employee::find($request->input('employeeId'));
        if (! $employee) {
            return response()->json(['ok' => false, 'message' => 'Employee not found'], 404);
        }

        if (! $employee->face_registered || ! is_array($employee->face_descriptor) || count($employee->face_descriptor) !== 128) {
            return response()->json([
                'ok' => false,
                'message' => 'No face is registered for this employee yet. Ask HR to register your face first.',
            ], 422);
        }

        $frames = array_values($request->input('descriptors'));
        $name = trim($employee->first_name.' '.$employee->last_name);

        // Every frame must be the same person as the first one.
        foreach ($frames as $frame) {
            if ($this->euclideanDistance($frames[0], $frame) > self::FACE_SAME_SCAN_LIMIT) {
                return response()->json([
                    'ok' => false,
                    'message' => 'The camera saw more than one face during the scan. Only one person should be in front of the camera. Please try again.',
                ], 422);
            }
        }

        $distances = array_map(fn ($frame) => $this->euclideanDistance($employee->face_descriptor, $frame), $frames);
        $average = array_sum($distances) / count($distances);
        // Simple linear distance-to-percentage mapping for display only - not a calibrated probability.
        $confidence = max(0, round((1 - min($average, 1)) * 100, 1));

        if ($average > self::FACE_MATCH_THRESHOLD || max($distances) > self::FACE_FRAME_LIMIT) {
            // Recorded here, on the server, so a modified terminal cannot keep failed attempts quiet.
            $this->appendLog('security', "Face mismatch - person does not match {$name} ({$employee->id})",
                'Average distance '.round($average, 3), $employee->id);

            return $this->faceMismatch($confidence);
        }

        // 1:N: is this face also (nearly) as close to another enrolled employee? Then the scan cannot tell who
        // it is. A closer match elsewhere means it is most likely that other person using this ID.
        $closest = null;
        Employee::where('id', '!=', $employee->id)->where('face_registered', true)->whereNotNull('face_descriptor')
            ->get(['id', 'first_name', 'last_name', 'face_descriptor'])
            ->each(function (Employee $other) use ($frames, &$closest): void {
                if (! is_array($other->face_descriptor) || count($other->face_descriptor) !== 128) {
                    return;
                }
                $d = array_sum(array_map(fn ($frame) => $this->euclideanDistance($other->face_descriptor, $frame), $frames)) / count($frames);
                if ($closest === null || $d < $closest['distance']) {
                    $closest = ['employee' => $other, 'distance' => $d];
                }
            });

        if ($closest && $closest['distance'] <= $average + self::FACE_AMBIGUITY_MARGIN) {
            $other = $closest['employee'];
            $otherName = trim($other->first_name.' '.$other->last_name);
            $closer = $closest['distance'] < $average;
            $this->appendLog('security',
                $closer
                    ? "Face mismatch - person does not match {$name} ({$employee->id})"
                    : "Ambiguous face match - {$name} ({$employee->id}) cannot be told apart from another employee",
                "Closest enrolled face: {$otherName} ({$other->id}), distance ".round($closest['distance'], 3).' vs '.round($average, 3),
                $employee->id);

            // Being told you look like a colleague is not a wrong guess, so it does not spend a strike -
            // it sends the person to HR, which is the only honest answer to "we cannot tell you apart".
            if (! $closer) {
                return response()->json([
                    'ok' => false,
                    'code' => 'ambiguous',
                    'message' => 'Your face is too similar to another registered employee for the kiosk to be sure it is you. Please see HR to record your attendance.',
                ], 409);
            }

            return $this->faceMismatch($confidence);
        }

        // A good scan wipes the strike count, so an honest employee who fumbled a few times is not
        // left one mistake away from a lockout for the rest of the day.
        KioskFaceLockout::clear();

        return response()->json([
            'ok' => true,
            'data' => [
                'status' => 'Verified',
                'confidence' => $confidence,
                'liveness' => 'Not Checked',
                'approval' => 'Successful',
                'faceRegistered' => true,
                'faceTicket' => app(KioskFaceTicket::class)->issue($employee->id),
            ],
        ]);
    }

    /**
     * A face that did not match: spends one of the reader's attempts and tells the terminal how many
     * are left, so the screen can warn people before the reader locks rather than surprising them.
     */
    private function faceMismatch(float $confidence): JsonResponse
    {
        $strike = KioskFaceLockout::recordFailure();

        return response()->json([
            'ok' => false,
            'code' => $strike['locked'] ? 'face_locked' : 'mismatch',
            'message' => $strike['locked']
                ? 'Too many failed face attempts. Face verification is paused for one minute - please wait and try again.'
                : 'Face did not match the registered employee. Please try again.',
            'data' => [
                'confidence' => $confidence,
                'attemptsRemaining' => $strike['attemptsRemaining'],
                'retryAfter' => $strike['retryAfter'],
            ],
        ], $strike['locked'] ? 429 : 401);
    }

    /** The face-match proof a clock-in/out must carry (see KioskFaceTicket); null when it is present and valid. */
    private function faceTicketMissing(Request $request, string $employeeId): ?JsonResponse
    {
        if (app(KioskFaceTicket::class)->valid($request->input('faceTicket'), $employeeId)) {
            return null;
        }

        $employee = Employee::find($employeeId);
        $name = $employee ? trim($employee->first_name.' '.$employee->last_name) : $employeeId;
        $this->appendLog('security', "Punch refused - no verified face scan for {$name} ({$employeeId})", null, $employeeId);

        return response()->json([
            'message' => 'Face verification is required. Please scan your face again.',
            'code' => 'face_required',
        ], 403);
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
        SettingsUpdater::updateKiosk($kiosk);

        // No device token is issued here on purpose. Creating the PIN must not unlock anything:
        // the whole point of the gate is that the person at the entrance types that PIN on the
        // terminal itself. Handing a token to the Administrator's browser used to make the terminal
        // skip the PIN screen entirely on that machine, so the PIN nobody was ever asked to enter
        // was the one gating the device.
        return response()->json([
            'success' => true,
            'data' => $this->publicConfig(),
        ]);
    }

    public function reset(): JsonResponse
    {
        // updateKiosk merges, so the PIN and the log must be cleared explicitly or they would survive the reset.
        SettingsUpdater::updateKiosk([...self::DEFAULT_CONFIG, 'pinHash' => null, 'logs' => []]);

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
     * A single employee by exact ID - used by the terminal as a fallback when
     * its local directory snapshot has not loaded yet (the ID entry must work
     * even if the background directory fetch failed). A bare numeric suffix
     * ("20264845") is also accepted and resolved to the matching employee.
     * Only the minimal identity fields the terminal needs are returned.
     */
    public function employeeShow(Request $request, string $employeeId): JsonResponse
    {
        $employee = Employee::find($employeeId);

        if (! $employee && preg_match('/^\d+$/', (string) $employeeId)) {
            $employee = Employee::where('id', 'like', '%'.$employeeId)->first();
        }

        if (! $employee) {
            return response()->json(['message' => 'Employee not found'], 404);
        }

        return response()->json(['data' => [
            'id' => $employee->id,
            'firstName' => $employee->first_name,
            'lastName' => $employee->last_name,
            'department' => $employee->department,
            'position' => $employee->position,
            'avatar' => $employee->avatar,
        ]]);
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
            ->where('status', 'Scheduled')
            ->first();

        if (! $schedule || ! $schedule->shift) {
            $leave = $this->approvedLeaveOn($employeeId, $dateKey);

            return response()->json([
                'data' => [
                    'hasShift' => false,
                    'onApprovedLeave' => (bool) $leave,
                    'approvedLeaveType' => $leave?->leave_type,
                    'approvedLeaveStart' => $leave?->start_date?->toDateString(),
                    'approvedLeaveEnd' => $leave?->end_date?->toDateString(),
                ],
            ]);
        }

        $shift = $schedule->shift;

        $leave = $this->approvedLeaveOn($employeeId, $dateKey);
        if ($leave) {
            return response()->json([
                'data' => [
                    'hasShift' => true,
                    'onApprovedLeave' => true,
                    'approvedLeaveType' => $leave->leave_type,
                    'approvedLeaveStart' => $leave->start_date->toDateString(),
                    'approvedLeaveEnd' => $leave->end_date->toDateString(),
                    'shiftId' => $shift->id,
                    'shiftName' => $shift->name,
                    'startTime' => $shift->start_time,
                    'endTime' => $shift->end_time,
                ],
            ]);
        }

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
                // The kiosk opens this many minutes before the shift; paid time still starts at the shift start.
                'earlyWindowMinutes' => ShiftHours::EARLY_ARRIVAL_MINUTES,
                // Shown before the employee picks a reason for leaving early.
                'earlyLeave' => app(EarlyLeaveEnforcer::class)->allowanceFor($employeeId, $dateKey),
            ],
        ]);
    }

    public function clockIn(Request $request): JsonResponse
    {
        if ($inactive = $this->inactiveResponse()) {
            return $inactive;
        }

        $data = Attendance::apiFillable($request->validate([
            'employeeId' => 'required|string|max:20|exists:employees,id',
            'date' => 'required|date',
            'clockIn' => 'required',
            'status' => 'required|string|max:50',
            'location' => 'nullable|string|max:100',
        ]));

        if ($refused = $this->faceTicketMissing($request, $data['employee_id'])) {
            return $refused;
        }

        // The server's clock decides the date, the time and Present/Late - never
        // the terminal's. A wrong device clock or a hand-made request must not be
        // able to record an on-time arrival that did not happen.
        $timezone = $this->kioskTimezone();
        $now = Carbon::now($timezone);
        $data['date'] = $now->toDateString();
        $data['clock_in'] = $now->format('H:i:s');

        $alreadyClockedIn = Attendance::where('employee_id', $data['employee_id'])
            ->where('date', $data['date'])
            ->exists();

        if ($alreadyClockedIn) {
            return response()->json(['message' => 'This employee already has an attendance record for today.'], 409);
        }

        if ($leave = $this->approvedLeaveOn($data['employee_id'], $data['date'])) {
            return response()->json([
                'message' => 'You are on approved '.$leave->leave_type.' leave from '.$leave->start_date->format('M j').' to '.$leave->end_date->format('M j, Y').'. Clocking in during your approved leave is not allowed.',
                'data' => ['reason' => 'on_approved_leave'],
            ], 422);
        }

        // A shift is required. Without one there is nothing to measure "on time" or
        // "late" against, so the day is refused instead of guessing a start time.
        $schedule = ShiftSchedule::with('shift')
            ->where('employee_id', $data['employee_id'])
            ->where('date', $data['date'])
            ->where('status', 'Scheduled')
            ->first();

        if (! $schedule || ! $schedule->shift) {
            return response()->json([
                'message' => 'You have no shift scheduled today, so you cannot clock in. Please check your schedule with HR.',
                'data' => ['reason' => 'no_shift'],
            ], 422);
        }

        $shift = $schedule->shift;
        $effectiveEnd = $this->effectiveShiftEnd(
            $data['employee_id'],
            $data['date'],
            $shift->start_time,
            $shift->end_time,
            $timezone
        );

        if ($effectiveEnd && $now->gte($effectiveEnd)) {
            return response()->json([
                'message' => 'Your shift ended at '.$effectiveEnd->format('g:i A').' today. Clocking in for a finished shift is not allowed - please contact HR.',
                'data' => ['reason' => 'shift_over'],
            ], 422);
        }

        // Too early: the terminal opens a short window before the shift (see ShiftHours::EARLY_ARRIVAL_MINUTES).
        $shiftStart = Carbon::parse($data['date'].' '.$shift->start_time, $timezone);
        $opensAt = $shiftStart->copy()->subMinutes(ShiftHours::EARLY_ARRIVAL_MINUTES);
        if ($now->lt($opensAt)) {
            return response()->json([
                'message' => 'Your shift starts at '.$shiftStart->format('g:i A').'. You can clock in from '.$opensAt->format('g:i A').' (up to '.ShiftHours::EARLY_ARRIVAL_MINUTES.' minutes before your shift).',
                'data' => ['reason' => 'too_early', 'opensAt' => $opensAt->format('H:i')],
            ], 422);
        }

        // Present up to and including 15 minutes after the shift starts; Late after that.
        $data['status'] = $now->gt($shiftStart->copy()->addMinutes($this->lateGraceMinutes())) ? 'Late' : 'Present';

        try {
            $record = Attendance::create([
                ...$data,
                'id' => $this->nextIdFor(Attendance::class, 'ATT'),
            ]);
        } catch (\Illuminate\Database\UniqueConstraintViolationException) {
            // Two clock-ins raced each other; the database let only one through.
            return response()->json(['message' => 'This employee already has an attendance record for today.'], 409);
        }
        app(KioskFaceTicket::class)->spend($request->input('faceTicket'));

        (new TimesheetGenerationService())->syncForEmployee($record->employee_id, now()->toDateString());
        NotificationService::retractNoShowAlert($record->employee_id);

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

        // A quiet confirmation for the employee, so they can see the punch was recorded.
        $inAt = Carbon::parse($record->date->toDateString().' '.$record->clock_in)->format('g:i A');
        NotificationService::notifyEmployee(
            $record->employee_id,
            'attendance_clock_in',
            'Clocked In',
            'You clocked in at '.$inAt.($record->status === 'Late' ? ' (late).' : ' (on time).'),
            'low',
            '/my-attendance'
        );

        return response()->json(['data' => $record->toApiArray()], 201);
    }

    public function clockOut(Request $request, string $id): JsonResponse
    {
        if ($inactive = $this->inactiveResponse()) {
            return $inactive;
        }

        $record = Attendance::find($id);
        if (! $record) {
            return response()->json(['message' => 'Attendance record not found'], 404);
        }

        if (! $record->clock_in || $record->clock_out) {
            return response()->json(['message' => 'This attendance record cannot be clocked out.'], 409);
        }

        if ($refused = $this->faceTicketMissing($request, $record->employee_id)) {
            return $refused;
        }

        if ($leave = $this->approvedLeaveOn($record->employee_id, $record->date->toDateString())) {
            return response()->json([
                'message' => 'You are on approved '.$leave->leave_type.' leave ('.$leave->start_date->format('M j').' - '.$leave->end_date->format('M j, Y').'). This clock-in should not exist; please contact HR.',
                'data' => ['reason' => 'on_approved_leave'],
            ], 422);
        }

        // Early clock-out is ALLOWED. Attendance systems record reality, they
        // do not enforce policy: an employee who is sick, or has a family
        // emergency, must never be trapped at a terminal until shift end.
        // We capture the punch immediately, snapshot the context (scheduled
        // end), and let HR classify the shortfall afterwards in payroll terms.
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

        $validated = $request->validate([
            'clockOut' => 'required',
            'regularHours' => 'nullable|numeric',
            'overtime' => 'nullable|numeric',
            'totalHours' => 'nullable|numeric',
            'breakHours' => 'nullable|numeric',
            'reasonCode' => 'nullable|string|max:40',
            'reasonNote' => 'nullable|string|max:1000',
            'proof' => 'nullable|array',
        ]);

        // 'Approved Leave' cannot be verified at the kiosk (a day with approved leave has
        // no clock-in at all), so it is not accepted as a reason - it would just be a
        // free excuse. The real reasons are health, family or personal emergency, or Other.
        if (($validated['reasonCode'] ?? null) === 'APPROVED_LEAVE') {
            return response()->json([
                'message' => 'Approved Leave cannot be chosen here. Please pick the actual reason for leaving early.',
                'data' => ['reason' => 'reason_not_verifiable'],
            ], 422);
        }

        $clockOut = Carbon::parse($dateKey.' '.$validated['clockOut'], $timezone);
        $isEarly = $effectiveEnd && $clockOut->lt($effectiveEnd);

        // The punch is never blocked for a real reason (sick, emergency), but the
        // employee must STATE the reason before leaving early - the terminal asks
        // first, and this makes it binding for any other client too.
        if ($isEarly && empty($validated['reasonCode'])) {
            return response()->json([
                'message' => 'You are clocking out before your shift ends ('.$effectiveEnd->format('g:i A').'). Please state a reason first.',
                'data' => ['reason' => 'reason_required'],
            ], 422);
        }

        // The SERVER decides which hours count - the terminal's own arithmetic is not trusted.
        // Time is counted only up to the effective end of the shift: 5:00 PM, or later when an
        // overtime request was approved. Minutes past that with no approval do not count (the real
        // punch is kept in actual_clock_out, so a later approval can still bring them back).
        $countedOut = $clockOut;
        $uncountedMinutes = 0;
        if ($effectiveEnd && $schedule && $schedule->shift) {
            $hours = ShiftHours::count(
                Carbon::parse($dateKey.' '.$record->clock_in, $timezone),
                $clockOut,
                ShiftHours::baseEnd($dateKey, $schedule->shift->start_time, $schedule->shift->end_time, $timezone),
                $effectiveEnd,
                null,
                ShiftHours::baseStart($dateKey, $schedule->shift->start_time, $timezone),
            );
            $countedOut = $hours['countedOut'];
            $uncountedMinutes = $hours['uncountedMinutes'];
            $validated['regularHours'] = $hours['regular'];
            $validated['overtime'] = $hours['overtime'];
            $validated['totalHours'] = $hours['total'];
            $validated['breakHours'] = $hours['break'];
            $validated['clockOut'] = $countedOut->format('H:i:s');
        }

        $data = Attendance::apiFillable($validated);
        if ($isEarly) {
            // The day's attendance status becomes its own category: the
            // employee was present, and left before the scheduled end.
            $data['status'] = 'Early Leave';
        }

        $data['actual_clock_out'] = $clockOut->format('H:i:s');

        $record->update($data);
        app(KioskFaceTicket::class)->spend($request->input('faceTicket'));

        // A few minutes over is normal; staying well past the end with no approval is worth HR's attention.
        if ($uncountedMinutes > $this->lateGraceMinutes()) {
            $employee = Employee::find($record->employee_id);
            $name = $employee ? trim($employee->first_name.' '.$employee->last_name) : $record->employee_id;
            NotificationService::notifyAdmins(
                'attendance_unauthorized_ot',
                'Unauthorized Overtime',
                "{$name} (#{$record->employee_id}) stayed {$uncountedMinutes} minutes past the end of the shift without an approved overtime request. That time was not counted.",
                'high',
                '/attendance'
            );
        }

        $earlyLeave = null;
        if ($isEarly) {
            $early = $this->recordEarlyClockOut($record, $effectiveEnd, $clockOut, $validated);
            // Verified, not just recorded: free allowance, proof for SICK, alerts to every
            // admin, copycat detection. The punch stays accepted either way.
            $earlyLeave = $early ? app(EarlyLeaveEnforcer::class)->applyAtPunch($early) : null;
        }

        if (! $isEarly) {
            $fresh = $record->fresh();
            $message = 'You clocked out at '.$countedOut->format('g:i A').'. '.rtrim(rtrim(number_format((float) $fresh->total_hours, 2), '0'), '.').' hours counted';
            if ((float) $fresh->overtime > 0) {
                $message .= ', including '.rtrim(rtrim(number_format((float) $fresh->overtime, 2), '0'), '.').' h of approved overtime';
            }
            $message .= '.';
            if ($uncountedMinutes > 0) {
                $message .= ' The last '.$uncountedMinutes.' minute'.($uncountedMinutes === 1 ? '' : 's').' after '.$countedOut->format('g:i A').' were not counted (no approved overtime).';
            }
            NotificationService::notifyEmployee($record->employee_id, 'attendance_clock_out', 'Clocked Out', $message, 'low', '/my-attendance');
        }

        (new TimesheetGenerationService())->syncForEmployee($record->employee_id, now()->toDateString());

        return response()->json([
            'data' => $record->fresh()->toApiArray(),
            'earlyLeave' => $earlyLeave,
        ]);
    }

    /**
     * Persist the documentation side of an early clock-out: reason, optional
     * note/proof, and a frozen snapshot of the scheduled end time. The punch
     * itself already exists on the attendance row; this never gates it.
     *
     * @param  array<string, mixed>  $validated
     */
    private function recordEarlyClockOut(Attendance $record, Carbon $effectiveEnd, Carbon $clockOut, array $validated): ?EarlyClockOut
    {
        $employee = Employee::find($record->employee_id);
        $reasonCode = $validated['reasonCode'] ?? null;

        return EarlyClockOut::create([
            'id' => $this->nextIdFor(EarlyClockOut::class, 'ECO'),
            'attendance_id' => $record->id,
            'employee_id' => $record->employee_id,
            'employee_name' => $employee ? trim(($employee->first_name ?? '').' '.($employee->last_name ?? '')) : null,
            'date' => $record->date->toDateString(),
            'scheduled_end_time' => $effectiveEnd->format('H:i'),
            'actual_clock_out_time' => $clockOut->format('H:i'),
            'minutes_early' => (int) abs($effectiveEnd->diffInMinutes($clockOut)),
            'reason_code' => $reasonCode,
            'reason_note' => $validated['reasonNote'] ?? null,
            'proof' => $validated['proof'] ?? [],
            'reason_status' => $reasonCode ? 'PROVIDED' : 'PENDING',
            'classification' => 'PENDING_REVIEW',
            'notification_sent' => false,
        ]);
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
        return ShiftHours::effectiveEnd($employeeId, $dateKey, $startTime, $endTime, $timezone);
    }

    /**
     * The employee's Approved leave covering the given date, if any. Used to
     * refuse clock-in/clock-out during an approved absence - the kiosk must
     * never record attendance for someone who is legitimately away.
     */
    private function approvedLeaveOn(string $employeeId, string $dateKey): ?Leave
    {
        return Leave::where('employee_id', $employeeId)
            ->where('status', 'Approved')
            ->whereDate('start_date', '<=', $dateKey)
            ->whereDate('end_date', '>=', $dateKey)
            ->first();
    }

    /**
     * The wall-clock timezone the kiosk operates in. Fallbacks: the kiosk
     * config value, then the app default. Shift times and "now" comparisons
     * for the device all use this.
     */
    /** Clock-ins only work while an Administrator has the kiosk switched on. */
    private function inactiveResponse(): ?JsonResponse
    {
        if ($this->kiosk()['active']) {
            return null;
        }

        return response()->json([
            'message' => 'Clock-ins are currently disabled on this kiosk.',
            'code' => 'kiosk_inactive',
        ], 423);
    }

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
            // No activity log here: this endpoint is open to anyone, and the log names employees.
        ];
    }

    private function kiosk(?Setting $setting = null): array
    {
        $setting ??= Setting::query()->firstOrCreate([]);
        $kiosk = array_merge(self::DEFAULT_CONFIG, ['pinHash' => null, 'logs' => []], $setting->kiosk ?? []);

        // Kiosk mode lasts for the day it was switched on: at midnight (kiosk time zone) it turns itself off, the
        // same moment the device's unlock ends, and an Administrator enables it again the next morning. Checked on
        // every read, so it holds even when the scheduler is not running.
        $startOfToday = now($kiosk['timezone'] ?: 'Asia/Manila')->startOfDay();
        if ($kiosk['active'] && $kiosk['enabledAt'] && Carbon::parse($kiosk['enabledAt'])->lt($startOfToday)) {
            $logs = array_slice([$this->logEntry('mode', 'Kiosk mode turned off automatically at midnight'), ...$kiosk['logs']], 0, self::MAX_LOGS);
            $kiosk = array_merge($kiosk, ['active' => false, 'enabledAt' => null, 'logs' => $logs]);
            SettingsUpdater::updateKiosk(['active' => false, 'enabledAt' => null, 'logs' => $logs]);
        }

        return $kiosk;
    }
}
