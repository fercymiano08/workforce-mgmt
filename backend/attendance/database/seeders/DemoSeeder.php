<?php

namespace Database\Seeders;

use App\Models\Attendance;
use App\Models\EarlyClockOut;
use App\Models\Employee;
use App\Models\SecurityEvent;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Loads backend/attendance/database/demo/attendance.json into the attendance
 * database as real rows (dates anchored to the Monday of the current week in
 * Manila). Employee profiles are pulled from the core demo file so the local
 * employees replica stays in sync with core.
 */
class DemoSeeder extends Seeder
{
    private const SCHEDULED_END = '17:00:00';

    public function run(): void
    {
        $demo = $this->demo('attendance');

        $this->seedEmployees();

        $attendanceIds = [];
        $seq = 0;
        foreach ($demo['days'] ?? [] as $row) {
            $seq++;
            $date = $this->dateFor((int) $row['w'], (int) $row['d']);
            $hours = $this->attendanceHours($row);

            $rec = Attendance::updateOrCreate(
                ['employee_id' => $row['emp'], 'date' => $date],
                array_merge($hours, [
                    'id' => 'DATT'.str_pad((string) $seq, 3, '0', STR_PAD_LEFT),
                    'employee_id' => $row['emp'],
                    'date' => $date,
                    'location' => 'Office',
                ]),
            );

            $attendanceIds[$row['emp'].'|'.$date] = $rec->id;
        }

        $this->seedEarlyClockOuts($demo, $attendanceIds);
        $this->seedSecurityEvents($demo);
    }

    private function seedEmployees(): void
    {
        $profiles = $this->coreProfiles();
        if ($profiles === []) {
            return;
        }

        foreach ($profiles as $row) {
            Employee::firstOrCreate(['id' => $row['id']], $this->employeeAttrs($row));
        }
    }

    private function seedEarlyClockOuts(array $demo, array $attendanceIds): void
    {
        $classifiedBy = 'John Delgado';

        foreach ($demo['early'] ?? [] as $row) {
            $date = $this->dateFor((int) $row['w'], (int) $row['d']);
            $attendanceId = $attendanceIds[$row['emp'].'|'.$date] ?? null;
            $attendance = $attendanceId ? Attendance::find($attendanceId) : null;

            $actual = $attendance?->clock_out;
            $minutesEarly = 0;
            if ($actual) {
                $minutesEarly = (int) round((strtotime('1970-01-01 '.self::SCHEDULED_END) - strtotime('1970-01-01 '.$actual)) / 60);
            }

            $classified = ($row['classification'] ?? 'PENDING_REVIEW') !== 'PENDING_REVIEW';
            $provided = $classified || ! empty($row['proof']);

            EarlyClockOut::updateOrCreate(
                ['id' => $row['id']],
                [
                    'id' => $row['id'],
                    'attendance_id' => $attendanceId,
                    'employee_id' => $row['emp'],
                    'employee_name' => $row['name'],
                    'date' => $date,
                    'scheduled_end_time' => self::SCHEDULED_END,
                    'actual_clock_out_time' => $actual,
                    'minutes_early' => max($minutesEarly, 0),
                    'reason_code' => $row['reason'] ?? 'OTHER',
                    'reason_note' => $row['note'] ?? '',
                    'proof' => $row['proof'] ?? [],
                    'reason_status' => $provided ? 'PROVIDED' : 'PENDING',
                    'classification' => $row['classification'] ?? 'PENDING_REVIEW',
                    'classified_by' => $classified ? $classifiedBy : null,
                    'classified_at' => $classified ? $date.' 09:30:00' : null,
                    'notification_sent' => $classified,
                ],
            );
        }
    }

    private function seedSecurityEvents(array $demo): void
    {
        foreach ($demo['security'] ?? [] as $row) {
            $createdAt = $this->dateTimeFor((int) $row['at']['w'], (int) $row['at']['d'], (string) $row['at']['t']);
            $resolved = ($row['status'] ?? 'Open') === 'Resolved';

            $event = SecurityEvent::firstOrNew(['id' => $row['id']]);
            $event->fill([
                'id' => $row['id'],
                'type' => $row['type'],
                'message' => $row['message'],
                'detail' => $row['detail'] ?? null,
                'employee_id' => $row['emp'],
                'status' => $row['status'] ?? 'Open',
                'resolved_at' => $resolved ? Carbon::parse($createdAt)->addMinutes(35) : null,
                'resolved_by' => $resolved ? 'John Delgado' : null,
            ]);
            $event->created_at = $createdAt;
            $event->save();
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

    private function coreProfiles(): array
    {
        $path = base_path('../core/database/demo/core.json');
        if (! file_exists($path)) {
            return [];
        }

        $data = json_decode(file_get_contents($path), true);

        return $data['employees'] ?? [];
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
}