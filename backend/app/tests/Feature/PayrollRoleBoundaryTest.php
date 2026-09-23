<?php

namespace Tests\Feature;

use App\Models\Timesheet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Role boundary for this service: which routes an Employee must never reach,
 * whose data an Employee must never read, and that nobody gets in unauthenticated.
 * Admin-only routes are refused by middleware before the controller runs, so the
 * ids used here do not need to exist.
 */
class PayrollRoleBoundaryTest extends TestCase
{
    use RefreshDatabase;

    private const ADMIN_ONLY = [
        ['GET', '/api/timesheets'],
        ['POST', '/api/timesheets/payroll-export'],
        ['PUT', '/api/timesheets/TS001'],
        ['DELETE', '/api/timesheets/TS001'],
    ];

    private const OTHER_EMPLOYEE = [
        ['GET', '/api/timesheets/employee/EMP-OTHER'],
    ];

    public function test_anonymous_requests_are_rejected_everywhere(): void
    {
        foreach ([...self::ADMIN_ONLY, ...self::OTHER_EMPLOYEE] as [$method, $uri]) {
            $this->json($method, $uri)->assertUnauthorized();
        }
    }

    public function test_employee_is_refused_on_every_administrator_route(): void
    {
        $employee = $this->otpEmployeeUser();

        foreach (self::ADMIN_ONLY as [$method, $uri]) {
            $this->actingAs($employee)->json($method, $uri)->assertForbidden();
        }
    }

    public function test_employee_cannot_read_another_employees_data(): void
    {
        $employee = $this->otpEmployeeUser();

        foreach (self::OTHER_EMPLOYEE as [$method, $uri]) {
            $this->actingAs($employee)->json($method, $uri)->assertForbidden();
        }
    }

    public function test_administrator_is_not_blocked_from_reading_an_employees_data(): void
    {
        $admin = $this->adminUser();

        foreach (self::OTHER_EMPLOYEE as [$method, $uri]) {
            $this->assertNotSame(403, $this->actingAs($admin)->json($method, $uri)->status(), $uri);
        }
    }

    public function test_employee_cannot_read_or_change_someone_elses_timesheet(): void
    {
        $employee = $this->otpEmployeeUser();
        Timesheet::create([
            'id' => 'TS900', 'employee_id' => 'EMP-OTHER', 'employee_name' => 'Someone Else',
            'department' => 'IT & Systems', 'date' => now()->toDateString(),
            'week_start' => now()->startOfWeek()->toDateString(), 'week_end' => now()->endOfWeek()->toDateString(),
            'regular_hours' => 8, 'overtime_hours' => 0, 'break_hours' => 1, 'total_hours' => 8, 'status' => 'Draft',
        ]);

        $this->actingAs($employee)->getJson('/api/timesheets/TS900')->assertForbidden();
        $this->actingAs($employee)->patchJson('/api/timesheets/TS900/status', ['status' => 'Submitted'])->assertForbidden();
        $this->assertSame('Draft', Timesheet::find('TS900')->status);
    }

    public function test_employee_can_never_approve_a_timesheet_even_their_own(): void
    {
        $employee = $this->otpEmployeeUser();
        Timesheet::create([
            'id' => 'TS901', 'employee_id' => 'EMP-OTP', 'employee_name' => 'Juan',
            'department' => 'IT & Systems', 'date' => now()->subWeek()->endOfWeek()->toDateString(),
            'week_start' => now()->subWeek()->startOfWeek()->toDateString(), 'week_end' => now()->subWeek()->endOfWeek()->toDateString(),
            'regular_hours' => 8, 'overtime_hours' => 0, 'break_hours' => 1, 'total_hours' => 8, 'status' => 'Draft',
        ]);

        $this->actingAs($employee)->patchJson('/api/timesheets/TS901/status', ['status' => 'Approved'])->assertForbidden();
        $this->actingAs($employee)->patchJson('/api/timesheets/TS901/status', ['status' => 'Submitted'])->assertOk();
    }
}
