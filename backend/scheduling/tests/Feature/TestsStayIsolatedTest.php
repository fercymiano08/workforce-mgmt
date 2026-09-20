<?php

namespace Tests\Feature;

use Tests\TestCase;

/**
 * Guard: the test suite must never talk to the real running services.
 *
 * Without an explicit override in phpunit.xml, saving a shift schedule in a test pushed
 * that test schedule into the LIVE attendance/timeoff/... replicas.
 */
class TestsStayIsolatedTest extends TestCase
{
    public function test_shift_schedule_replica_pushes_are_disabled_under_test(): void
    {
        $this->assertSame([], config('svc.shift_replica_targets'));
    }
}
