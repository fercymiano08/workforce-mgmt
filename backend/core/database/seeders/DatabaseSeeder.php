<?php

namespace Database\Seeders;

use App\Models\Department;
use App\Models\Employee;
use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $this->seedUsers();
        $this->seedOrgStructure();
        $this->seedEmployees();
    }

    private function seedUsers(): void
    {
        User::firstOrCreate(
            ['email' => 'admin@workforcepro.com'],
            [
                'employee_id' => null,
                'name' => 'John Delgado',
                'password' => Hash::make('Admin@123'),
                'role' => 'Administrator',
                'role_label' => 'HR Manager / Admin',
                'avatar_seed' => 'John',
            ],
        );

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

    private function mock(string $file): array
    {
        $path = database_path('mock/'.$file.'.json');
        if (! file_exists($path)) {
            return [];
        }

        return json_decode(file_get_contents($path), true);
    }
}