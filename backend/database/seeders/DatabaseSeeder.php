<?php

namespace Database\Seeders;

use App\Models\Analytics;
use App\Models\Attendance;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Notification;
use App\Models\Role;
use App\Models\Setting;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use App\Models\Timesheet;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;
use DateTime;
use DateTimeImmutable;

class DatabaseSeeder extends Seeder
{
    private int $dateShiftDays = 0;

    private int $monthShift = 0;

    public function run(): void
    {
        // Minimal mode (default): only the fixed HR manager login account
        // plus the org structure (departments + roles) configuration.
        // Rich demo data is restored with SEED_DEMO_DATA=true.
        if (! filter_var(env('SEED_DEMO_DATA', false), FILTER_VALIDATE_BOOL)) {
            $this->seedMinimal();
            $this->seedOrgStructure();

            return;
        }

        $this->computeDateShift();

        $this->seedUsers();
        $this->seedOrgStructure();
        $this->seedEmployees();
        $this->seedAttendance();
        $this->seedLeaves();
        $this->seedShifts();
        $this->seedTimesheets();
        $this->seedNotifications();
        $this->seedSettings();
        $this->seedAnalytics();
    }

    private function seedMinimal(): void
    {
        User::query()->delete();

        User::create([
            'employee_id' => null,
            'name' => 'John Delgado',
            'email' => 'admin@workforcepro.com',
            'password' => Hash::make('Admin@123'),
            'role' => 'Administrator',
            'role_label' => 'HR Manager / Admin',
            'avatar_seed' => 'John',
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

    /**
     * Shift the mock data so the demo timeline always ends on "today".
     * Daily dates (Y-m-d) are anchored to the attendance timeline; month
     * labels ("Mon YYYY") are anchored to the analytics trend.
     */
    private function computeDateShift(): void
    {
        $attendance = $this->mock('attendance');
        $maxDay = null;
        foreach ($attendance['attendance'] ?? [] as $row) {
            $date = $row['date'] ?? null;
            if ($date && ($maxDay === null || $date > $maxDay)) {
                $maxDay = $date;
            }
        }
        if ($maxDay) {
            $absDays = (int) (new DateTime($maxDay))->diff(new DateTime('now'))->format('%a');
            $this->dateShiftDays = (int) (ceil($absDays / 7) * 7);
        }

        $analytics = $this->mock('analytics');
        $maxMonth = null;
        foreach (['attendanceTrend', 'leaveTrend', 'departmentProductivity', 'punctualityScore'] as $section) {
            foreach ($analytics[$section] ?? [] as $row) {
                $month = $row['month'] ?? null;
                if ($month && ($maxMonth === null || $this->monthKey($month) > $this->monthKey($maxMonth))) {
                    $maxMonth = $month;
                }
            }
        }
        if ($maxMonth) {
            $now = new DateTimeImmutable('now');
            $anchor = new DateTimeImmutable('first day of '.$maxMonth);
            $this->monthShift = ($now->format('Y') * 12 + $now->format('n')) - ($anchor->format('Y') * 12 + $anchor->format('n'));
        }
    }

    private function monthKey(string $label): string
    {
        $months = [
            'Jan' => 1, 'Feb' => 2, 'Mar' => 3, 'Apr' => 4, 'May' => 5, 'Jun' => 6,
            'Jul' => 7, 'Aug' => 8, 'Sep' => 9, 'Oct' => 10, 'Nov' => 11, 'Dec' => 12,
        ];
        if (preg_match('/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})$/', $label, $m)) {
            return $m[2].'-'.str_pad((string) $months[$m[1]], 2, '0', STR_PAD_LEFT);
        }

        return '';
    }

    private function shiftedMock(string $file): array
    {
        $data = $this->mock($file);
        if ($this->dateShiftDays === 0 && $this->monthShift === 0) {
            return $data;
        }

        array_walk_recursive($data, function (&$value): void {
            if (! is_string($value)) {
                return;
            }
            if ($this->dateShiftDays !== 0) {
                $value = preg_replace_callback('/\d{4}-\d{2}-\d{2}/', function (array $m): string {
                    return (new DateTime($m[0]))->modify(($this->dateShiftDays >= 0 ? '+' : '').$this->dateShiftDays.' days')->format('Y-m-d');
                }, $value);
            }
            if ($this->monthShift !== 0) {
                $value = preg_replace_callback('/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4})\b/', function (array $m): string {
                    return (new DateTime('first day of '.$m[0]))->modify(($this->monthShift >= 0 ? '+' : '').$this->monthShift.' months')->format('M Y');
                }, $value);
            }
        });

        return $data;
    }

    private function seedUsers(): void
    {
        User::query()->delete();

        User::create([
            'employee_id' => null,
            'name' => 'John Delgado',
            'email' => 'admin@workforcepro.com',
            'password' => Hash::make('Admin@123'),
            'role' => 'Administrator',
            'role_label' => 'HR Manager / Admin',
            'avatar_seed' => 'John',
        ]);

        User::create([
            'employee_id' => 'EMP001',
            'name' => 'Juan Dela Cruz',
            'email' => 'employee@workforcepro.com',
            'password' => Hash::make('Employee@123'),
            'role' => 'Employee',
            'role_label' => 'Employee',
            'avatar_seed' => 'Juan',
        ]);
    }

    private function seedOrgStructure(): void
    {
        $departments = [
            [
                'id' => 'DEPT001',
                'name' => 'Customer Service',
                'head' => null,
                'head_id' => null,
                'employee_count' => 0,
                'budget' => 0,
                'location' => 'Makati City - Tower A, Floor 4',
                'description' => 'Handles customer inquiries, order support, returns, and escalations across all channels.',
            ],
            [
                'id' => 'DEPT002',
                'name' => 'Sales & Merchandising',
                'head' => null,
                'head_id' => null,
                'employee_count' => 0,
                'budget' => 0,
                'location' => 'Makati City - Tower B, Floor 6',
                'description' => 'Drives revenue through product sales, promotions, and in-store merchandising.',
            ],
            [
                'id' => 'DEPT003',
                'name' => 'Warehousing & Logistics',
                'head' => null,
                'head_id' => null,
                'employee_count' => 0,
                'budget' => 0,
                'location' => 'Parañaque City - FTI Logistics Hub',
                'description' => 'Manages inventory, picking and packing, shipping, and delivery operations.',
            ],
            [
                'id' => 'DEPT004',
                'name' => 'IT & Systems',
                'head' => null,
                'head_id' => null,
                'employee_count' => 0,
                'budget' => 0,
                'location' => 'Pasig City - Building A, Floor 11',
                'description' => 'Maintains the ecommerce platform, IT infrastructure, security, and technical support.',
            ],
            [
                'id' => 'DEPT005',
                'name' => 'Finance & Accounting',
                'head' => null,
                'head_id' => null,
                'employee_count' => 0,
                'budget' => 0,
                'location' => 'Taguig City - BGC Center, Floor 10',
                'description' => 'Oversees financial planning, accounting, payroll, and tax compliance.',
            ],
            [
                'id' => 'DEPT006',
                'name' => 'Marketing',
                'head' => null,
                'head_id' => null,
                'employee_count' => 0,
                'budget' => 0,
                'location' => 'Pasig City - Building B, Floor 8',
                'description' => 'Leads digital campaigns, content, social media, and brand growth.',
            ],
            [
                'id' => 'DEPT007',
                'name' => 'Human Resources',
                'head' => null,
                'head_id' => null,
                'employee_count' => 0,
                'budget' => 0,
                'location' => 'Makati City - Tower A, Floor 5',
                'description' => 'Manages talent acquisition, employee relations, and organizational development.',
            ],
            [
                'id' => 'DEPT008',
                'name' => 'Operations',
                'head' => null,
                'head_id' => null,
                'employee_count' => 0,
                'budget' => 0,
                'location' => 'Mandaluyong City - Shangri-La Plaza, Floor 3',
                'description' => 'Coordinates daily operations, procurement, and process improvement.',
            ],
        ];

        foreach ($departments as $row) {
            Department::updateOrCreate(['id' => $row['id']], Department::apiFillable($row));
        }

        $roles = [
            ['id' => 'ROLE001', 'department_id' => 'DEPT001', 'name' => 'Customer Service Representative'],
            ['id' => 'ROLE002', 'department_id' => 'DEPT001', 'name' => 'Senior Customer Service Representative'],
            ['id' => 'ROLE003', 'department_id' => 'DEPT001', 'name' => 'QA Specialist'],
            ['id' => 'ROLE004', 'department_id' => 'DEPT001', 'name' => 'Escalation Supervisor'],
            ['id' => 'ROLE005', 'department_id' => 'DEPT002', 'name' => 'Sales Associate'],
            ['id' => 'ROLE006', 'department_id' => 'DEPT002', 'name' => 'Cashier'],
            ['id' => 'ROLE007', 'department_id' => 'DEPT002', 'name' => 'Merchandiser'],
            ['id' => 'ROLE008', 'department_id' => 'DEPT002', 'name' => 'Store Supervisor'],
            ['id' => 'ROLE009', 'department_id' => 'DEPT003', 'name' => 'Warehouse Staff'],
            ['id' => 'ROLE010', 'department_id' => 'DEPT003', 'name' => 'Picker & Packer'],
            ['id' => 'ROLE011', 'department_id' => 'DEPT003', 'name' => 'Inventory Clerk'],
            ['id' => 'ROLE012', 'department_id' => 'DEPT003', 'name' => 'Logistics Coordinator'],
            ['id' => 'ROLE013', 'department_id' => 'DEPT003', 'name' => 'Delivery Rider'],
            ['id' => 'ROLE014', 'department_id' => 'DEPT004', 'name' => 'IT Support Specialist'],
            ['id' => 'ROLE015', 'department_id' => 'DEPT004', 'name' => 'Systems Administrator'],
            ['id' => 'ROLE016', 'department_id' => 'DEPT004', 'name' => 'Software Developer'],
            ['id' => 'ROLE017', 'department_id' => 'DEPT004', 'name' => 'Data Analyst'],
            ['id' => 'ROLE018', 'department_id' => 'DEPT005', 'name' => 'Accountant'],
            ['id' => 'ROLE019', 'department_id' => 'DEPT005', 'name' => 'Bookkeeper'],
            ['id' => 'ROLE020', 'department_id' => 'DEPT005', 'name' => 'Finance Analyst'],
            ['id' => 'ROLE021', 'department_id' => 'DEPT005', 'name' => 'Payroll Specialist'],
            ['id' => 'ROLE022', 'department_id' => 'DEPT006', 'name' => 'Digital Marketing Specialist'],
            ['id' => 'ROLE023', 'department_id' => 'DEPT006', 'name' => 'Content Creator'],
            ['id' => 'ROLE024', 'department_id' => 'DEPT006', 'name' => 'Social Media Manager'],
            ['id' => 'ROLE025', 'department_id' => 'DEPT006', 'name' => 'Graphic Designer'],
            ['id' => 'ROLE026', 'department_id' => 'DEPT007', 'name' => 'HR Specialist'],
            ['id' => 'ROLE027', 'department_id' => 'DEPT007', 'name' => 'Recruitment Officer'],
            ['id' => 'ROLE028', 'department_id' => 'DEPT007', 'name' => 'Training Coordinator'],
            ['id' => 'ROLE029', 'department_id' => 'DEPT007', 'name' => 'HR Manager'],
            ['id' => 'ROLE030', 'department_id' => 'DEPT008', 'name' => 'Operations Staff'],
            ['id' => 'ROLE031', 'department_id' => 'DEPT008', 'name' => 'Team Leader'],
            ['id' => 'ROLE032', 'department_id' => 'DEPT008', 'name' => 'Procurement Officer'],
            ['id' => 'ROLE033', 'department_id' => 'DEPT008', 'name' => 'Operations Manager'],
        ];

        foreach ($roles as $row) {
            Role::updateOrCreate(['id' => $row['id']], $row);
        }
    }

    private function seedEmployees(): void
    {
        Employee::query()->delete();

        $data = $this->mock('employees');
        foreach ($data['employees'] ?? [] as $row) {
            Employee::create(Employee::apiFillable($row));
        }
    }

    private function seedAttendance(): void
    {
        Attendance::query()->delete();

        $data = $this->shiftedMock('attendance');
        foreach ($data['attendance'] ?? [] as $row) {
            Attendance::create(Attendance::apiFillable($row));
        }
    }

    private function seedLeaves(): void
    {
        Leave::query()->delete();

        $data = $this->shiftedMock('leaves');
        foreach ($data['leaves'] ?? [] as $row) {
            Leave::create(Leave::apiFillable($row));
        }
    }

    private function seedShifts(): void
    {
        ShiftDefinition::query()->delete();
        ShiftSchedule::query()->delete();

        $data = $this->shiftedMock('shifts');
        foreach ($data['shiftDefinitions'] ?? [] as $row) {
            ShiftDefinition::create(ShiftDefinition::apiFillable($row));
        }
        foreach ($data['shiftSchedules'] ?? [] as $row) {
            ShiftSchedule::create(ShiftSchedule::apiFillable($row));
        }
    }

    private function seedTimesheets(): void
    {
        Timesheet::query()->delete();

        $data = $this->shiftedMock('timesheets');
        foreach ($data['timesheets'] ?? [] as $row) {
            Timesheet::create(Timesheet::apiFillable($row));
        }
    }

    private function seedNotifications(): void
    {
        Notification::query()->delete();

        $data = $this->shiftedMock('notifications');
        foreach ($data['notifications'] ?? [] as $row) {
            Notification::create(Notification::apiFillable($row));
        }
    }

    private function seedSettings(): void
    {
        Setting::query()->delete();

        $data = $this->shiftedMock('settings');
        $settings = $data['settings'] ?? [];

        Setting::create([
            'profile' => $settings['profile'] ?? null,
            'appearance' => $settings['appearance'] ?? null,
            'notifications' => $settings['notifications'] ?? null,
            'security' => $settings['security'] ?? null,
            'system' => $settings['system'] ?? null,
        ]);
    }

    private function seedAnalytics(): void
    {
        Analytics::query()->delete();

        $data = $this->shiftedMock('analytics');

        Analytics::create([
            'attendance_trend' => $data['attendanceTrend'] ?? [],
            'department_productivity' => $data['departmentProductivity'] ?? [],
            'leave_trend' => $data['leaveTrend'] ?? [],
            'overtime_summary' => $data['overtimeSummary'] ?? [],
            'punctuality_score' => $data['punctualityScore'] ?? [],
            'payroll_discrepancy' => $data['payrollDiscrepancy'] ?? [],
        ]);
    }
}
