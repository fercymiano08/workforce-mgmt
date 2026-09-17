<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\SecurityEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AttendanceApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_attendance_admin_routes_require_authentication(): void
    {
        $this->getJson('/api/attendance')->assertUnauthorized();
    }

    public function test_admin_can_list_attendance(): void
    {
        $this->actingAs($this->adminUser())
            ->getJson('/api/attendance')
            ->assertOk()
            ->assertJsonStructure(['data']);
    }

    public function test_kiosk_clock_in_creates_attendance_record(): void
    {
        $employee = Employee::create([
            'id' => 'EMP20260001',
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'email' => 'juan@workforcepro.com',
            'department' => 'IT & Systems',
        ]);

        $today = now()->toDateString();

        $this->postJson('/api/kiosk/attendance', [
            'employeeId' => $employee->id,
            'date' => $today,
            'clockIn' => '08:01:00',
            'status' => 'Late',
            'location' => 'Main Entrance',
        ])->assertCreated()
            ->assertJsonPath('data.employeeId', 'EMP20260001');

        $this->assertDatabaseHas('attendance', [
            'employee_id' => 'EMP20260001',
            'date' => $today,
        ]);
    }

    public function test_duplicate_clock_in_is_rejected(): void
    {
        Employee::create([
            'id' => 'EMP20260001',
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'email' => 'juan@workforcepro.com',
        ]);

        $payload = [
            'employeeId' => 'EMP20260001',
            'date' => now()->toDateString(),
            'clockIn' => '08:00:00',
            'status' => 'On Time',
        ];

        $this->postJson('/api/kiosk/attendance', $payload)->assertCreated();
        $this->postJson('/api/kiosk/attendance', $payload)->assertStatus(409);
    }

    public function test_peer_can_resolve_security_event(): void
    {
        $event = SecurityEvent::create([
            'id' => 'SEV001',
            'type' => 'face_mismatch',
            'message' => 'Face mismatch for EMP20260001',
            'employee_id' => 'EMP20260001',
            'status' => 'Open',
        ]);

        $this->withHeader('X-Service-Token', config('svc.token'))
            ->postJson('/api/internal/security-events/'.$event->id.'/resolve', [
                'resolvedBy' => 'Workforce AI',
            ])
            ->assertOk()
            ->assertJsonPath('data.status', 'Resolved')
            ->assertJsonPath('data.resolvedBy', 'Workforce AI');
    }

    public function test_kiosk_public_config_is_available(): void
    {
        $this->getJson('/api/kiosk/config')->assertOk();
    }
}