<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Timesheet;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Workforce productivity is one number, not a series, so the Month/Quarter/Year control cannot
 * slice it on the client the way it slices the trends. It is recomputed over the chosen number of
 * COMPLETED months, so the window a panelist sees always matches what the arithmetic ran on.
 */
class WorkforceProductivityTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function admin(): User
    {
        return User::factory()->create(['role' => 'Administrator']);
    }

    private function employee(string $id = 'EMP001'): Employee
    {
        return Employee::create([
            'id' => $id, 'first_name' => 'Test', 'last_name' => 'One',
            'email' => strtolower($id).'@example.com', 'department' => 'IT & Systems',
        ]);
    }

    private function punch(Employee $employee, string $date, string $status): void
    {
        Attendance::create([
            'id' => 'ATT'.str_replace('-', '', $date).$employee->id,
            'employee_id' => $employee->id, 'date' => $date,
            'clock_in' => '08:00', 'clock_out' => '17:00', 'status' => $status,
        ]);
    }

    private function week(Employee $employee, string $weekStart, float $regular, float $total, string $status = 'Approved'): void
    {
        Timesheet::create([
            'id' => 'TS'.str_replace('-', '', $weekStart).$employee->id,
            'employee_id' => $employee->id, 'employee_name' => 'Test One',
            'department' => 'IT & Systems', 'date' => $weekStart, 'week_start' => $weekStart,
            'week_end' => Carbon::parse($weekStart)->addDays(6)->toDateString(),
            'regular_hours' => $regular, 'overtime_hours' => 0, 'total_hours' => $total,
            'status' => $status, 'submitted_at' => Carbon::parse($weekStart)->addDays(7),
        ]);
    }

    public function test_the_window_control_changes_the_period_the_score_is_measured_over(): void
    {
        Carbon::setTestNow('2026-10-15 10:00:00');
        $admin = $this->admin();
        $employee = $this->employee();

        // Two finished months of a clean record: present every day, hours fully logged.
        foreach (['2026-08-03', '2026-08-04', '2026-09-01', '2026-09-02', '2026-09-03'] as $date) {
            $this->punch($employee, $date, 'Present');
        }
        $this->week($employee, '2026-08-03', 40, 40);
        $this->week($employee, '2026-08-31', 40, 40);
        $this->week($employee, '2026-09-28', 40, 40);

        $one = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity?months=1')->assertOk()->json('data');

        $this->assertSame(1, $one['period']['months']);
        // September alone, so its own label rather than a range.
        $this->assertSame('Sep 2026', $one['period']['label']);
        $this->assertSame('2026-09-01', $one['period']['from']);
        $this->assertSame('2026-09-30', $one['period']['to']);

        $three = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity?months=3')->assertOk()->json('data');

        $this->assertSame(3, $three['period']['months']);
        $this->assertSame('Jul 2026 - Sep 2026', $three['period']['label']);
        $this->assertSame('2026-07-01', $three['period']['from']);

        // A wider window sees strictly more days, so it cannot report fewer.
        $this->assertGreaterThan($one['totals']['daysExpected'], $three['totals']['daysExpected']);
    }

    public function test_every_window_skips_the_month_still_in_progress(): void
    {
        // Mid-October. October's three days must not appear in any window, however wide.
        Carbon::setTestNow('2026-10-03 10:00:00');
        $admin = $this->admin();
        $employee = $this->employee();

        $this->punch($employee, '2026-09-01', 'Present');
        $this->punch($employee, '2026-09-02', 'Present');
        $this->punch($employee, '2026-10-01', 'Present');
        $this->punch($employee, '2026-10-02', 'Present');
        $this->week($employee, '2026-08-31', 40, 40);

        foreach ([1, 3, 12] as $months) {
            $data = $this->actingAs($admin)
                ->getJson("/api/analytics/department-productivity?months={$months}")->assertOk()->json('data');

            $this->assertSame(
                '2026-09-30',
                $data['period']['to'],
                "A {$months}-month window must stop at the last finished month."
            );
            $this->assertSame(2, $data['totals']['daysExpected'], "A {$months}-month window must not count October.");
        }
    }

    public function test_the_score_does_not_need_departments_to_be_filled_in(): void
    {
        Carbon::setTestNow('2026-10-15 10:00:00');
        $admin = $this->admin();

        // One employee with no department on file at all, and one sharing the same blank value.
        $a = $this->employee('EMP001');
        $b = $this->employee('EMP002');
        $this->punch($a, '2026-09-01', 'Present');
        $this->punch($b, '2026-09-02', 'Present');

        $data = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity')->assertOk()->json('data');

        $this->assertArrayHasKey('score', $data);
        $this->assertNotEmpty($data['components']);
        // Grouping by department used to drop these rows entirely (the query required a non-null
        // department), so a workforce with no departments on file produced an empty chart.
        $this->assertSame(2, $data['totals']['daysExpected']);
        $this->assertCount(5, $data['components']);
    }

    public function test_an_impossible_window_is_clamped_instead_of_being_trusted(): void
    {
        Carbon::setTestNow('2026-10-15 10:00:00');
        $admin = $this->admin();
        $this->punch($this->employee(), '2026-09-01', 'Present');

        foreach ([['months=0', 1], ['months=-5', 1], ['months=999', 12], ['months=abc', 12], ['', 12]] as [$query, $expected]) {
            $data = $this->actingAs($admin)
                ->getJson("/api/analytics/department-productivity?{$query}")->assertOk()->json('data');

            $this->assertSame($expected, $data['period']['months'], "Window '{$query}' should clamp to {$expected}.");
        }
    }

    public function test_an_empty_workforce_reports_a_zero_score_rather_than_failing(): void
    {
        Carbon::setTestNow('2026-10-15 10:00:00');
        $admin = $this->admin();

        $data = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity')->assertOk()->json('data');

        // assertEquals, not assertSame: a JSON 0 comes back as an int where PHP would have produced a
        // float, and "0" and "0.0" are the same number.
        $this->assertEquals(0.0, $data['score']);
        foreach ($data['components'] as $component) {
            $this->assertEquals(0.0, $component['score']);
        }
    }

    public function test_the_score_falls_when_the_workforce_misses_days_it_was_scheduled_for(): void
    {
        Carbon::setTestNow('2026-10-15 10:00:00');
        $admin = $this->admin();
        $employee = $this->employee();

        // One month, identical weeksheet rows, only the attendance differs.
        $this->week($employee, '2026-08-31', 40, 40);

        // A clean September: everyone attended.
        foreach (['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'] as $date) {
            $this->punch($employee, $date, 'Present');
        }
        $good = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity?months=1')->assertOk()->json('data');

        Attendance::where('date', '>=', '2026-09-01')->update(['status' => 'Absent']);
        $bad = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity?months=1')->assertOk()->json('data');

        $this->assertGreaterThan($bad['score'], $good['score']);

        $byKey = collect($good['components'])->keyBy('key');
        $badByKey = collect($bad['components'])->keyBy('key');
        $this->assertEquals(100.0, $byKey['attendance']['score']);
        $this->assertEquals(0.0, $badByKey['attendance']['score']);
        $this->assertEquals(100.0, $byKey['punctuality']['score']);
        $this->assertEquals(0.0, $badByKey['punctuality']['score']);

        // The two are the only parts that moved: the week is logged the same way in both.
        $this->assertEquals($byKey['hours']['score'], $badByKey['hours']['score']);
        $this->assertEquals($byKey['overtime']['score'], $badByKey['overtime']['score']);
    }
}
