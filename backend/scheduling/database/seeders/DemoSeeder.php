<?php

namespace Database\Seeders;

use App\Models\Employee;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Loads backend/scheduling/database/demo/scheduling.json into the scheduling
 * database as real rows (dates anchored to the Monday of the current week in
 * Manila). Employee profiles come from the core demo file.
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $demo = $this->demo('scheduling');

        $this->seedEmployees();
        $this->ensureShiftDefinition((string) ($demo['shift'] ?? 'SHIFT004'));
        $this->seedSchedules($demo);
    }

    private function seedEmployees(): void
    {
        foreach ($this->coreProfiles() as $row) {
            Employee::firstOrCreate(['id' => $row['id']], $this->employeeAttrs($row));
        }
    }

    private function ensureShiftDefinition(string $shiftId): void
    {
        if (! $shiftId) {
            return;
        }

        ShiftDefinition::firstOrCreate(
            ['id' => $shiftId],
            ['id' => $shiftId, 'name' => 'Standard Shift', 'start_time' => '08:00', 'end_time' => '17:00', 'color' => '#3B82F6'],
        );
    }

    private function seedSchedules(array $demo): void
    {
        $shiftId = (string) ($demo['shift'] ?? 'SHIFT004');
        $today = Carbon::today('Asia/Manila');
        $seq = 0;

        foreach ($demo['schedules'] ?? [] as $row) {
            $seq++;
            $date = $this->dateFor((int) $row[2], (int) $row[3]);

            ShiftSchedule::updateOrCreate(
                ['employee_id' => $row[0], 'date' => $date],
                [
                    'id' => 'DSCH'.str_pad((string) $seq, 3, '0', STR_PAD_LEFT),
                    'employee_id' => $row[0],
                    'employee_name' => $row[1],
                    'shift_id' => $shiftId,
                    'date' => $date,
                    'status' => Carbon::parse($date)->lessThan($today) ? 'Completed' : 'Scheduled',
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
}