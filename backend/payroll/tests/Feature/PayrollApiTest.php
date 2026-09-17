<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Timesheet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PayrollApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_timesheets_require_authentication(): void
    {
        $this->getJson('/api/timesheets')->assertUnauthorized();
    }

    public function test_admin_can_list_and_update_timesheets(): void
    {
        $admin = $this->adminUser();

        Timesheet::create([
            'id' => 'TS001',
            'employee_id' => 'EMP20260001',
            'employee_name' => 'Juan Dela Cruz',
            'department' => 'IT & Systems',
            'date' => now()->toDateString(),
            'week_start' => now()->startOfWeek()->toDateString(),
            'week_end' => now()->endOfWeek()->toDateString(),
            'regular_hours' => 8,
            'overtime_hours' => 0,
            'break_hours' => 1,
            'total_hours' => 8,
            'status' => 'Pending',
        ]);

        $this->actingAs($admin)
            ->getJson('/api/timesheets')
            ->assertOk()
            ->assertJsonStructure(['data']);

        $this->actingAs($admin)
            ->patchJson('/api/timesheets/TS001/status', [
                'status' => 'Approved',
                'approvedBy' => 'John Delgado',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'Approved');
    }

    public function test_peer_can_sync_timesheet_for_employee(): void
    {
        Employee::create([
            'id' => 'EMP20260001',
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'email' => 'juan@workforcepro.com',
            'department' => 'IT & Systems',
        ]);

        Attendance::create([
            'id' => 'ATT001',
            'employee_id' => 'EMP20260001',
            'date' => now()->toDateString(),
            'clock_in' => '08:00:00',
            'clock_out' => '17:00:00',
            'status' => 'On Time',
            'regular_hours' => 8,
            'total_hours' => 8,
            'break_hours' => 1,
        ]);

        $this->withHeader('X-Service-Token', config('svc.token'))
            ->postJson('/api/internal/timesheets/sync', ['employeeId' => 'EMP20260001'])
            ->assertOk();

        $this->assertDatabaseHas('timesheets', [
            'employee_id' => 'EMP20260001',
            'week_start' => now()->startOfWeek()->toDateString(),
            'week_end' => now()->endOfWeek()->toDateString(),
        ]);
    }

    public function test_peer_cannot_sync_without_token(): void
    {
        $this->postJson('/api/internal/timesheets/sync', ['employeeId' => 'EMP20260001'])
            ->assertForbidden();
    }
}