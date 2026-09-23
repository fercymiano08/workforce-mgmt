<?php

namespace Tests\Feature;

use App\Models\Notification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Role boundary for this service: which routes an Employee must never reach,
 * whose data an Employee must never read, and that nobody gets in unauthenticated.
 * Admin-only routes are refused by middleware before the controller runs, so the
 * ids used here do not need to exist.
 */
class CommunicationsRoleBoundaryTest extends TestCase
{
    use RefreshDatabase;

    private const ADMIN_ONLY = [
        ['GET', '/api/notifications'],
        ['POST', '/api/notifications'],
    ];

    private const OTHER_EMPLOYEE = [
        ['GET', '/api/notifications/employee/EMP-OTHER'],
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

    public function test_employee_cannot_read_change_or_delete_someone_elses_notification(): void
    {
        $employee = $this->otpEmployeeUser();
        Notification::create([
            'id' => 'NOT900', 'employee_id' => 'EMP-OTHER', 'type' => 'leave_approved', 'title' => 'Private',
            'message' => 'Not yours', 'priority' => 'low', 'read' => false, 'timestamp' => now(),
        ]);
        Notification::create([
            'id' => 'NOT901', 'employee_id' => null, 'type' => 'leave_request', 'title' => 'Admin only',
            'message' => 'For administrators', 'priority' => 'low', 'read' => false, 'timestamp' => now(),
        ]);

        foreach (['NOT900', 'NOT901'] as $id) {
            $this->actingAs($employee)->getJson('/api/notifications/'.$id)->assertForbidden();
            $this->actingAs($employee)->postJson('/api/notifications/'.$id.'/read')->assertForbidden();
            $this->actingAs($employee)->deleteJson('/api/notifications/'.$id)->assertForbidden();
        }
        $this->assertSame(2, Notification::count());
    }
}
