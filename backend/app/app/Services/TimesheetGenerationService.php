<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Timesheet;
use Illuminate\Support\Carbon;

class TimesheetGenerationService
{
    /**
     * The Philippine semi-monthly pay period containing this date: the 1st-15th, or the 16th through
     * the last day of the month. The `week_start`/`week_end` column names on Timesheet are unchanged
     * from the old Monday-Sunday model (so the API contract and every existing reader stays intact) -
     * only what range of dates they hold is different now.
     */
    public function periodStart(Carbon $date): Carbon
    {
        return $date->day <= 15 ? $date->copy()->startOfMonth() : $date->copy()->startOfMonth()->addDays(15);
    }

    public function periodEnd(Carbon $periodStart): Carbon
    {
        return $periodStart->day === 1 ? $periodStart->copy()->addDays(14) : $periodStart->copy()->endOfMonth();
    }

    /**
     * Recompute (and create when missing) the semi-monthly timesheet row that contains the given date
     * for the given employee, aggregated from their completed attendance records (rows with a clock-out).
     *
     * A timesheet still being worked on (Draft, or Rejected and sent back) is kept up to date. Once it
     * is Submitted or Approved its hours are FROZEN: if attendance changes afterwards the hours stay
     * as they were reviewed and the row is only flagged (`needs_refresh`) so the admin can reopen it.
     */
    public function syncForEmployee(string $employeeId, string $date): ?Timesheet
    {
        $employee = Employee::find($employeeId);
        if (! $employee) {
            return null;
        }

        $weekStart = $this->periodStart(Carbon::parse($date)->startOfDay());
        $figures = $this->figures($employeeId, $weekStart);
        if ($figures === null) {
            return null;
        }

        $employeeName = trim($employee->first_name.' '.$employee->last_name);
        $existing = Timesheet::where('employee_id', $employeeId)
            ->where('week_start', $weekStart->toDateString())
            ->first();

        if ($existing) {
            if (in_array($existing->status, ['Submitted', 'Approved'], true)) {
                $changed = $this->differs($existing, $figures);
                if ($changed !== (bool) $existing->needs_refresh) {
                    $existing->update(['needs_refresh' => $changed]);
                }

                return $existing->fresh();
            }

            $existing->update([
                'employee_name' => $employeeName,
                'department' => $employee->department,
                'needs_refresh' => false,
            ] + $figures);

            return $existing->fresh();
        }

        $max = Timesheet::where('id', 'like', 'TS%')->max('id');
        $num = $max ? ((int) substr($max, 2)) + 1 : 1;

        $weekEnd = $this->periodEnd($weekStart);

        return Timesheet::create([
            'id' => 'TS'.str_pad((string) $num, 3, '0', STR_PAD_LEFT),
            'employee_id' => $employeeId,
            'employee_name' => $employeeName,
            'department' => $employee->department,
            'date' => $weekEnd->toDateString(),
            'week_start' => $weekStart->toDateString(),
            'week_end' => $weekEnd->toDateString(),
            'status' => 'Draft',
            'submitted_date' => null,
            'approved_by' => null,
            'notes' => '',
            'history' => [],
        ] + $figures);
    }

    /** Bring an editable timesheet's hours up to date with attendance (used when it is reopened or resubmitted). */
    public function refreshFigures(Timesheet $t): Timesheet
    {
        $figures = $this->figures($t->employee_id, $t->week_start->copy()->startOfDay())
            ?? ['regular_hours' => 0, 'regular_holiday_hours' => 0, 'special_holiday_hours' => 0, 'overtime_hours' => 0, 'approved_ot_hours' => 0, 'paid_ot_hours' => 0, 'break_hours' => 0, 'late_minutes' => 0, 'undertime_minutes' => 0, 'total_hours' => 0];

        $t->update(['needs_refresh' => false] + $figures);

        return $t->fresh();
    }

    /**
     * The week's numbers from completed attendance, or null when there is none.
     *
     * @return array<string, float>|null
     */
    private function figures(string $employeeId, Carbon $weekStart): ?array
    {
        $weekEnd = $this->periodEnd($weekStart);

        $attendance = Attendance::where('employee_id', $employeeId)
            ->whereBetween('date', [$weekStart->toDateString(), $weekEnd->toDateString()])
            ->whereNotNull('clock_out')
            ->get();

        if ($attendance->isEmpty()) {
            return null;
        }

        $reconciliation = app(OvertimeReconciliationService::class);

        return [
            'regular_hours' => round((float) $attendance->sum('regular_hours'), 2),
            'regular_holiday_hours' => round((float) $attendance->sum('regular_holiday_hours'), 2),
            'special_holiday_hours' => round((float) $attendance->sum('special_holiday_hours'), 2),
            'overtime_hours' => round((float) $attendance->sum('overtime'), 2),
            'break_hours' => round((float) $attendance->sum('break_hours'), 2),
            'late_minutes' => (int) $attendance->sum('late_minutes'),
            'undertime_minutes' => (int) $attendance->sum('undertime_minutes'),
            'total_hours' => round((float) $attendance->sum('total_hours'), 2),
            'approved_ot_hours' => $reconciliation->approvedHoursInWeek($employeeId, $weekStart->toDateString(), $weekEnd->toDateString()),
            // What payroll actually pays: per day, the smaller of worked and approved.
            'paid_ot_hours' => $reconciliation->payableHoursForAttendance($employeeId, $attendance),
        ];
    }

    /** @param array<string, float> $figures */
    private function differs(Timesheet $t, array $figures): bool
    {
        foreach ($figures as $field => $value) {
            if (abs((float) $t->{$field} - (float) $value) > 0.004) {
                return true;
            }
        }

        return false;
    }

    /**
     * The attendance copy in this service refreshes about once a minute, so the rebuild that the attendance
     * service triggers at the moment of a change can run on stale data. This catches up: it re-syncs the
     * timesheets of the last few pay periods (editable ones are refreshed, locked ones are only flagged).
     */
    public function regenerateRecent(int $periods = 3): int
    {
        $since = $this->periodStart(Carbon::now()->subDays(max(1, $periods) * 15))->toDateString();
        $pairs = Attendance::whereNotNull('clock_out')->where('date', '>=', $since)->get(['employee_id', 'date']);

        $seen = [];
        $count = 0;
        foreach ($pairs as $row) {
            $key = $row->employee_id.'|'.$this->periodStart(Carbon::parse($row->date))->toDateString();
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;

            if ($this->syncForEmployee($row->employee_id, $row->date)) {
                $count++;
            }
        }

        return $count;
    }

    /**
     * Regenerate timesheets for every employee/period that has at least one completed attendance
     * record. Idempotent: editable rows are refreshed, locked ones are only flagged if they drifted.
     */
    public function regenerateAll(): int
    {
        $pairs = Attendance::whereNotNull('clock_out')->get(['employee_id', 'date']);

        $seen = [];
        $count = 0;
        foreach ($pairs as $row) {
            $weekStart = $this->periodStart(Carbon::parse($row->date))->toDateString();
            $key = $row->employee_id.'|'.$weekStart;
            if (isset($seen[$key])) {
                continue;
            }
            $seen[$key] = true;

            if ($this->syncForEmployee($row->employee_id, $row->date)) {
                $count++;
            }
        }

        return $count;
    }
}
