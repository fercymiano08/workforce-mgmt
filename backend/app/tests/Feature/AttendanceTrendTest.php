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
        // A finished month, and the clock sits in the next one: September is complete, so it is in the trend.
        Carbon::setTestNow('2026-10-15 10:00:00');
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

    public function test_the_month_still_in_progress_is_left_out_of_the_trend(): void
    {
        // Mid-October: three days of attendance exist, but three days cannot be summarised as a
        // rate. A rate off a tiny denominator reads as a near-perfect 100%, which is an artefact of
        // the arithmetic rather than a fact about the workforce, so the partial month is withheld
        // until it is finished.
        Carbon::setTestNow('2026-10-03 10:00:00');
        $admin = User::factory()->create(['role' => 'Administrator']);
        $employee = Employee::create([
            'id' => 'EMP001', 'first_name' => 'Test', 'last_name' => 'One',
            'email' => 'one@example.com', 'department' => 'IT & Systems',
        ]);

        foreach (['2026-10-01' => 'Present', '2026-10-02' => 'Present', '2026-09-30' => 'Present'] as $date => $status) {
            Attendance::create([
                'id' => 'ATT'.str_replace('-', '', $date), 'employee_id' => $employee->id,
                'date' => $date, 'clock_in' => '08:00', 'status' => $status,
            ]);
        }

        $trend = $this->actingAs($admin)->getJson('/api/analytics/attendance-trend')->assertOk()->json('data');

        $this->assertNull(
            collect($trend)->firstWhere('month', 'Oct 2026'),
            'The month still in progress must not appear in the trend.'
        );

        // September is finished, so it is reported - and its own single day rates 100% honestly,
        // because that month is complete as far as this data goes.
        $september = collect($trend)->firstWhere('month', 'Sep 2026');
        $this->assertNotNull($september);
        $this->assertSame(1, $september['present']);

        // Still twelve months of history, and the newest one is the last finished month.
        $this->assertCount(12, $trend);
        $this->assertSame('Sep 2026', $trend[11]['month']);
    }
}
