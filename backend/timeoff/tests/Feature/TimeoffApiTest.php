<?php

namespace Tests\Feature;

use App\Models\Leave;
use App\Models\OvertimeRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class TimeoffApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_leave_routes_require_authentication(): void
    {
        $this->getJson('/api/leaves')->assertUnauthorized();
        $this->getJson('/api/overtime')->assertUnauthorized();
    }

    public function test_employee_can_submit_leave_request(): void
    {
        $employee = $this->otpEmployeeUser();

        $this->actingAs($employee)
            ->postJson('/api/leaves', [
                'employeeId' => 'EMP-OTP',
                'employeeName' => 'Juan Dela Cruz',
                'leaveType' => 'Vacation',
                'startDate' => '2030-02-10',
                'endDate' => '2030-02-12',
                'reason' => 'Family trip',
                'status' => 'Pending',
                'appliedDate' => '2030-02-01',
            ])
            ->assertCreated()
            ->assertJsonStructure(['data' => ['id']]);
    }

    public function test_employee_can_submit_overtime_request(): void
    {
        $employee = $this->otpEmployeeUser();

        $this->actingAs($employee)
            ->postJson('/api/overtime', [
                'employeeId' => 'EMP-OTP',
                'employeeName' => 'Juan Dela Cruz',
                'date' => '2030-02-15',
                'expectedHours' => 2,
                'reason' => 'Project deadline',
                'status' => 'Pending',
                'requestedDate' => '2030-02-01',
            ])
            ->assertCreated()
            ->assertJsonStructure(['data' => ['id']]);
    }

    public function test_employee_cannot_self_approve_leave_at_creation(): void
    {
        $employee = $this->otpEmployeeUser();

        $this->actingAs($employee)
            ->postJson('/api/leaves', [
                'employeeId' => 'EMP-OTP',
                'employeeName' => 'Juan Dela Cruz',
                'leaveType' => 'Vacation',
                'startDate' => '2030-03-10',
                'endDate' => '2030-03-11',
                'reason' => 'Try to self-approve',
                'status' => 'Approved',
                'approvedBy' => 'John Delgado',
                'appliedDate' => '2030-03-01',
            ])
            ->assertCreated();

        $leave = Leave::where('reason', 'Try to self-approve')->firstOrFail();
        $this->assertSame('Pending', $leave->status);
        $this->assertNull($leave->approved_by);
    }

    public function test_employee_cannot_self_approve_overtime_at_creation(): void
    {
        $employee = $this->otpEmployeeUser();

        $this->actingAs($employee)
            ->postJson('/api/overtime', [
                'employeeId' => 'EMP-OTP',
                'employeeName' => 'Juan Dela Cruz',
                'date' => '2030-03-15',
                'expectedHours' => 3,
                'reason' => 'Try to self-approve OT',
                'status' => 'Approved',
                'approvedBy' => 'John Delgado',
                'requestedDate' => '2030-03-01',
            ])
            ->assertCreated();

        $ot = OvertimeRequest::where('reason', 'Try to self-approve OT')->firstOrFail();
        $this->assertSame('Pending', $ot->status);
        $this->assertNull($ot->approved_by);
    }

    public function test_admin_can_approve_leave_and_overtime(): void
    {
        $admin = $this->adminUser();

        $leave = Leave::create([
            'id' => 'LVE001',
            'employee_id' => 'EMP20260001',
            'employee_name' => 'Juan Dela Cruz',
            'leave_type' => 'Vacation',
            'start_date' => '2030-02-10',
            'end_date' => '2030-02-12',
            'reason' => 'Family trip',
            'status' => 'Pending',
            'applied_date' => '2030-02-01',
        ]);
        $overtime = OvertimeRequest::create([
            'id' => 'OT001',
            'employee_id' => 'EMP20260001',
            'employee_name' => 'Juan Dela Cruz',
            'date' => '2030-02-15',
            'reason' => 'Project deadline',
            'status' => 'Pending',
            'requested_date' => '2030-02-01',
        ]);

        $this->actingAs($admin)
            ->patchJson('/api/leaves/'.$leave->id.'/status', ['status' => 'Approved', 'approvedBy' => 'John Delgado'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Approved');

        $this->actingAs($admin)
            ->patchJson('/api/overtime/'.$overtime->id.'/status', ['status' => 'Approved', 'approvedBy' => 'John Delgado'])
            ->assertOk()
            ->assertJsonPath('data.status', 'Approved');
    }

    public function test_peer_can_update_statuses_with_service_token(): void
    {
        $leave = Leave::create([
            'id' => 'LVE002',
            'employee_id' => 'EMP20260001',
            'employee_name' => 'Juan Dela Cruz',
            'leave_type' => 'Sick',
            'start_date' => '2030-03-01',
            'end_date' => '2030-03-01',
            'reason' => 'Flu',
            'status' => 'Pending',
            'applied_date' => '2030-02-20',
        ]);

        $this->withHeader('X-Service-Token', config('svc.token'))
            ->postJson('/api/internal/leaves/'.$leave->id.'/status', [
                'status' => 'Rejected',
                'approvedBy' => 'Workforce AI',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'Rejected');
    }
}