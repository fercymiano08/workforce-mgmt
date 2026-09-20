<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Guard: the test suite must never talk to the real running services.
 *
 * `.env` holds the live service addresses, and phpunit loads it. Without an explicit
 * override in phpunit.xml, saving an employee in a test pushed that test employee into
 * the LIVE attendance/scheduling/... replicas (a "Juan Dela Cruz" appearing at the
 * kiosk after someone ran the tests).
 */
class TestsStayIsolatedTest extends TestCase
{
    public function test_employee_replica_pushes_are_disabled_under_test(): void
    {
        $this->assertSame([], config('svc.employee_replica_targets'));
    }
}
