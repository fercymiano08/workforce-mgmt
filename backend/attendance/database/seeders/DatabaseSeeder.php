<?php

namespace Database\Seeders;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Notification;
use App\Models\Setting;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use App\Models\Timesheet;
use Illuminate\Database\Seeder;
use DateTime;

class DatabaseSeeder extends Seeder
{
    private int $dateShiftDays = 0;

    public function run(): void
    {
        $this->computeDateShift();

        $this->seedEmployees();
        $this->seedShifts();
        $this->seedLeaves();
        $this->seedAttendance();
        $this->seedTimesheets();
        $this->seedNotifications();
        $this->seedSettings();
    }

    private function computeDateShift(): void
    {
        $maxDay = null;
        foreach ($this->mock('attendance')['attendance'] ?? [] as $row) {
            $date = $row['date'] ?? null;
            if ($date && ($maxDay === null || $date > $maxDay)) {
                $maxDay = $date;
            }
        }

        if ($maxDay) {
            $this->dateShiftDays = (int) (new DateTime($maxDay))->diff(new DateTime('now'))->format('%a');
        }
    }

    private function mock(string $file): array
    {
        $path = database_path('mock/'.$file.'.json');
        if (! file_exists($path)) {
            return [];
        }

        return json_decode(file_get_contents($path), true);
    }

    private function shiftedMock(string $file): array
    {
        $data = $this->mock($file);
        if ($this->dateShiftDays === 0) {
            return $data;
        }

        array_walk_recursive($data, function (&$value): void {
            if (! is_string($value)) {
                return;
            }
            $value = preg_replace_callback('/\d{4}-\d{2}-\d{2}/', function (array $m): string {
                return (new DateTime($m[0]))->modify(($this->dateShiftDays >= 0 ? '+' : '').$this->dateShiftDays.' days')->format('Y-m-d');
            }, $value);
        });

        return $data;
    }

    private function seedEmployees(): void
    {
        foreach ($this->mock('employees')['employees'] ?? [] as $row) {
            Employee::firstOrCreate(['id' => $row['id']], Employee::apiFillable($row));
        }
    }

    private function seedShifts(): void
    {
        $data = $this->shiftedMock('shifts');
        foreach ($data['shiftDefinitions'] ?? [] as $row) {
            ShiftDefinition::updateOrCreate(['id' => $row['id']], ShiftDefinition::apiFillable($row));
        }
        foreach ($data['shiftSchedules'] ?? [] as $row) {
            ShiftSchedule::updateOrCreate(['id' => $row['id']], ShiftSchedule::apiFillable($row));
        }
    }

    private function seedLeaves(): void
    {
        foreach ($this->shiftedMock('leaves')['leaves'] ?? [] as $row) {
            Leave::updateOrCreate(['id' => $row['id']], Leave::apiFillable($row));
        }
    }

    private function seedAttendance(): void
    {
        foreach ($this->shiftedMock('attendance')['attendance'] ?? [] as $row) {
            Attendance::updateOrCreate(['id' => $row['id']], Attendance::apiFillable($row));
        }
    }

    private function seedTimesheets(): void
    {
        foreach ($this->shiftedMock('timesheets')['timesheets'] ?? [] as $row) {
            Timesheet::updateOrCreate(['id' => $row['id']], Timesheet::apiFillable($row));
        }
    }

    private function seedNotifications(): void
    {
        foreach ($this->shiftedMock('notifications')['notifications'] ?? [] as $row) {
            Notification::updateOrCreate(['id' => $row['id']], Notification::apiFillable($row));
        }
    }

    private function seedSettings(): void
    {
        $settings = $this->shiftedMock('settings')['settings'] ?? [];
        Setting::updateOrCreate(['id' => 1], [
            'profile' => $settings['profile'] ?? null,
            'appearance' => $settings['appearance'] ?? null,
            'notifications' => $settings['notifications'] ?? null,
            'security' => $settings['security'] ?? null,
            'system' => $settings['system'] ?? null,
            'company' => $settings['company'] ?? null,
            'kiosk' => $settings['kiosk'] ?? null,
            'ai_resolved_insights' => $settings['ai_resolved_insights'] ?? null,
        ]);
    }
}