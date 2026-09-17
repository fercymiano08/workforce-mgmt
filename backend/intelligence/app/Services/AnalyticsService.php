<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Timesheet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Computes Workforce Analytics directly from live attendance/leave/timesheet/
 * salary data, instead of reading a one-time seeded snapshot.
 */
class AnalyticsService
{
    /**
     * Assumed standard working hours in a month (8h/day x ~22 working days).
     * Mirrors the frontend's ATTENDANCE_CONFIG.standardHoursPerDay assumption.
     * Used only to convert a monthly salary into an hourly rate for the
     * payroll discrepancy comparison.
     */
    private const STANDARD_MONTHLY_HOURS = 176.0;

    public function all(): array
    {
        return [
            'attendanceTrend' => $this->attendanceTrend(),
            'departmentProductivity' => $this->departmentProductivity(),
            'leaveTrend' => $this->leaveTrend(),
            'overtimeSummary' => $this->overtimeSummary(),
            'punctualityScore' => $this->punctualityScore(),
            'payrollDiscrepancy' => $this->payrollDiscrepancy(),
        ];
    }

    public function section(string $key): array
    {
        return match ($key) {
            'attendance_trend' => $this->attendanceTrend(),
            'department_productivity' => $this->departmentProductivity(),
            'leave_trend' => $this->leaveTrend(),
            'overtime_summary' => $this->overtimeSummary(),
            'punctuality_score' => $this->punctualityScore(),
            'payroll_discrepancy' => $this->payrollDiscrepancy(),
            default => [],
        };
    }

    private function attendanceTrend(): array
    {
        $start = Carbon::now()->subMonths(11)->startOfMonth();

        $months = collect();
        for ($i = 0; $i < 12; $i++) {
            $m = $start->copy()->addMonths($i);
            $months->put($m->format('Y-m'), [
                'month' => $m->format('M Y'), 'present' => 0, 'absent' => 0, 'late' => 0, 'total' => 0,
            ]);
        }

        Attendance::where('date', '>=', $start->toDateString())
            ->get(['date', 'status'])
            ->each(function ($record) use (&$months) {
                $key = $record->date->format('Y-m');
                if (! $months->has($key)) {
                    return;
                }
                $bucket = $months[$key];
                $bucket['total']++;
                if ($record->status === 'Present') {
                    $bucket['present']++;
                } elseif ($record->status === 'Late') {
                    $bucket['late']++;
                } elseif ($record->status === 'Absent') {
                    $bucket['absent']++;
                }
                $months[$key] = $bucket;
            });

        return $months->map(function ($b) {
            $rate = $b['total'] > 0 ? round((($b['present'] + $b['late']) / $b['total']) * 100, 1) : 0.0;

            return [
                'month' => $b['month'], 'present' => $b['present'], 'absent' => $b['absent'],
                'late' => $b['late'], 'rate' => $rate,
            ];
        })->values()->all();
    }

    private function leaveTrend(): array
    {
        $start = Carbon::now()->subMonths(5)->startOfMonth();

        $months = collect();
        for ($i = 0; $i < 6; $i++) {
            $m = $start->copy()->addMonths($i);
            $months->put($m->format('Y-m'), [
                'month' => $m->format('M Y'), 'vacation' => 0, 'sick' => 0, 'emergency' => 0, 'total' => 0,
            ]);
        }

        Leave::where('status', 'Approved')
            ->where('start_date', '>=', $start->toDateString())
            ->get(['leave_type', 'start_date'])
            ->each(function ($record) use (&$months) {
                $key = $record->start_date->format('Y-m');
                if (! $months->has($key)) {
                    return;
                }
                $bucket = $months[$key];
                $bucket['total']++;
                $type = strtolower($record->leave_type);
                if (array_key_exists($type, $bucket)) {
                    $bucket[$type]++;
                }
                $months[$key] = $bucket;
            });

        return $months->values()->all();
    }

    private function overtimeSummary(): array
    {
        $rows = DB::table('attendance')
            ->join('employees', 'employees.id', '=', 'attendance.employee_id')
            ->selectRaw('employees.department as department')
            ->selectRaw('AVG(attendance.overtime) as avg_overtime')
            ->selectRaw('SUM(attendance.overtime) as total_overtime')
            ->selectRaw('MAX(attendance.overtime) as max_overtime')
            ->whereNotNull('employees.department')
            ->groupBy('employees.department')
            ->get();

        return $rows->map(fn ($r) => [
            'department' => $r->department,
            'avgOvertime' => round((float) $r->avg_overtime, 1),
            'totalOvertime' => round((float) $r->total_overtime, 1),
            'maxOvertime' => round((float) $r->max_overtime, 1),
        ])->values()->all();
    }

