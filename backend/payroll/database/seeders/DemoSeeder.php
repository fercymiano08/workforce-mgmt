<?php

namespace Database\Seeders;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Notification;
use App\Models\OvertimeRequest;
use App\Models\Timesheet;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Loads the demo dataset into the payroll database.
 *
 * The payroll service mirrors time & attendance, timeoff, overtime and
 * notifications (so the payroll reports can answer "how many hours/leaves/OT
 * feed into this pay run"), plus one derived Timesheet per employee per week,
 * computed from the mirrored attendance. `backend/payroll/database/demo/
 * payroll.json` is the canonical payroll source: it names the demo workforce
 * (10 employees) and who approves.
 *
 * Attendance/timeoff/communications demo files are read from the sibling
 * services so there is a single source of truth (no duplicated JSON).
 */
class DemoSeeder extends Seeder
{
    private string $approvedBy = 'John Delgado';

    public function run(): void
    {
        $payroll = $this->demo('payroll');
        $this->approvedBy = (string) ($payroll['approved_by'] ?? $this->approvedBy);

        $this->seedEmployees();

        $attendanceDates = $this->seedAttendance();
        $this->seedLeaves();
        $this->seedOvertime();
        $this->seedNotifications();
        $this->seedTimesheets($attendanceDates);
    }

    private function seedEmployees(): void
    {
        foreach ($this->coreProfiles() as $row) {
            Employee::firstOrCreate(['id' => $row['id']], $this->employeeAttrs($row));
        }
    }

    /**
     * @return array{weekStart: string, weekEnd: string, employeeId: string, employeeName: string, department: string, regularHours: float, overtimeHours: float, breakHours: float, totalHours: float}[]
     */
    private function seedAttendance(): array
    {
        $demo = $this->siblingDemo('attendance/database/demo/attendance.json');
        $profiles = $this->employeeProfileMap();
        $weekTotals = [];
        $seq = 0;

        foreach ($demo['days'] ?? [] as $row) {
            $seq++;
            $date = $this->dateFor((int) $row['w'], (int) $row['d']);
            $hours = $this->attendanceHours($row);

            Attendance::updateOrCreate(
                ['employee_id' => $row['emp'], 'date' => $date],
                array_merge($hours, [
                    'id' => 'DATT'.str_pad((string) $seq, 3, '0', STR_PAD_LEFT),
                    'employee_id' => $row['emp'],
                    'date' => $date,
                    'location' => 'Office',
                ]),
            );

            $weekStart = Carbon::parse($date)->startOfWeek(Carbon::MONDAY)->format('Y-m-d');
            $weekEnd = Carbon::parse($date)->startOfWeek(Carbon::MONDAY)->addDays(6)->format('Y-m-d');
            $key = $row['emp'].'|'.$weekStart;
            if (! isset($weekTotals[$key])) {
                $profile = $profiles[$row['emp']] ?? [];
                $weekTotals[$key] = [
                    'weekStart' => $weekStart,
                    'weekEnd' => $weekEnd,
                    'employeeId' => $row['emp'],
                    'employeeName' => trim(($profile['first_name'] ?? '').' '.($profile['last_name'] ?? '')),
                    'department' => $profile['department'] ?? null,
                    'regularHours' => 0.0,
                    'overtimeHours' => 0.0,
                    'breakHours' => 0.0,
                    'totalHours' => 0.0,
                ];
            }

            $weekTotals[$key]['regularHours'] = round($weekTotals[$key]['regularHours'] + $hours['regular_hours'], 2);
            $weekTotals[$key]['overtimeHours'] = round($weekTotals[$key]['overtimeHours'] + $hours['overtime'], 2);
            $weekTotals[$key]['breakHours'] = round($weekTotals[$key]['breakHours'] + $hours['break_hours'], 2);
            $weekTotals[$key]['totalHours'] = round($weekTotals[$key]['totalHours'] + $hours['total_hours'], 2);
        }

        return array_values($weekTotals);
    }

    private function seedLeaves(): void
    {
        $demo = $this->siblingDemo('timeoff/database/demo/timeoff.json');

        foreach ($demo['leaves'] ?? [] as $row) {
            $start = $this->dateFor((int) $row['start']['w'], (int) $row['start']['d']);
            $end = $this->addWorkDays(Carbon::parse($start), max((int) ($row['length'] ?? 1) - 1, 0));

            Leave::updateOrCreate(
                ['id' => $row['id']],
                [
                    'id' => $row['id'],
                    'employee_id' => $row['emp'],
                    'employee_name' => $row['name'],
                    'leave_type' => $row['type'],
                    'start_date' => $start,
                    'end_date' => $end->format('Y-m-d'),
                    'reason' => $row['reason'] ?? '',
                    'status' => $row['status'],
                    'applied_date' => $this->dateFor((int) $row['applied']['w'], (int) $row['applied']['d']),
                    'approved_by' => $row['by'] ?? null,
                    'comments' => $row['comments'] ?? '',
                    'documents' => [],
                ],
            );
        }
    }

    private function seedOvertime(): void
    {
        $demo = $this->siblingDemo('timeoff/database/demo/timeoff.json');

        foreach ($demo['overtime'] ?? [] as $row) {
            $date = $this->dateFor((int) $row['w'], (int) $row['d']);
            $approved = ($row['status'] ?? '') === 'Approved';

            OvertimeRequest::updateOrCreate(
                ['id' => $row['id']],
                [
                    'id' => $row['id'],
                    'employee_id' => $row['emp'],
                    'employee_name' => $row['name'],
                    'date' => $date,
                    'expected_hours' => (float) ($row['expected'] ?? 0),
                    'approved_hours' => $row['approved'] ?? null,
                    'reason' => $row['reason'] ?? '',
                    'status' => $row['status'],
                    'requested_date' => $date,
                    'approved_by' => $row['by'] ?? null,
                    'comments' => $row['comments'] ?? '',
                    'approved_at' => $approved ? $date.' 09:40:00' : null,
                ],
            );
        }
    }

    private function seedNotifications(): void
    {
        $demo = $this->siblingDemo('communications/database/demo/communications.json');

        foreach ($demo['notifications'] ?? [] as $row) {
            Notification::updateOrCreate(
                ['id' => $row['id']],
                [
                    'id' => $row['id'],
                    'type' => $row['type'],
                    'title' => $row['title'],
                    'message' => $row['message'],
                    'timestamp' => $this->dateTimeFor((int) $row['at']['w'], (int) $row['at']['d'], (string) $row['at']['t']),
                    'read' => (bool) ($row['read'] ?? false),
                    'employee_id' => $row['emp'],
                    'priority' => $row['priority'] ?? 'medium',
                    'action_url' => $row['url'] ?? null,
                ],
            );
        }
    }

    private function seedTimesheets(array $weeks): void
    {
        $today = Carbon::today('Asia/Manila');
        $seq = 0;

        foreach ($weeks as $week) {
            if ($week['totalHours'] <= 0) {
                continue;
            }

            $seq++;
            $closed = Carbon::parse($week['weekEnd'])->lessThan($today);
            $approved = $closed;
            $status = $approved ? 'Approved' : 'Draft';

            $data = [
                'id' => 'DTS'.str_pad((string) $seq, 3, '0', STR_PAD_LEFT),
                'employee_id' => $week['employeeId'],
                'employee_name' => $week['employeeName'],
                'department' => $week['department'],
                'date' => $week['weekEnd'],
                'week_start' => $week['weekStart'],
                'week_end' => $week['weekEnd'],
                'regular_hours' => $week['regularHours'],
                'overtime_hours' => $week['overtimeHours'],
                'approved_ot_hours' => $approved ? $week['overtimeHours'] : 0,
                'paid_ot_hours' => $approved ? $week['overtimeHours'] : 0,
                'break_hours' => $week['breakHours'],
                'total_hours' => $week['totalHours'],
                'status' => $status,
                'submitted_date' => $approved ? $week['weekEnd'] : null,
                'submitted_at' => $approved ? $week['weekEnd'].' 18:00:00' : null,
                'auto_submitted' => $approved,
                'approved_by' => $approved ? $this->approvedBy : null,
                'reviewed_at' => $approved ? $week['weekEnd'].' 18:30:00' : null,
                'history' => $approved
                    ? [
                        ['event' => 'submitted', 'by' => null, 'at' => $week['weekEnd'].'T18:00:00+08:00', 'note' => null],
                        ['event' => 'approved', 'by' => $this->approvedBy, 'at' => $week['weekEnd'].'T18:30:00+08:00', 'note' => null],
                    ]
                    : [
                        ['event' => 'draft', 'by' => null, 'at' => $week['weekEnd'].'T00:00:00+08:00', 'note' => null],
                    ],
                'notes' => '',
            ];

            Timesheet::updateOrCreate(['id' => $data['id']], $data);
        }
    }

    private function attendanceHours(array $row): array
    {
        $kind = $row['kind'] ?? 'present';
        $cin = $row['cin'] ?? null;
        $out = $row['out'] ?? null;

        $overtime = in_array($kind, ['ot', 'ot_unapproved'], true)
            ? (float) ($row['ot_approved'] ?? 0)
            : 0.0;

        if ($cin && $out) {
            $minutes = (strtotime($out) - strtotime($cin)) / 60;
            $total = round(max($minutes - 60, 0) / 60, 2);
            $break = 1.0;
        } else {
            $total = 0.0;
            $break = 0.0;
        }

        return [
            'clock_in' => $cin,
            'clock_out' => $out,
            'status' => $kind === 'absent' ? 'Absent' : 'Present',
            'overtime' => $overtime,
            'regular_hours' => round(max($total - $overtime, 0), 2),
            'total_hours' => $total,
            'break_hours' => $break,
        ];
    }

    private function demo(string $file): array
    {
        $path = database_path('demo/'.$file.'.json');
        if (! file_exists($path)) {
            return [];
        }

        return json_decode(file_get_contents($path), true);
    }

    private function siblingDemo(string $rel): array
    {
        $path = base_path('../'.$rel);
        if (! file_exists($path)) {
            return [];
        }

        return json_decode(file_get_contents($path), true);
    }

    private function coreProfiles(): array
    {
        return $this->siblingDemo('core/database/demo/core.json')['employees'] ?? [];
    }

    private function employeeProfileMap(): array
    {
        $map = [];
        foreach ($this->coreProfiles() as $row) {
            $map[$row['id']] = $row;
        }

        return $map;
    }

    private function employeeAttrs(array $row): array
    {
        return [
            'first_name' => $row['first_name'],
            'last_name' => $row['last_name'],
            'email' => $row['email'],
            'phone' => $row['phone'] ?? null,
            'department' => $row['department'] ?? null,
            'position' => $row['position'] ?? null,
            'employment_type' => $row['employment_type'] ?? 'Full-time',
            'status' => $row['status'] ?? 'Active',
            'hire_date' => $row['hire_date'] ?? null,
            'salary' => $row['salary'] ?? 0,
            'avatar' => $row['avatar'] ?? 'https://api.dicebear.com/7.x/avataaars/svg?seed='.urlencode($row['first_name']),
            'address' => $row['address'] ?? null,
            'date_of_birth' => $row['date_of_birth'] ?? null,
            'gender' => $row['gender'] ?? null,
            'emergency_contact' => $row['emergency_contact'] ?? null,
            'emergency_phone' => $row['emergency_phone'] ?? null,
            'skills' => $row['skills'] ?? [],
            'education' => $row['education'] ?? null,
        ];
    }

    private function monday(): Carbon
    {
        return Carbon::now('Asia/Manila')->startOfWeek(Carbon::MONDAY);
    }

    private function dateFor(int $w, int $d): string
    {
        return $this->monday()->addDays($w * 7 + $d)->format('Y-m-d');
    }

    private function dateTimeFor(int $w, int $d, string $t): string
    {
        return $this->dateFor($w, $d).' '.$t.':00';
    }

    private function addWorkDays(Carbon $start, int $n): Carbon
    {
        $cursor = $start->copy();
        while ($n > 0) {
            $cursor = $cursor->addDay();
            if (! in_array($cursor->dayOfWeek, [Carbon::SATURDAY, Carbon::SUNDAY], true)) {
                $n--;
            }
        }

        return $cursor;
    }
}