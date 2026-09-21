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
        ['GET', '/api/shifts/schedules'],
        ['POST', '/api/shifts/schedules'],
        ['POST', '/api/shifts/schedules/generate'],
        ['PUT', '/api/shifts/schedules/SCH001'],
        ['DELETE', '/api/shifts/schedules/SCH001'],
        ['GET', '/api/shifts/rules'],
        ['PUT', '/api/shifts/rules/automation'],
        ['PUT', '/api/shifts/rules/patterns'],
        ['POST', '/api/shifts/rules/holidays'],
        ['PUT', '/api/shifts/rules/coverage'],
        ['GET', '/api/shifts/batches'],
        ['DELETE', '/api/shifts/batches/BAT001'],
    ];

    private const OTHER_EMPLOYEE = [
        ['GET', '/api/shifts/schedules/employee/EMP-OTHER'],
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
}
