<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\Leave;
use App\Models\OvertimeRequest;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Loads backend/timeoff/database/demo/timeoff.json into the timeoff database
 * as real rows (dates anchored to the Monday of the current week in Manila).
 * Employee profiles come from the core demo file.
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $demo = $this->demo('timeoff');

        $this->seedEmployees();
        $this->seedLeaves($demo['leaves'] ?? []);
        $this->seedOvertime($demo['overtime'] ?? []);
    }

    private function seedEmployees(): void
    {
        foreach ($this->coreProfiles() as $row) {
            Employee::firstOrCreate(['id' => $row['id']], $this->employeeAttrs($row));
        }
    }

    private function seedLeaves(array $rows): void
    {
        foreach ($rows as $row) {
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
                    'days' => (float) ($row['length'] ?? 1),
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

    private function seedOvertime(array $rows): void
    {
        foreach ($rows as $row) {
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