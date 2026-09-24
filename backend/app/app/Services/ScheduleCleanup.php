<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\ShiftSchedule;
use App\Support\LocalTime;
use Illuminate\Support\Collection;

/**
 * Keeps a published schedule true when something changes afterwards. Automated scheduling skips approved
 * leave and inactive people when it builds a draft - this does the same for shifts already saved:
 *
 *   a leave becomes Approved      -> that person's shifts on the leave days go
 *   an employee becomes Inactive  -> their upcoming shifts go
 *
 * Only shifts from today on that nobody has clocked in for are removed; a worked day is never rewritten.
 * Called from the Leave and Employee models, so every screen that changes them is covered.
 */
class ScheduleCleanup
{
    public static function forApprovedLeave(Leave $leave): int
    {
        $shifts = ShiftSchedule::where('employee_id', $leave->employee_id)
            ->whereBetween('date', [$leave->start_date->toDateString(), $leave->end_date->toDateString()])
            ->get();

        return self::remove($shifts, 'your '.strtolower((string) $leave->leave_type).' leave was approved', 'leave', $leave->id);
    }

    public static function forInactiveEmployee(Employee $employee): int
    {
        return self::remove(ShiftSchedule::where('employee_id', $employee->id)->get(), null, 'inactive', $employee->id);
    }

    /** @param  Collection<int, ShiftSchedule>  $shifts */
    private static function remove(Collection $shifts, ?string $why, string $cause, string $causeId): int
    {
        $today = LocalTime::today()->toDateString();
        $removable = $shifts->filter(fn (ShiftSchedule $s) => $s->date->toDateString() >= $today
            && ! Attendance::where('employee_id', $s->employee_id)->whereDate('date', $s->date->toDateString())->exists());
        if ($removable->isEmpty()) {
            return 0;
        }

        $ids = $removable->pluck('id');
        ShiftSchedule::whereIn('id', $ids)->delete();

        if ($why !== null) {
            foreach ($removable->groupBy('employee_id') as $employeeId => $rows) {
                $n = $rows->count();
                NotificationService::notifyEmployee(
                    $employeeId, 'schedule_change', 'Schedule Updated',
                    "{$n} shift".($n === 1 ? ' was' : 's were')." removed from your schedule because {$why}.",
                    'low', '/my-schedule'
                );
            }
        }

        AuditLogger::record('scheduling', 'schedule.cleared', ['leave' => 'Leave', 'inactive' => 'Employee'][$cause], $causeId,
            meta: ['removed' => $ids->count(), 'shiftIds' => $ids->values()->all(), 'dates' => $removable->map(fn ($s) => $s->date->toDateString())->unique()->values()->all()]);

        return $ids->count();
    }
}
