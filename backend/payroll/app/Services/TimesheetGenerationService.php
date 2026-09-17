<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Timesheet;
use Illuminate\Support\Carbon;

class TimesheetGenerationService
{
    /**
     * Recompute (and create when missing) the weekly timesheet row that
     * contains the given date for the given employee, aggregated from their
     * completed attendance records (rows with a clock-out).
     *
     * Existing timesheets keep their workflow status (Pending / Submitted /
     * Approved / Rejected); only the hour totals are refreshed.
     */
    public function syncForEmployee(string $employeeId, string $date): ?Timesheet
    {
        $employee = Employee::find($employeeId);
        if (! $employee) {
            return null;
        }

        $anchor = Carbon::parse($date)->startOfDay();
        $weekStart = $anchor->copy()->startOfWeek(Carbon::MONDAY);
        $weekEnd = $weekStart->copy()->endOfWeek(Carbon::SUNDAY);

        $attendance = Attendance::where('employee_id', $employeeId)
            ->whereBetween('date', [$weekStart->toDateString(), $weekEnd->toDateString()])
            ->whereNotNull('clock_out')
            ->get();

        if ($attendance->isEmpty()) {
            return null;
        }

        $regular = round((float) $attendance->sum('regular_hours'), 2);
        $overtime = round((float) $attendance->sum('overtime'), 2);
        $break = round((float) $attendance->sum('break_hours'), 2);
        $total = round((float) $attendance->sum('total_hours'), 2);
        $approvedOt = app(OvertimeReconciliationService::class)
            ->approvedHoursInWeek($employeeId, $weekStart->toDateString(), $weekEnd->toDateString());
        $employeeName = trim($employee->first_name.' '.$employee->last_name);

        $existing = Timesheet::where('employee_id', $employeeId)
            ->where('week_start', $weekStart->toDateString())
            ->first();

        if ($existing) {
            $existing->update([
                'employee_name' => $employeeName,
                'department' => $employee->department,
                'date' => $weekEnd->toDateString(),
                'week_end' => $weekEnd->toDateString(),
                'regular_hours' => $regular,
                'overtime_hours' => $overtime,
                'approved_ot_hours' => $approvedOt,
                'break_hours' => $break,
                'total_hours' => $total,
            ]);

            return $existing->fresh();
        }

        $max = Timesheet::where('id', 'like', 'TS%')->max('id');
        $num = $max ? ((int) substr($max, 2)) + 1 : 1;

        return Timesheet::create([
            'id' => 'TS'.str_pad((string) $num, 3, '0', STR_PAD_LEFT),
            'employee_id' => $employeeId,
            'employee_name' => $employeeName,
            'department' => $employee->department,
            'date' => $weekEnd->toDateString(),
            'week_start' => $weekStart->toDateString(),
            'week_end' => $weekEnd->toDateString(),
            'regular_hours' => $regular,
            'overtime_hours' => $overtime,
            'approved_ot_hours' => $approvedOt,
            'break_hours' => $break,
            'total_hours' => $total,
            'status' => 'Pending',
            'submitted_date' => null,
            'approved_by' => null,
            'notes' => '',
        ]);
    }

    /**
     * Regenerate timesheets for every employee/week that has at least one
     * completed attendance record. Idempotent: existing rows are refreshed.
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
