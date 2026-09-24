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

    protected function setUp(): void
    {
        parent::setUp();
        $this->skipKioskFaceCheck();
    }

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

        $today = $this->freezeKioskClock('08:01:00');
        $this->scheduleShift($employee->id);
        $this->withHeaders($this->kioskDeviceHeaders());

        // 08:01 is inside the 15-minute grace period, so the server records
        // Present even though the terminal (wrongly) said Late.
        $this->postJson('/api/kiosk/attendance', [
            'employeeId' => $employee->id,
            'date' => $today,
            'clockIn' => '08:01:00',
            'status' => 'Late',
            'location' => 'Main Entrance',
        ])->assertCreated()
            ->assertJsonPath('data.employeeId', 'EMP20260001')
            ->assertJsonPath('data.status', 'Present');

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
            'date' => $this->freezeKioskClock('08:00:00'),
            'clockIn' => '08:00:00',
            'status' => 'On Time',
        ];

        $this->scheduleShift('EMP20260001');
        $this->withHeaders($this->kioskDeviceHeaders());

        $this->postJson('/api/kiosk/attendance', $payload)->assertCreated();
        $this->postJson('/api/kiosk/attendance', $payload)->assertStatus(409);
    }

    public function test_resolving_a_security_event_updates_its_status(): void
    {
        $event = SecurityEvent::create([
            'id' => 'SEV001',
            'type' => 'face_mismatch',
            'message' => 'Face mismatch for EMP20260001',
            'employee_id' => 'EMP20260001',
            'status' => 'Open',
        ]);

        \App\Services\SecurityEvents::resolveSecurityEvent($event->id, 'Workforce AI');

        $event->refresh();
        $this->assertSame('Resolved', $event->status);
        $this->assertSame('Workforce AI', $event->resolved_by);
    }

    public function test_kiosk_public_config_is_available(): void
    {
        $this->getJson('/api/kiosk/config')->assertOk();
    }
}