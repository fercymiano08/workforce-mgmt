<?php

namespace Tests\Feature;

use App\Models\Leave;
use App\Models\OvertimeRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Role boundary for this service: which routes an Employee must never reach,
 * whose data an Employee must never read, and that nobody gets in unauthenticated.
 * Admin-only routes are refused by middleware before the controller runs, so the
 * ids used here do not need to exist.
 */
class RoleBoundaryTest extends TestCase
{
    use RefreshDatabase;

    private const ADMIN_ONLY = [
        ['GET', '/api/leaves'],
        ['PUT', '/api/leaves/LVE001'],
        ['DELETE', '/api/leaves/LVE001'],
        ['GET', '/api/overtime'],
        ['PATCH', '/api/overtime/bulk-status'],
        ['DELETE', '/api/overtime/OT001'],
    ];

    private const OTHER_EMPLOYEE = [
        ['GET', '/api/leaves/employee/EMP-OTHER'],
        ['GET', '/api/leaves/balances/EMP-OTHER'],
        ['GET', '/api/overtime/employee/EMP-OTHER'],
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

    public function test_employee_cannot_file_leave_or_overtime_for_someone_else(): void
    {
        $employee = $this->otpEmployeeUser();

        $this->actingAs($employee)->postJson('/api/leaves', [
            'employeeId' => 'EMP-OTHER', 'employeeName' => 'Someone Else', 'leaveType' => 'Vacation',
            'startDate' => '2030-04-01', 'endDate' => '2030-04-02', 'reason' => 'x', 'status' => 'Pending',
            'appliedDate' => '2030-03-01',
        ])->assertForbidden();

        $this->actingAs($employee)->postJson('/api/overtime', [
            'employeeId' => 'EMP-OTHER', 'employeeName' => 'Someone Else', 'date' => '2030-04-01',
            'expectedHours' => 2, 'reason' => 'x', 'status' => 'Pending', 'requestedDate' => '2030-03-01',
        ])->assertForbidden();

        $this->assertSame(0, Leave::count() + OvertimeRequest::count());
    }

    public function test_employee_can_only_withdraw_their_own_pending_leave(): void
    {
        $employee = $this->otpEmployeeUser();
        $make = fn (string $id, string $owner) => Leave::create([
            'id' => $id, 'employee_id' => $owner, 'employee_name' => 'X', 'leave_type' => 'Vacation',
            'start_date' => '2030-05-01', 'end_date' => '2030-05-02', 'reason' => 'x',
            'status' => 'Pending', 'applied_date' => '2030-04-01',
        ]);
        $make('LVE010', 'EMP-OTP');
        $make('LVE011', 'EMP-OTHER');

        // Never approve / reject - not even their own.
        foreach (['Approved', 'Rejected'] as $status) {
            $this->actingAs($employee)->patchJson('/api/leaves/LVE010/status', ['status' => $status])->assertForbidden();
        }
        // Not someone else's request, even to withdraw it.
        $this->actingAs($employee)->patchJson('/api/leaves/LVE011/status', ['status' => 'Cancelled'])->assertForbidden();
        // Their own pending request may be withdrawn.
        $this->actingAs($employee)->patchJson('/api/leaves/LVE010/status', ['status' => 'Cancelled'])->assertOk();
        $this->assertSame('Pending', Leave::find('LVE011')->status);
    }
}
