<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Timesheet;
use Illuminate\Support\Carbon;

class TimesheetGenerationService
{
    /**
     * Recompute (and create when missing) the weekly timesheet row that contains the given date for
     * the given employee, aggregated from their completed attendance records (rows with a clock-out).
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

        $weekStart = Carbon::parse($date)->startOfDay()->startOfWeek(Carbon::MONDAY);
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

        return Timesheet::create([
            'id' => 'TS'.str_pad((string) $num, 3, '0', STR_PAD_LEFT),
            'employee_id' => $employeeId,
            'employee_name' => $employeeName,
            'department' => $employee->department,
            'date' => $weekStart->copy()->endOfWeek(Carbon::SUNDAY)->toDateString(),
            'week_start' => $weekStart->toDateString(),
            'week_end' => $weekStart->copy()->endOfWeek(Carbon::SUNDAY)->toDateString(),
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
            ?? ['regular_hours' => 0, 'overtime_hours' => 0, 'approved_ot_hours' => 0, 'paid_ot_hours' => 0, 'break_hours' => 0, 'total_hours' => 0];

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
        $weekEnd = $weekStart->copy()->endOfWeek(Carbon::SUNDAY);

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
            'overtime_hours' => round((float) $attendance->sum('overtime'), 2),
            'break_hours' => round((float) $attendance->sum('break_hours'), 2),
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
     * Regenerate timesheets for every employee/week that has at least one completed attendance
     * record. Idempotent: editable rows are refreshed, locked ones are only flagged if they drifted.
     */
    public function regenerateAll(): int
    {
        $pairs = Attendance::whereNotNull('clock_out')->get(['employee_id', 'date']);

        $seen = [];
        $count = 0;
        foreach ($pairs as $row) {
            $weekStart = Carbon::parse($row->date)->startOfWeek(Carbon::MONDAY)->toDateString();
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
