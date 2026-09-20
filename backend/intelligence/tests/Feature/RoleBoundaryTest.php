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
        ['GET', '/api/analytics'],
        ['GET', '/api/analytics/attendance-trend'],
        ['GET', '/api/analytics/ai/insights'],
        ['POST', '/api/analytics/ai/actions'],
    ];

    public function test_anonymous_requests_are_rejected_everywhere(): void
    {
        foreach ([...self::ADMIN_ONLY] as [$method, $uri]) {
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
}
