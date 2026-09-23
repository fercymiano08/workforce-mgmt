<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Every attendance record has ONE status. The attendance graph must count each status on its own
 * (a late arrival is Late, never also Present) and the rate must not punish leave or early leavers.
 */
class AttendanceTrendTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_each_status_is_counted_once_and_the_rate_is_fair(): void
    {
        Carbon::setTestNow('2026-09-21 10:00:00');
        $admin = User::factory()->create(['role' => 'Administrator']);
        $employee = Employee::create([
            'id' => 'EMP001', 'first_name' => 'Test', 'last_name' => 'One',
            'email' => 'one@example.com', 'department' => 'IT & Systems',
        ]);

        foreach (['2026-09-01' => 'Present', '2026-09-02' => 'Late', '2026-09-03' => 'Early Leave', '2026-09-04' => 'Absent', '2026-09-07' => 'On Leave'] as $date => $status) {
            Attendance::create([
                'id' => 'ATT'.str_replace('-', '', $date), 'employee_id' => $employee->id,
                'date' => $date, 'clock_in' => '08:00', 'status' => $status,
            ]);
        }

        $month = collect($this->actingAs($admin)->getJson('/api/analytics/attendance-trend')->assertOk()->json('data'))
            ->firstWhere('month', 'Sep 2026');

        $this->assertSame(1, $month['present']);      // only the on-time day
        $this->assertSame(1, $month['late']);         // the late day is NOT also present
        $this->assertSame(1, $month['earlyLeave']);
        $this->assertSame(1, $month['absent']);
        // came in 3 of the 4 expected days; the leave day is not held against them
        $this->assertEquals(75.0, $month['rate']);
    }
}
