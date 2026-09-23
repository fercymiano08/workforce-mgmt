<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Computes Workforce Analytics directly from live attendance/leave/timesheet
 * data, instead of reading a one-time seeded snapshot.
 */
class AnalyticsService
{
    public function all(): array
    {
        return [
            'attendanceTrend' => $this->attendanceTrend(),
            'departmentProductivity' => $this->departmentProductivity(),
            'leaveTrend' => $this->leaveTrend(),
            'overtimeSummary' => $this->overtimeSummary(),
            'punctualityScore' => $this->punctualityScore(),
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
                'month' => $m->format('M Y'), 'present' => 0, 'absent' => 0, 'late' => 0, 'earlyLeave' => 0, 'total' => 0,
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
                } elseif ($record->status === 'Early Leave') {
                    $bucket['earlyLeave']++;
                } elseif ($record->status === 'Absent') {
                    $bucket['absent']++;
                }
                $months[$key] = $bucket;
            });

        return $months->map(function ($b) {
            // Each record has exactly one status. Attendance rate = days the person came in (on time, late or
            // left early) out of the days they were expected: approved leave is not held against anyone.
            $attended = $b['present'] + $b['late'] + $b['earlyLeave'];
            $expected = $attended + $b['absent'];
            $rate = $expected > 0 ? round(($attended / $expected) * 100, 1) : 0.0;

            return [
                'month' => $b['month'], 'present' => $b['present'], 'absent' => $b['absent'],
                'late' => $b['late'], 'earlyLeave' => $b['earlyLeave'], 'rate' => $rate,
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
                'month' => $m->format('M Y'), 'vacation' => 0, 'sick' => 0, 'emergency' => 0,
                'special' => 0, 'funeral' => 0, 'unpaid' => 0, 'total' => 0,
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
}
