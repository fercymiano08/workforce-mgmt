<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthorizationTest extends TestCase
{
    use RefreshDatabase;

    private function employee(string $id = 'EMP001'): Employee
    {
        return Employee::create([
            'id' => $id,
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'email' => "{$id}@example.com",
            'department' => 'IT & Systems',
            'position' => 'Software Developer',
        ]);
    }

    private function employeeUser(string $employeeId): User
    {
        return User::factory()->create([
            'employee_id' => $employeeId,
            'role' => 'Employee',
            'role_label' => 'Employee',
        ]);
    }

    public function test_employee_cannot_list_all_employees(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        $this->actingAs($user)->getJson('/api/employees')->assertForbidden();
    }

    public function test_employee_cannot_delete_another_employee(): void
    {
        $employee = $this->employee('EMP001');
        $other = $this->employee('EMP002');
        $user = $this->employeeUser($employee->id);

        $this->actingAs($user)->deleteJson("/api/employees/{$other->id}")->assertForbidden();
    }

    public function test_administrator_can_list_all_employees(): void
    {
        $this->employee();
        $admin = $this->adminUser();

        $this->actingAs($admin)->getJson('/api/employees')->assertOk();
    }

    public function test_employee_can_view_their_own_attendance(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        Attendance::create([
            'id' => 'ATT001', 'employee_id' => $employee->id, 'date' => now()->toDateString(),
            'status' => 'Present',
        ]);

        $this->actingAs($user)
            ->getJson("/api/attendance/employee/{$employee->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_employee_cannot_view_another_employees_attendance(): void
    {
        $employee = $this->employee('EMP001');
        $other = $this->employee('EMP002');
        $user = $this->employeeUser($employee->id);

        $this->actingAs($user)
            ->getJson("/api/attendance/employee/{$other->id}")
            ->assertForbidden();
    }

    public function test_employee_cannot_approve_their_own_leave(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        $leave = \App\Models\Leave::create([
            'id' => 'LVE001', 'employee_id' => $employee->id, 'employee_name' => 'Juan Dela Cruz',
            'leave_type' => 'Vacation', 'start_date' => now()->toDateString(), 'end_date' => now()->toDateString(),
            'reason' => 'Test', 'status' => 'Pending', 'applied_date' => now()->toDateString(),
        ]);

        $this->actingAs($user)
            ->patchJson("/api/leaves/{$leave->id}/status", ['status' => 'Approved'])
            ->assertForbidden();
    }

    public function test_employee_can_cancel_their_own_pending_leave(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        $leave = \App\Models\Leave::create([
            'id' => 'LVE002', 'employee_id' => $employee->id, 'employee_name' => 'Juan Dela Cruz',
            'leave_type' => 'Vacation', 'start_date' => now()->toDateString(), 'end_date' => now()->toDateString(),
            'reason' => 'Test', 'status' => 'Pending', 'applied_date' => now()->toDateString(),
        ]);

        $this->actingAs($user)
            ->patchJson("/api/leaves/{$leave->id}/status", ['status' => 'Cancelled'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Cancelled');
    }

    public function test_employee_cannot_cancel_another_employees_leave(): void
    {
        $employee = $this->employee('EMP001');
        $other = $this->employee('EMP002');
        $user = $this->employeeUser($employee->id);

        $leave = \App\Models\Leave::create([
            'id' => 'LVE003', 'employee_id' => $other->id, 'employee_name' => 'Someone Else',
            'leave_type' => 'Vacation', 'start_date' => now()->toDateString(), 'end_date' => now()->toDateString(),
            'reason' => 'Test', 'status' => 'Pending', 'applied_date' => now()->toDateString(),
        ]);

        $this->actingAs($user)
            ->patchJson("/api/leaves/{$leave->id}/status", ['status' => 'Cancelled'])
            ->assertForbidden();
    }

    public function test_employee_cannot_cancel_an_already_approved_leave(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        $leave = \App\Models\Leave::create([
            'id' => 'LVE004', 'employee_id' => $employee->id, 'employee_name' => 'Juan Dela Cruz',
            'leave_type' => 'Vacation', 'start_date' => now()->toDateString(), 'end_date' => now()->toDateString(),
            'reason' => 'Test', 'status' => 'Approved', 'applied_date' => now()->toDateString(),
        ]);

        $this->actingAs($user)
            ->patchJson("/api/leaves/{$leave->id}/status", ['status' => 'Cancelled'])
            ->assertForbidden();
    }

    public function test_employee_can_cancel_their_own_pending_overtime_request(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        $request = \App\Models\OvertimeRequest::create([
            'id' => 'OT001', 'employee_id' => $employee->id, 'employee_name' => 'Juan Dela Cruz',
            'date' => now()->addDay()->toDateString(), 'reason' => 'Test', 'status' => 'Pending',
            'requested_date' => now()->toDateString(),
        ]);

        $this->actingAs($user)
            ->patchJson("/api/overtime/{$request->id}/status", ['status' => 'Cancelled'])
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertDatabaseMissing('overtime_requests', ['id' => $request->id]);
    }

    public function test_employee_cannot_cancel_another_employees_overtime_request(): void
    {
        $employee = $this->employee('EMP001');
        $other = $this->employee('EMP002');
        $user = $this->employeeUser($employee->id);

        $request = \App\Models\OvertimeRequest::create([
            'id' => 'OT002', 'employee_id' => $other->id, 'employee_name' => 'Someone Else',
            'date' => now()->addDay()->toDateString(), 'reason' => 'Test', 'status' => 'Pending',
            'requested_date' => now()->toDateString(),
        ]);

        $this->actingAs($user)
            ->patchJson("/api/overtime/{$request->id}/status", ['status' => 'Cancelled'])
            ->assertForbidden();
    }

    public function test_employee_cannot_approve_their_own_overtime_request(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        $request = \App\Models\OvertimeRequest::create([
            'id' => 'OT003', 'employee_id' => $employee->id, 'employee_name' => 'Juan Dela Cruz',
            'date' => now()->addDay()->toDateString(), 'reason' => 'Test', 'status' => 'Pending',
            'requested_date' => now()->toDateString(),
        ]);

        $this->actingAs($user)
            ->patchJson("/api/overtime/{$request->id}/status", ['status' => 'Approved'])
            ->assertForbidden();
    }

    public function test_administrator_can_approve_an_overtime_request(): void
    {
        $employee = $this->employee();
        $admin = $this->adminUser();

        $request = \App\Models\OvertimeRequest::create([
            'id' => 'OT004', 'employee_id' => $employee->id, 'employee_name' => 'Juan Dela Cruz',
            'date' => now()->addDay()->toDateString(), 'reason' => 'Test', 'status' => 'Pending',
            'requested_date' => now()->toDateString(),
        ]);

        $this->actingAs($admin)
            ->patchJson("/api/overtime/{$request->id}/status", ['status' => 'Approved', 'approvedBy' => 'John Delgado'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Approved');
    }

    public function test_employee_cannot_list_all_overtime_requests(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        $this->actingAs($user)->getJson('/api/overtime')->assertForbidden();
    }

    public function test_employee_can_submit_their_own_draft_timesheet_but_not_approve_it(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        $timesheet = \App\Models\Timesheet::create([
            'id' => 'TS001', 'employee_id' => $employee->id, 'employee_name' => 'Juan Dela Cruz',
            'department' => 'IT & Systems', 'date' => now()->toDateString(),
            'week_start' => now()->startOfWeek()->toDateString(), 'week_end' => now()->endOfWeek()->toDateString(),
            'status' => 'Draft',
        ]);

        $this->actingAs($user)
            ->patchJson("/api/timesheets/{$timesheet->id}/status", ['status' => 'Approved'])
            ->assertForbidden();

        $this->actingAs($user)
            ->patchJson("/api/timesheets/{$timesheet->id}/status", ['status' => 'Submitted'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Submitted');
    }

    public function test_employee_cannot_update_kiosk_or_company_settings(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        $this->actingAs($user)
            ->putJson('/api/settings', ['kiosk' => ['active' => true]])
            ->assertForbidden();
    }

    public function test_employee_can_read_settings_but_not_write_any_section(): void
    {
        $employee = $this->employee();
        $user = $this->employeeUser($employee->id);

        $this->actingAs($user)->getJson('/api/settings')->assertOk();
        $this->actingAs($user)
            ->putJson('/api/settings', ['company' => ['name' => 'Should Not Save']])
            ->assertForbidden();
    }

    public function test_kiosk_endpoints_work_without_authentication(): void
    {
        $employee = $this->employee();

        $this->getJson('/api/kiosk/employees')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonMissingPath('data.0.email');

        $created = $this->postJson('/api/kiosk/attendance', [
            'employeeId' => $employee->id,
            'date' => now()->toDateString(),
            'clockIn' => '08:00',
            'status' => 'Present',
        ])->assertCreated()->json('data');

        $this->putJson("/api/kiosk/attendance/{$created['id']}", [
            'clockOut' => '17:00',
            'regularHours' => 8,
            'overtime' => 0,
            'totalHours' => 8,
            'breakHours' => 1,
        ])->assertOk()->assertJsonPath('data.clockOut', '17:00');
    }

    public function test_kiosk_clock_in_rejects_a_duplicate_for_the_same_day(): void
    {
        $employee = $this->employee();

        $payload = [
            'employeeId' => $employee->id,
            'date' => now()->toDateString(),
            'clockIn' => '08:00',
            'status' => 'Present',
        ];

        $this->postJson('/api/kiosk/attendance', $payload)->assertCreated();
        $this->postJson('/api/kiosk/attendance', $payload)->assertStatus(409);
    }
}
