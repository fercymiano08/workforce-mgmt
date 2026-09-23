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
use App\Services\AuditLogger;
use App\Services\NotificationService;
use App\Services\OvertimeReconciliationService;
use App\Services\PayrollClient;
use App\Services\SystemSettings;
use App\Support\LocalTime;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AttendanceController extends Controller
{
    use AuthorizesEmployeeScope, GeneratesSequentialIds;

    // How long past a shift's start time before a no-show is flagged absent.
    // HR-configurable (Settings > Time Manager); this is only the fallback.
    private const DEFAULT_ABSENT_GRACE_MINUTES = 60;

    private function absentGraceMinutes(): int
    {
        return max(0, (int) app(SystemSettings::class)->get('absent_grace_minutes', self::DEFAULT_ABSENT_GRACE_MINUTES));
    }

    // Most alerts one checkAlerts() call will send; the rest follow on the next call.
    // Kept small because Communications handles one request at a time (~0.5s each),
    // so the whole batch must finish well inside PHP's 30s request limit.
    private const MAX_ALERTS_PER_SCAN = 15;

    // Same threshold as ShiftController::generateSchedule - a day where more
    // than this share of active employees are on approved leave is a risk.
    private const SHORTAGE_THRESHOLD = 0.2;

    /**
     * Scans for things HR should know about right now but nothing proactively
     * told them: no-shows, un-closed-out attendance from prior days, and
     * today's staffing shortage risk. There is no background scheduler in
     * this project, so this runs on demand (e.g. when the HR dashboard
     * loads) rather than as a real-time push. Already-flagged items are not
     * re-notified the same day.
     */
    public function checkAlerts(): JsonResponse
    {
        // The company's wall clock (Manila), not the server's UTC: shift starts are Manila times.
        $now = LocalTime::now();
        $today = LocalTime::today();
        $todayKey = $today->toDateString();

        $absentFlagged = 0;
        $incompleteFlagged = 0;
        $shortageFlagged = false;

        // Everything already flagged today, loaded with ONE query instead of an
        // unindexed LIKE query per employee. notifyAdmins() leaves employee_id
        // null, so dedup matches on the marker embedded in each message.
        // Notification timestamps are stored in UTC, so the local day starts at this UTC instant.
        $notified = Notification::where('timestamp', '>=', $today->copy()->utc())
            ->whereIn('type', ['attendance_absent', 'attendance_incomplete', 'attendance_unauthorized_ot', 'staff_shortage'])
            ->get(['type', 'message'])
            ->groupBy('type')
            ->map(fn ($rows) => $rows->pluck('message')->all())
            ->all();

        // Alerts are queued here and sent to Communications in ONE concurrent
        // batch at the end, instead of one blocking HTTP call per employee.
        $pending = [];
        $alreadyFlagged = function (string $type, string $needle) use (&$notified, &$pending): bool {
            foreach ($notified[$type] ?? [] as $message) {
                if (str_contains($message, $needle)) {
                    return true;
                }
            }
            foreach ($pending as $item) {
                if ($item['type'] === $type && str_contains($item['message'], $needle)) {
                    return true;
                }
            }

            return false;
        };
        // Bounded per scan: a huge backlog is worked off over successive scans
        // (the dedup above skips what was already sent) rather than in one request.
        $queue = function (string $type, string $title, string $message, string $priority, string $actionUrl) use (&$pending): bool {
            if (count($pending) >= self::MAX_ALERTS_PER_SCAN) {
                return false;
            }
            $pending[] = compact('type', 'title', 'message', 'priority') + ['actionUrl' => $actionUrl];

            return true;
        };

        // Absent: scheduled today, shift start + grace period has passed, no attendance row yet.
        $todaySchedules = ShiftSchedule::with('shift')
            ->where('date', $todayKey)
            ->where('status', 'Scheduled')
            ->get();

        $clockedInToday = array_flip(Attendance::where('date', $todayKey)->pluck('employee_id')->all());

        // Someone on approved leave is not a no-show even if a shift exists for the day.
        $onLeaveToday = array_flip(Leave::where('status', 'Approved')
            ->whereDate('start_date', '<=', $todayKey)
            ->whereDate('end_date', '>=', $todayKey)
            ->pluck('employee_id')->all());

        foreach ($todaySchedules as $schedule) {
            if (isset($clockedInToday[$schedule->employee_id]) || isset($onLeaveToday[$schedule->employee_id])) {
                continue;
            }

            $startTime = $schedule->shift?->start_time;
            if (! $startTime) {
                continue;
            }

            $shiftStart = Carbon::parse($todayKey.' '.$startTime, $now->getTimezone());
            if ($now->lt($shiftStart->addMinutes($this->absentGraceMinutes()))) {
                continue;
            }

            if ($alreadyFlagged('attendance_absent', "(#{$schedule->employee_id})")) {
                continue;
            }

            if ($queue(
                'attendance_absent',
                'Possible No-Show',
                "{$schedule->employee_name} (#{$schedule->employee_id}) was scheduled today but hasn't clocked in.",
                'high',
                '/attendance'
            )) {
                $absentFlagged++;
            }
        }

        // Incomplete: clocked in on a day that's already over, never clocked out.
        $incompleteRecords = Attendance::whereNotNull('clock_in')
            ->whereNull('clock_out')
            ->where('date', '<', $todayKey)
            ->get();

        $incompleteNames = Employee::whereIn('id', $incompleteRecords->pluck('employee_id')->unique()->all())
            ->get(['id', 'first_name', 'last_name'])->keyBy('id');

        foreach ($incompleteRecords as $record) {
            $recordDateKey = $record->date->toDateString();

            if ($alreadyFlagged('attendance_incomplete', "(#{$record->employee_id} / {$recordDateKey})")) {
                continue;
            }

            $employee = $incompleteNames->get($record->employee_id);
            $name = $employee ? trim($employee->first_name.' '.$employee->last_name) : $record->employee_id;

            if ($queue(
                'attendance_incomplete',
                'Incomplete Attendance Record',
                "{$name} (#{$record->employee_id} / {$recordDateKey}) clocked in on ".$record->date->format('M d, Y').' but never clocked out.',
                'medium',
                '/attendance'
            )) {
                $incompleteFlagged++;
            }
        }

        // Unauthorized overtime: clocked past shift end today with no approved
        // overtime request covering the day. Dedupes the same way as the others.
        $unauthorizedOtFlagged = 0;
        $otRecon = app(OvertimeReconciliationService::class);
        $todayOtRecords = Attendance::where('date', $todayKey)->where('overtime', '>', 0)->get();

        $otNames = Employee::whereIn('id', $todayOtRecords->pluck('employee_id')->unique()->all())
            ->get(['id', 'first_name', 'last_name'])->keyBy('id');

        foreach ($todayOtRecords as $record) {
            if ($otRecon->approvedRequestFor($record->employee_id, $todayKey)) {
                continue;
            }

            if ($alreadyFlagged('attendance_unauthorized_ot', "(#{$record->employee_id})")) {
                continue;
            }

            $employee = $otNames->get($record->employee_id);
            $name = $employee ? trim($employee->first_name.' '.$employee->last_name) : $record->employee_id;

            if ($queue(
                'attendance_unauthorized_ot',
                'Unauthorized Overtime',
                "{$name} (#{$record->employee_id}) clocked {$record->overtime}h of overtime on ".$record->date->format('M d, Y').' without an approved request.',
                'high',
                '/attendance'
            )) {
                $unauthorizedOtFlagged++;
            }
        }

        // Staff shortage: re-check today's approved-leave ratio.
        $activeEmployeeCount = Employee::where('status', '!=', 'Inactive')->count();
        if ($activeEmployeeCount > 0) {
            $onLeaveToday = Leave::where('status', 'Approved')
                ->where('start_date', '<=', $todayKey)
                ->where('end_date', '>=', $todayKey)
                ->count();

            if (($onLeaveToday / $activeEmployeeCount) > self::SHORTAGE_THRESHOLD) {
                if (! $alreadyFlagged('staff_shortage', $todayKey)
                    && $queue(
                        'staff_shortage',
                        'Possible Staffing Shortage',
                        "{$onLeaveToday} of {$activeEmployeeCount} employees are on approved leave today (".$today->format('M d, Y').').',
                        'high',
                        '/shifts'
                    )) {
                    $shortageFlagged = true;
                }
            }
        }

        NotificationService::notifyAdminsMany($pending);

        return response()->json(['data' => [
            'absentFlagged' => $absentFlagged,
            'incompleteFlagged' => $incompleteFlagged,
            'shortageFlagged' => $shortageFlagged,
            'unauthorizedOtFlagged' => $unauthorizedOtFlagged,
        ]]);
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

        PayrollClient::regenerateAll();

        return response()->json(['success' => true]);
    }

    private function syncTimesheets(string $employeeId, string $date): void
    {
        PayrollClient::syncForEmployee($employeeId);
    }
}