    private function punctualityScore(): array
    {
        $rows = DB::table('attendance')
            ->join('employees', 'employees.id', '=', 'attendance.employee_id')
            ->selectRaw('employees.id as id, employees.first_name as first_name, employees.last_name as last_name, employees.department as department')
            ->selectRaw("SUM(CASE WHEN attendance.status = 'Present' THEN 1 ELSE 0 END) as present_count")
            ->selectRaw("SUM(CASE WHEN attendance.status = 'Late' THEN 1 ELSE 0 END) as late_count")
            ->groupBy('employees.id', 'employees.first_name', 'employees.last_name', 'employees.department')
            ->get();

        return $rows->filter(fn ($r) => ($r->present_count + $r->late_count) > 0)
            ->map(fn ($r) => [
                'name' => trim($r->first_name.' '.$r->last_name),
                'score' => round(($r->present_count / ($r->present_count + $r->late_count)) * 100, 1),
                'department' => $r->department,
            ])
            ->sortByDesc('score')
            ->values()
            ->all();
    }

    /**
     * Heuristic proxy, not a directly measured metric: there is no task or
     * output tracking anywhere in the schema to derive a "true" productivity
     * number from. This is a weighted composite of real attendance rate,
     * punctuality, and overtime burden (more unplanned overtime lowers the
     * score) per department, normalized to 0-100.
     */
    private function departmentProductivity(): array
    {
        $rows = DB::table('attendance')
            ->join('employees', 'employees.id', '=', 'attendance.employee_id')
            ->selectRaw('employees.department as department')
            ->selectRaw('COUNT(*) as total')
            ->selectRaw("SUM(CASE WHEN attendance.status = 'Absent' THEN 1 ELSE 0 END) as absent_count")
            ->selectRaw("SUM(CASE WHEN attendance.status = 'Present' THEN 1 ELSE 0 END) as present_count")
            ->selectRaw("SUM(CASE WHEN attendance.status = 'Late' THEN 1 ELSE 0 END) as late_count")
            ->selectRaw('AVG(attendance.overtime) as avg_overtime')
            ->whereNotNull('employees.department')
            ->groupBy('employees.department')
            ->get();

        return $rows->map(function ($r) {
            $attendanceRate = $r->total > 0 ? (($r->total - $r->absent_count) / $r->total) * 100 : 0.0;
            $punctuality = ($r->present_count + $r->late_count) > 0
                ? ($r->present_count / ($r->present_count + $r->late_count)) * 100
                : 0.0;
            $overtimeScore = max(0.0, 100 - ((float) $r->avg_overtime * 10));

            $productivity = (0.5 * $attendanceRate) + (0.3 * $punctuality) + (0.2 * $overtimeScore);

            return [
                'name' => $r->department,
                'productivity' => round(min(100, max(0, $productivity)), 1),
                'attendance' => round($attendanceRate, 1),
                'efficiency' => round(min(100, max(0, $overtimeScore)), 1),
            ];
        })->values()->all();
    }

    /**
     * Compares each salaried employee's expected monthly pay against pay
     * derived from their actual logged hours (their timesheets summed over
     * the most recent month that has timesheet data company-wide).
     */
    private function payrollDiscrepancy(): array
    {
        $latestWeekEnd = Timesheet::max('week_end');
        if (! $latestWeekEnd) {
            return [];
        }
        $month = Carbon::parse($latestWeekEnd)->format('Y-m');

        $timesheetsByEmployee = Timesheet::get(['employee_id', 'week_end', 'total_hours'])
            ->filter(fn ($ts) => $ts->week_end->format('Y-m') === $month)
            ->groupBy('employee_id');

        return Employee::where('salary', '>', 0)->get()
            ->map(function (Employee $employee) use ($timesheetsByEmployee, $month) {
                $hours = (float) ($timesheetsByEmployee->get($employee->id)?->sum('total_hours') ?? 0);
                if ($hours <= 0) {
                    return null;
                }

                $expectedPay = round((float) $employee->salary, 2);
                $hourlyRate = $expectedPay / self::STANDARD_MONTHLY_HOURS;
                $actualPay = round($hourlyRate * $hours, 2);
                $difference = round($actualPay - $expectedPay, 2);

                $status = 'Correct';
                if (abs($difference) > max(50, $expectedPay * 0.01)) {
                    $status = $difference > 0 ? 'Overpaid' : 'Underpaid';
                }

                return [
                    'employeeId' => $employee->id,
                    'employeeName' => trim($employee->first_name.' '.$employee->last_name),
                    'department' => $employee->department,
                    'expectedPay' => $expectedPay,
                    'actualPay' => $actualPay,
                    'difference' => $difference,
                    'status' => $status,
                    'month' => Carbon::parse($month.'-01')->format('M Y'),
                ];
            })
            ->filter()
            ->values()
            ->all();
    }
}
