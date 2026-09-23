<?php

namespace Database\Seeders;

use App\Models\Analytics;
use App\Models\Attendance;
use App\Models\Department;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\Notification;
use App\Models\OvertimeRequest;
use App\Models\Role;
use App\Models\Setting;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use App\Models\Timesheet;
use App\Models\User;
use DateTime;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        // SEED_DEMO_DATA=false seeds only the fixed admin account plus the
        // department/role structure (used by the Docker bootstrap). Default is
        // unchanged: everything, including the demo users and employees.
        $demo = filter_var(env('SEED_DEMO_DATA', true), FILTER_VALIDATE_BOOLEAN);

        $this->seedUsers($demo);
        $this->seedOrgStructure();
        if ($demo) {
            $this->seedEmployees();
            $this->seedShifts();
            $this->seedLeaves();
            $this->seedOvertime();
            $this->seedAttendance();
            $this->seedTimesheets();
            $this->seedNotifications();
            $this->seedAnalytics();
        }
        $this->seedSettings();

        if (filter_var(env('SEED_DEMO', true), FILTER_VALIDATE_BOOLEAN)) {
            $this->call(DemoSeeder::class);
        }
    }

    private function seedUsers(bool $demo = true): void
    {
        User::firstOrCreate(
            ['email' => 'admin@workforcepro.com'],
            [
                'employee_id' => null,
                'name' => 'John Delgado',
                'password' => Hash::make('Admin@123'),
                'role' => 'Administrator',
                'role_label' => 'Workforce Admin',
                'avatar_seed' => 'John',
            ],
        );

        if (! $demo) {
            return;
        }

        User::firstOrCreate(
            ['email' => 'employee@workforcepro.com'],
            [
                'employee_id' => 'EMP20260001',
                'name' => 'Juan Dela Cruz',
                'password' => Hash::make('Employee@123'),
                'role' => 'Employee',
                'role_label' => 'Employee',
                'avatar_seed' => 'Juan',
            ],
        );

        User::firstOrCreate(
            ['email' => 'fercy.miano84@gmail.com'],
            [
                'employee_id' => 'EMP20264845',
                'name' => 'Fercy Miano',
                'password' => Hash::make('Employee@123'),
                'role' => 'Employee',
                'role_label' => 'Employee',
                'avatar_seed' => 'Fercy',
            ],
        );

        User::firstOrCreate(
            ['email' => 'randycapalar@gmail.com'],
            [
                'employee_id' => 'EMP20265429',
                'name' => 'John Paul Balderama',
                'password' => Hash::make('Employee@123'),
                'role' => 'Employee',
                'role_label' => 'Employee',
                'avatar_seed' => 'Balderama',
            ],
        );
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
        $data = $this->mock('employees');
        foreach ($data['employees'] ?? [] as $row) {
            Employee::firstOrCreate(['id' => $row['id']], Employee::apiFillable($row));
        }
    }

    private function seedShifts(): void
    {
        $data = $this->shiftedMock('shifts', fn ($row) => $row['date'] ?? null);
        foreach ($data['shiftDefinitions'] ?? [] as $row) {
            ShiftDefinition::updateOrCreate(['id' => $row['id']], ShiftDefinition::apiFillable($row));
        }
        foreach ($data['shiftSchedules'] ?? [] as $row) {
            ShiftSchedule::updateOrCreate(['id' => $row['id']], ShiftSchedule::apiFillable($row));
        }
    }

    private function seedLeaves(): void
    {
        $data = $this->shiftedMock('leaves', fn ($row) => $row['start_date'] ?? null);
        foreach ($data['leaves'] ?? [] as $row) {
            Leave::updateOrCreate(['id' => $row['id']], Leave::apiFillable($row));
        }
    }

    private function seedOvertime(): void
    {
        $data = $this->shiftedMock('overtime', fn ($row) => $row['date'] ?? null);
        foreach ($data['overtime'] ?? [] as $row) {
            OvertimeRequest::updateOrCreate(['id' => $row['id']], OvertimeRequest::apiFillable($row));
        }
    }

    private function seedAttendance(): void
    {
        $data = $this->shiftedMock('attendance', fn ($row) => $row['date'] ?? null);
        foreach ($data['attendance'] ?? [] as $row) {
            Attendance::updateOrCreate(['id' => $row['id']], Attendance::apiFillable($row));
        }
    }

    private function seedTimesheets(): void
    {
        $data = $this->shiftedMock('timesheets', fn ($row) => $row['date'] ?? null);
        foreach ($data['timesheets'] ?? [] as $row) {
            Timesheet::updateOrCreate(['id' => $row['id']], Timesheet::apiFillable($row));
        }
    }

    private function seedNotifications(): void
    {
        $rows = $this->mock('notifications')['notifications'] ?? [];

        // Shift every demo timestamp forward so the newest notification lands "now".
        $max = null;
        foreach ($rows as $row) {
            $ts = strtotime($row['timestamp'] ?? '');
            if ($ts && (! $max || $ts > $max)) {
                $max = $ts;
            }
        }
        $shiftSeconds = $max === null ? 0 : (time() - $max);

        foreach ($rows as $row) {
            $data = Notification::apiFillable($row);
            $data['timestamp'] = isset($data['timestamp']) && $data['timestamp']
                ? date('Y-m-d H:i:s', strtotime($data['timestamp']) + $shiftSeconds)
                : now();
            Notification::updateOrCreate(['id' => $data['id']], $data);
        }
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

    /** A new install starts with the company name filled in; nothing already saved is ever overwritten. */
    private function seedSettings(): void
    {
        $settings = $this->mock('settings')['settings'] ?? [];

        $fields = [
            'profile' => $settings['profile'] ?? null,
            'appearance' => $settings['appearance'] ?? null,
            'notifications' => $settings['notifications'] ?? null,
            'security' => $settings['security'] ?? null,
            'system' => $settings['system'] ?? null,
        ];

        foreach (['company', 'kiosk', 'ai_resolved_insights'] as $section) {
            if (isset($settings[$section])) {
                $fields[$section] = $settings[$section];
            }
        }

        $existing = Setting::find(1);
        if (empty($fields['company']['name'] ?? null) && empty($existing?->company['name'] ?? null)) {
            $fields['company'] = array_merge($fields['company'] ?? $existing?->company ?? [], ['name' => 'Archon Nell Incorporated']);
        }

        Setting::updateOrCreate(['id' => 1], $fields);
    }

    private function mock(string $file): array
    {
        $path = database_path('mock/'.$file.'.json');
        if (! file_exists($path)) {
            return [];
        }

        return json_decode(file_get_contents($path), true);
    }

    /** Shifts every date string in the mock file forward so its latest date is "today". */
    private function shiftedMock(string $file, \Closure $dateOf): array
    {
        $data = $this->mock($file);

        $maxDay = null;
        foreach ($data as $rows) {
            foreach ((array) $rows as $row) {
                $date = is_array($row) ? $dateOf($row) : null;
                if ($date && ($maxDay === null || $date > $maxDay)) {
                    $maxDay = $date;
                }
            }
        }

        if (! $maxDay) {
            return $data;
        }

        $shiftDays = (int) (new DateTime($maxDay))->diff(new DateTime('now'))->format('%a');
        if (new DateTime($maxDay) > new DateTime('now')) {
            $shiftDays = -$shiftDays;
        }
        if ($shiftDays === 0) {
            return $data;
        }

        array_walk_recursive($data, function (&$value) use ($shiftDays): void {
            if (! is_string($value)) {
                return;
            }
            $value = preg_replace_callback('/\d{4}-\d{2}-\d{2}/', function (array $m) use ($shiftDays): string {
                return (new DateTime($m[0]))->modify(($shiftDays >= 0 ? '+' : '').$shiftDays.' days')->format('Y-m-d');
            }, $value);
        });

        return $data;
    }
}