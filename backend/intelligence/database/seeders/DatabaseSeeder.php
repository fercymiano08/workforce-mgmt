<?php

namespace Database\Seeders;

use App\Models\Analytics;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->seedAnalytics();
    }

    private function seedAnalytics(): void
    {
        $data = $this->mock('analytics');

        Analytics::updateOrCreate(['id' => 1], [
            'attendance_trend' => $data['attendanceTrend'] ?? [],
            'department_productivity' => $data['departmentProductivity'] ?? [],
            'leave_trend' => $data['leaveTrend'] ?? [],
            'overtime_summary' => $data['overtimeSummary'] ?? [],
            'punctuality_score' => $data['punctualityScore'] ?? [],
            'payroll_discrepancy' => $data['payrollDiscrepancy'] ?? [],
        ]);
    }

    private function mock(string $file): array
    {
        $path = database_path('mock/'.$file.'.json');
        if (! file_exists($path)) {
            return [];
        }

        return json_decode(file_get_contents($path), true);
    }
}