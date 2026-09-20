<?php

namespace Tests\Feature;

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
        ['GET', '/api/attendance'],
        ['POST', '/api/attendance'],
        ['GET', '/api/attendance/date/2030-01-01'],
        ['PUT', '/api/attendance/ATT001'],
        ['DELETE', '/api/attendance/ATT001'],
        ['GET', '/api/attendance/early-outs'],
        ['GET', '/api/attendance/early-outs/pending'],
        ['POST', '/api/attendance/early-outs/EO001/classify'],
        ['POST', '/api/kiosk/config'],
        ['POST', '/api/kiosk/pin'],
        ['POST', '/api/kiosk/reset'],
    ];

    private const OTHER_EMPLOYEE = [
        ['GET', '/api/attendance/employee/EMP-OTHER'],
        ['GET', '/api/attendance/early-outs/employee/EMP-OTHER'],
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

    public function test_an_administrator_has_no_employee_self_service_actions(): void
    {
        // Admin accounts have no employee record, so "remind me to clock out" is not theirs to use.
        $this->actingAs($this->adminUser())->postJson('/api/attendance/remind-clock-out')->assertForbidden();
    }
}
