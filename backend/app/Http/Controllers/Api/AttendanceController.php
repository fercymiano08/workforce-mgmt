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
use App\Services\NotificationService;
use App\Services\OvertimeReconciliationService;
use App\Services\TimesheetGenerationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AttendanceController extends Controller
{
    use AuthorizesEmployeeScope, GeneratesSequentialIds;

    // How long past a shift's start time before a no-show is flagged absent.
    private const ABSENT_GRACE_MINUTES = 60;

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
        $today = Carbon::today();
        $todayKey = $today->toDateString();

        $absentFlagged = 0;
        $incompleteFlagged = 0;
        $shortageFlagged = false;

        // Absent: scheduled today, shift start + grace period has passed, no attendance row yet.
        $todaySchedules = ShiftSchedule::with('shift')
            ->where('date', $todayKey)
            ->where('status', 'Scheduled')
            ->get();

        $clockedInToday = Attendance::where('date', $todayKey)->pluck('employee_id')->all();

        foreach ($todaySchedules as $schedule) {
            if (in_array($schedule->employee_id, $clockedInToday, true)) {
                continue;
            }

            $startTime = $schedule->shift?->start_time;
            if (! $startTime) {
                continue;
            }

            $shiftStart = Carbon::parse($todayKey.' '.$startTime);
            if (now()->lt($shiftStart->addMinutes(self::ABSENT_GRACE_MINUTES))) {
                continue;
            }

            // notifyAdmins() fans out one row per admin with employee_id left
            // null (it's not "for" any employee recipient) - so dedup has to
            // match on the employee id embedded in the message text instead.
            $alreadyFlagged = Notification::where('type', 'attendance_absent')
                ->whereDate('timestamp', $today)
                ->where('message', 'like', "%(#{$schedule->employee_id})%")
                ->exists();
            if ($alreadyFlagged) {
                continue;
            }

            NotificationService::notifyAdmins(
                'attendance_absent',
                'Possible No-Show',
                "{$schedule->employee_name} (#{$schedule->employee_id}) was scheduled today but hasn't clocked in.",
                'high',
                '/attendance'
            );
            $absentFlagged++;
        }

        // Incomplete: clocked in on a day that's already over, never clocked out.
        $incompleteRecords = Attendance::whereNotNull('clock_in')
            ->whereNull('clock_out')
            ->where('date', '<', $todayKey)
            ->get();

        foreach ($incompleteRecords as $record) {
            $recordDateKey = $record->date->toDateString();

            // Same dedup approach as absences: notifyAdmins() leaves
            // employee_id null, so match on the marker embedded in the message.
            $alreadyFlagged = Notification::where('type', 'attendance_incomplete')
                ->whereDate('timestamp', $today)
                ->where('message', 'like', "%(#{$record->employee_id} / {$recordDateKey})%")
                ->exists();
            if ($alreadyFlagged) {
                continue;
            }

            $employee = Employee::find($record->employee_id);
            $name = $employee ? trim($employee->first_name.' '.$employee->last_name) : $record->employee_id;

            NotificationService::notifyAdmins(
                'attendance_incomplete',
                'Incomplete Attendance Record',
                "{$name} (#{$record->employee_id} / {$recordDateKey}) clocked in on ".$record->date->format('M d, Y').' but never clocked out.',
                'medium',
                '/attendance'
            );
            $incompleteFlagged++;
        }

        // Unauthorized overtime: clocked past shift end today with no approved
        // overtime request covering the day. Dedupes the same way as the others.
        $unauthorizedOtFlagged = 0;
        $otRecon = app(OvertimeReconciliationService::class);
        $todayOtRecords = Attendance::where('date', $todayKey)->where('overtime', '>', 0)->get();

        foreach ($todayOtRecords as $record) {
            if ($otRecon->approvedRequestFor($record->employee_id, $todayKey)) {
                continue;
            }

            $employee = Employee::find($record->employee_id);
            $name = $employee ? trim($employee->first_name.' '.$employee->last_name) : $record->employee_id;

            $alreadyFlagged = Notification::where('type', 'attendance_unauthorized_ot')
                ->whereDate('timestamp', $today)
                ->where('message', 'like', "%(#{$record->employee_id})%")
                ->exists();
            if ($alreadyFlagged) {
                continue;
            }

            NotificationService::notifyAdmins(
                'attendance_unauthorized_ot',
                'Unauthorized Overtime',
                "{$name} (#{$record->employee_id}) clocked {$record->overtime}h of overtime on ".$record->date->format('M d, Y').' without an approved request.',
                'high',
                '/attendance'
            );
            $unauthorizedOtFlagged++;
        }

        // Staff shortage: re-check today's approved-leave ratio.
        $activeEmployeeCount = Employee::where('status', '!=', 'Inactive')->count();
        if ($activeEmployeeCount > 0) {
            $onLeaveToday = Leave::where('status', 'Approved')
                ->where('start_date', '<=', $todayKey)
                ->where('end_date', '>=', $todayKey)
                ->count();

            if (($onLeaveToday / $activeEmployeeCount) > self::SHORTAGE_THRESHOLD) {
                $alreadyFlagged = Notification::where('type', 'staff_shortage')
                    ->whereDate('timestamp', $today)
                    ->where('message', 'like', "%{$todayKey}%")
                    ->exists();
                if (! $alreadyFlagged) {
                    NotificationService::notifyAdmins(
                        'staff_shortage',
                        'Possible Staffing Shortage',
                        "{$onLeaveToday} of {$activeEmployeeCount} employees are on approved leave today (".$today->format('M d, Y').').',
                        'high',
                        '/shifts'
                    );
                    $shortageFlagged = true;
                }
            }
        }

        return response()->json(['data' => [
            'absentFlagged' => $absentFlagged,
            'incompleteFlagged' => $incompleteFlagged,
            'shortageFlagged' => $shortageFlagged,
            'unauthorizedOtFlagged' => $unauthorizedOtFlagged,
        ]]);
    }

    public function index(): JsonResponse
    {
        $records = Attendance::orderBy('date', 'desc')->orderBy('id')->get();

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

        $today = now()->toDateString();

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
            ->whereDate('timestamp', now())
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

        $record = Attendance::create([
            ...$data,
            'id' => $this->nextIdFor(Attendance::class, 'ATT'),
        ]);

        $this->syncTimesheets($record->employee_id, $record->date);
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

        $record->update($data);

        $this->syncTimesheets($record->employee_id, $record->date);

        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    public function destroy(string $id): JsonResponse
    {
        $record = Attendance::find($id);
        if (! $record) {
            return response()->json(['message' => 'Attendance record not found'], 404);
        }

        $record->delete();

        app(TimesheetGenerationService::class)->regenerateAll();

        return response()->json(['success' => true]);
    }

    private function syncTimesheets(string $employeeId, string $date): void
    {
        app(TimesheetGenerationService::class)->syncForEmployee($employeeId, $date);
    }
}
