<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\OvertimeRequest;
use App\Models\Timesheet;
use App\Services\OvertimeReconciliationService;
use App\Services\TimesheetGenerationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class OvertimeReconciliationTest extends TestCase
{
    use RefreshDatabase;

    private function employee(string $id = 'EMP001'): Employee
    {
        return Employee::create([
            'id' => $id,
            'first_name' => 'Fercy',
            'last_name' => 'Miano',
            'email' => "{$id}@example.com",
            'department' => 'IT & Systems',
            'position' => 'Software Developer',
        ]);
    }

    private function overtime(string $id, string $employeeId, string $date, string $status = 'Pending', ?float $expected = 2): OvertimeRequest
    {
        return OvertimeRequest::create([
            'id' => $id, 'employee_id' => $employeeId, 'employee_name' => 'Fercy Miano',
            'date' => $date, 'expected_hours' => $expected, 'reason' => 'Release crunch',
            'status' => $status, 'requested_date' => now()->toDateString(),
        ]);
    }

    public function test_approval_defaults_approved_hours_to_expected_and_records_audit(): void
    {
        $employee = $this->employee();
        $request = $this->overtime('OT001', $employee->id, now()->addDay()->toDateString(), 'Pending', 2);

        $this->actingAs($this->adminUser())
            ->patchJson("/api/overtime/{$request->id}/status", ['status' => 'Approved', 'approvedBy' => 'John Delgado'])
            ->assertOk();

        $request->refresh();
        $this->assertSame(2.0, (float) $request->approved_hours);
        $this->assertNotNull($request->approved_at);
        $this->assertSame('John Delgado', $request->approved_by);
    }

    public function test_approval_accepts_custom_approved_hours_and_comment(): void
    {
        $employee = $this->employee();
        $request = $this->overtime('OT001', $employee->id, now()->addDay()->toDateString(), 'Pending', 2);

        $this->actingAs($this->adminUser())
            ->patchJson("/api/overtime/{$request->id}/status", [
                'status' => 'Approved', 'approvedBy' => 'John Delgado',
                'approvedHours' => 1.5, 'comments' => 'Cap this one at 1.5h.',
            ])
            ->assertOk();

        $request->refresh();
        $this->assertSame(1.5, (float) $request->approved_hours);
        $this->assertSame('Cap this one at 1.5h.', $request->comments);
    }

    public function test_rejection_clears_approval_fields(): void
    {
        $employee = $this->employee();
        $request = $this->overtime('OT001', $employee->id, now()->addDay()->toDateString(), 'Pending', 2);

        $this->actingAs($this->adminUser())
            ->patchJson("/api/overtime/{$request->id}/status", ['status' => 'Rejected', 'approvedBy' => 'John Delgado'])
            ->assertOk();

        $request->refresh();
        $this->assertNull($request->approved_hours);
        $this->assertNull($request->approved_at);
        $this->assertSame('Rejected', $request->status);
    }

    private function attendance(string $id, string $employeeId, string $date, float $overtime): Attendance
    {
        return Attendance::create([
            'id' => $id, 'employee_id' => $employeeId, 'date' => $date,
            'clock_in' => '08:00', 'clock_out' => '19:00',
            'status' => 'Present', 'overtime' => $overtime,
            'regular_hours' => 8, 'total_hours' => 8 + $overtime,
        ]);
    }

    public function test_ot_without_an_approved_request_is_unauthorized(): void
    {
        $employee = $this->employee();
        $this->attendance('ATT001', $employee->id, now()->toDateString(), 2);

        $response = $this->actingAs($this->adminUser())->getJson('/api/attendance')->assertOk();

        $recon = $response->json('data.0.overtimeReconciliation');
        $this->assertSame('unauthorized', $recon['status']);
        $this->assertSame(0.0, (float) $recon['approvedHours']);
    }

    public function test_ot_within_approved_hours_is_authorized(): void
    {
        $employee = $this->employee();
        $this->attendance('ATT001', $employee->id, now()->toDateString(), 1.5);
        $this->overtime('OT001', $employee->id, now()->toDateString(), 'Approved', 2);

        $this->actingAs($this->adminUser())
            ->getJson('/api/attendance')
            ->assertOk()
            ->assertJsonPath('data.0.overtimeReconciliation.status', 'authorized');
    }

    public function test_ot_exceeding_approved_hours_is_an_overrun(): void
    {
        $employee = $this->employee();
        $this->attendance('ATT001', $employee->id, now()->toDateString(), 3);
        $this->overtime('OT001', $employee->id, now()->toDateString(), 'Approved', 2);

        $response = $this->actingAs($this->adminUser())->getJson('/api/attendance')->assertOk();

        $recon = $response->json('data.0.overtimeReconciliation');
        $this->assertSame('overrun', $recon['status']);
        $this->assertSame(2.0, (float) $recon['approvedHours']);
        $this->assertSame(3.0, (float) $recon['actualHours']);
    }

    public function test_no_overtime_means_no_reconciliation(): void
    {
        $employee = $this->employee();
        $this->attendance('ATT001', $employee->id, now()->toDateString(), 0);

        $this->actingAs($this->adminUser())
            ->getJson('/api/attendance')
            ->assertOk()
            ->assertJsonMissingPath('data.0.overtimeReconciliation');
    }

    public function test_approved_request_that_is_not_fully_worked_is_an_underrun(): void
    {
        $employee = $this->employee();
        $request = $this->overtime('OT001', $employee->id, now()->toDateString(), 'Approved', 3);
        $this->attendance('ATT001', $employee->id, now()->toDateString(), 1);

        $recon = app(OvertimeReconciliationService::class)->forRequest($request->fresh());

        $this->assertSame('underrun', $recon['status']);
        $this->assertSame(1.0, $recon['actualHours']);
    }

    public function test_timesheet_sync_records_weekly_approved_ot_hours(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-12 10:00:00')); // a Wednesday
        $employee = $this->employee();

        $this->overtime('OT001', $employee->id, '2026-08-12', 'Approved', 2);
        $this->attendance('ATT001', $employee->id, '2026-08-12', 1.5);

        $timesheet = app(TimesheetGenerationService::class)->syncForEmployee($employee->id, '2026-08-12');

        $this->assertNotNull($timesheet);
        $this->assertSame(2.0, (float) $timesheet->approved_ot_hours);
        $this->assertSame(1.5, (float) $timesheet->overtime_hours);
        $this->assertSame('Pending', $timesheet->status);
        $this->assertDatabaseHas('timesheets', ['employee_id' => $employee->id, 'approved_ot_hours' => 2.0]);

        Carbon::setTestNow();
    }

    public function test_timesheet_api_exposes_approved_ot_hours(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-12 10:00:00'));
        $employee = $this->employee();

        $this->overtime('OT001', $employee->id, '2026-08-12', 'Approved', 2);
        $this->attendance('ATT001', $employee->id, '2026-08-12', 1.5);
        app(TimesheetGenerationService::class)->syncForEmployee($employee->id, '2026-08-12');

        $response = $this->actingAs($this->adminUser())->getJson('/api/timesheets')->assertOk();

        $timesheet = $response->json('data.0');
        $this->assertSame(2.0, (float) $timesheet['approvedOtHours']);
        $this->assertSame(1.5, (float) $timesheet['overtimeHours']);

        Carbon::setTestNow();
    }

    public function test_new_request_skips_over_an_otr_sibling_prefix(): void
    {
        $employee = $this->employee();
        $this->overtime('OT001', $employee->id, now()->addDay()->toDateString(), 'Approved', 2);
        $this->overtime('OTR001', $employee->id, now()->addDays(2)->toDateString(), 'Pending', 2);

        $user = \App\Models\User::factory()->create([
            'employee_id' => $employee->id, 'role' => 'Employee', 'role_label' => 'Employee',
        ]);

        $this->actingAs($user)->postJson('/api/overtime', [
            'employeeId' => $employee->id,
            'employeeName' => 'Fercy Miano',
            'date' => now()->addDays(3)->toDateString(),
            'expectedHours' => 2,
            'reason' => 'Release crunch',
            'status' => 'Pending',
            'requestedDate' => now()->toDateString(),
        ])->assertCreated()->assertJsonPath('data.id', 'OT002');

        $this->assertDatabaseHas('overtime_requests', ['id' => 'OT002']);
    }

    public function test_employee_cancel_deletes_the_pending_request(): void
    {
        $employee = $this->employee();
        $this->overtime('OT001', $employee->id, now()->addDay()->toDateString(), 'Pending', 2);

        $user = \App\Models\User::factory()->create([
            'employee_id' => $employee->id, 'role' => 'Employee', 'role_label' => 'Employee',
        ]);

        $this->actingAs($user)->patchJson("/api/overtime/OT001/status", ['status' => 'Cancelled'])
            ->assertOk()
            ->assertJsonPath('success', true);

        $this->assertDatabaseMissing('overtime_requests', ['id' => 'OT001']);
    }

    public function test_admin_cancel_keeps_the_request_as_cancelled(): void
    {
        $employee = $this->employee();
        $this->overtime('OT001', $employee->id, now()->addDay()->toDateString(), 'Pending', 2);

        $this->actingAs($this->adminUser())
            ->patchJson("/api/overtime/OT001/status", ['status' => 'Cancelled'])
            ->assertOk();

        $this->assertDatabaseHas('overtime_requests', ['id' => 'OT001', 'status' => 'Cancelled']);
    }
}
