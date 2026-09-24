<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Notification;
use App\Models\ShiftSchedule;
use App\Support\LocalTime;
use Illuminate\Support\Carbon;

/**
 * The attendance alerts the Workforce Admins get in their notification bell:
 *
 *   Possible No-Show            scheduled today, the absent-grace time after the shift start has passed, no clock-in
 *   Incomplete Attendance       clocked in on a day that is over, never clocked out
 *   Unauthorized Overtime       overtime counted today with no approved request
 *   Possible Staffing Shortage  more than 20% of active employees on approved leave today
 *
 * The scheduler runs scan() every minute (attendance:check-alerts), so an alert is raised about a minute after the
 * situation arises - not only when somebody happens to open the dashboard (which also calls it). Each situation is
 * flagged once per day: the scan remembers what it already sent. The notification's time is when the system
 * noticed; the message states the time that matters (e.g. the shift start that was missed).
 */
class AttendanceAlerts
{
    // How long past a shift's start before a no-show is flagged. HR can change it (Settings > Time Manager).
    public const DEFAULT_ABSENT_GRACE_MINUTES = 60;

    // A day where more than this share of active employees is on approved leave is a staffing risk.
    private const SHORTAGE_THRESHOLD = 0.2;

    // Most alerts one scan sends; anything beyond follows on the next scan a minute later.
    private const MAX_ALERTS_PER_SCAN = 15;

    /** @return array{absentFlagged: int, incompleteFlagged: int, shortageFlagged: bool, unauthorizedOtFlagged: int} */
    public function scan(): array
    {
        // The company's wall clock (Manila), not the server's UTC: shift starts are Manila times.
        $now = LocalTime::now();
        $today = LocalTime::today();
        $todayKey = $today->toDateString();

        $absentFlagged = 0;
        $incompleteFlagged = 0;
        $shortageFlagged = false;
        $unauthorizedOtFlagged = 0;

        // Everything already flagged today, loaded with one query. notifyAdmins() leaves employee_id null, so
        // dedup matches on the marker embedded in each message. Timestamps are UTC, so the local day starts here.
        $notified = Notification::where('timestamp', '>=', $today->copy()->utc())
            ->whereIn('type', ['attendance_absent', 'attendance_incomplete', 'attendance_unauthorized_ot', 'staff_shortage'])
            ->get(['type', 'message'])
            ->groupBy('type')
            ->map(fn ($rows) => $rows->pluck('message')->all())
            ->all();

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
        $queue = function (string $type, string $title, string $message, string $priority, string $actionUrl) use (&$pending): bool {
            if (count($pending) >= self::MAX_ALERTS_PER_SCAN) {
                return false;
            }
            $pending[] = compact('type', 'title', 'message', 'priority') + ['actionUrl' => $actionUrl];

            return true;
        };

        // Possible no-show: scheduled today, the grace time after the shift start has passed, no attendance yet.
        $todaySchedules = ShiftSchedule::with('shift')->where('date', $todayKey)->where('status', 'Scheduled')->get();
        $clockedInToday = array_flip(Attendance::where('date', $todayKey)->pluck('employee_id')->all());
        // Someone on approved leave is not a no-show even if a shift exists for the day.
        $onLeaveToday = array_flip(Leave::where('status', 'Approved')
            ->whereDate('start_date', '<=', $todayKey)->whereDate('end_date', '>=', $todayKey)
            ->pluck('employee_id')->all());
        $grace = $this->absentGraceMinutes();
        // The name as it is now (a schedule keeps a copy from when it was made, which could be out of date)
        $scheduledNames = Employee::whereIn('id', $todaySchedules->pluck('employee_id')->unique()->all())
            ->get(['id', 'first_name', 'last_name'])->keyBy('id');

        foreach ($todaySchedules as $schedule) {
            if (isset($clockedInToday[$schedule->employee_id]) || isset($onLeaveToday[$schedule->employee_id])) {
                continue;
            }
            $startTime = $schedule->shift?->start_time;
            if (! $startTime) {
                continue;
            }
            $shiftStart = Carbon::parse($todayKey.' '.$startTime, $now->getTimezone());
            if ($now->lt($shiftStart->copy()->addMinutes($grace))) {
                continue;
            }
            if ($alreadyFlagged('attendance_absent', "(#{$schedule->employee_id})")) {
                continue;
            }
            $person = $scheduledNames->get($schedule->employee_id);
            $name = $person ? trim($person->first_name.' '.$person->last_name) : $schedule->employee_name;
            if ($queue(
                'attendance_absent',
                'Possible No-Show',
                "{$name} (#{$schedule->employee_id}) was due at {$shiftStart->format('g:i A')} today but hasn't clocked in.",
                'high',
                '/attendance'
            )) {
                $absentFlagged++;
            }
        }

        // Incomplete: clocked in on a day that's already over, never clocked out.
        $incompleteRecords = Attendance::whereNotNull('clock_in')->whereNull('clock_out')->where('date', '<', $todayKey)->get();
        $incompleteNames = Employee::whereIn('id', $incompleteRecords->pluck('employee_id')->unique()->all())
            ->get(['id', 'first_name', 'last_name'])->keyBy('id');

        foreach ($incompleteRecords as $record) {
            $recordDateKey = $record->date->toDateString();
            if ($alreadyFlagged('attendance_incomplete', "(#{$record->employee_id} / {$recordDateKey})")) {
                continue;
            }
            $employee = $incompleteNames->get($record->employee_id);
            $name = $employee ? trim($employee->first_name.' '.$employee->last_name) : $record->employee_id;
            $clockIn = Carbon::parse($recordDateKey.' '.$record->clock_in)->format('g:i A');
            if ($queue(
                'attendance_incomplete',
                'Incomplete Attendance Record',
                "{$name} (#{$record->employee_id} / {$recordDateKey}) clocked in at {$clockIn} on ".$record->date->format('M d, Y').' but never clocked out.',
                'medium',
                '/attendance'
            )) {
                $incompleteFlagged++;
            }
        }

        // Unauthorized overtime: overtime counted today with no approved request covering the day.
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

        // Staff shortage: today's approved-leave ratio.
        $activeEmployeeCount = Employee::where('status', '!=', 'Inactive')->count();
        if ($activeEmployeeCount > 0) {
            $onLeaveCount = count($onLeaveToday);
            if (($onLeaveCount / $activeEmployeeCount) > self::SHORTAGE_THRESHOLD
                // (matched on the date exactly as the message writes it, so it is sent once a day, not every scan)
                && ! $alreadyFlagged('staff_shortage', '('.$today->format('M d, Y').')')
                && $queue(
                    'staff_shortage',
                    'Possible Staffing Shortage',
                    "{$onLeaveCount} of {$activeEmployeeCount} employees are on approved leave today (".$today->format('M d, Y').').',
                    'high',
                    '/shifts'
                )) {
                $shortageFlagged = true;
            }
        }

        NotificationService::notifyAdminsMany($pending);

        return compact('absentFlagged', 'incompleteFlagged', 'shortageFlagged', 'unauthorizedOtFlagged');
    }

    public function absentGraceMinutes(): int
    {
        return max(0, (int) app(SystemSettings::class)->get('absent_grace_minutes', self::DEFAULT_ABSENT_GRACE_MINUTES));
    }
}
