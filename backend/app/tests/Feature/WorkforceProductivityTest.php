<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\ShiftSchedule;
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

    /**
     * The standard 08:00-17:00 shift, so hours-worked has something real to measure against.
     */
    private function roster(Employee $employee, string $date): void
    {
        ShiftSchedule::create([
            'id' => 'SS'.str_replace('-', '', $date).$employee->id,
            'employee_id' => $employee->id, 'employee_name' => 'Test One',
            'shift_id' => 'SHIFT004', 'date' => $date, 'status' => 'Scheduled',
        ]);
    }

    /** A worked shift: full marks once logged hours reach 85% of the rostered length. */
    private function workedShift(Employee $employee, string $date, float $hours, float $overtime = 0.0, string $status = 'Present'): void
    {
        $this->roster($employee, $date);
        Attendance::create([
            'id' => 'ATT'.str_replace('-', '', $date).$employee->id,
            'employee_id' => $employee->id, 'date' => $date,
            'clock_in' => '08:00', 'clock_out' => '17:00',
            'regular_hours' => $hours, 'total_hours' => $hours,
            'overtime' => $overtime, 'status' => $status,
        ]);
    }

    /** A rostered shift nobody punched for: an unrecorded shift, not a short one. */
    private function missedShift(Employee $employee, string $date): void
    {
        $this->roster($employee, $date);
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

    public function test_approved_leave_of_an_unknown_type_is_still_counted_not_dropped(): void
    {
        Carbon::setTestNow('2026-10-15 10:00:00');
        $admin = $this->admin();
        $employee = $this->employee();

        // 'Half Day' is a real approved request in the data but has no balance or chart bucket of
        // its own. The leave trend used to discard it from both the monthly total and the donut, so
        // approved leave existed in the database and was invisible on the page.
        Leave::create([
            'id' => 'LVEH1', 'employee_id' => $employee->id, 'employee_name' => 'Test One',
            'leave_type' => 'Half Day', 'start_date' => '2026-09-11', 'end_date' => '2026-09-11',
            'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2026-09-10',
        ]);
        Leave::create([
            'id' => 'LVEV1', 'employee_id' => $employee->id, 'employee_name' => 'Test One',
            'leave_type' => 'Vacation', 'start_date' => '2026-09-14', 'end_date' => '2026-09-15',
            'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2026-09-10',
        ]);

        $trend = $this->actingAs($admin)->getJson('/api/analytics/leave-trend')->assertOk()->json('data');
        $september = collect($trend)->firstWhere('month', 'Sep 2026');

        $this->assertNotNull($september);
        // Two approved requests in September, and both are accounted for.
        $this->assertSame(2, $september['total']);
        $this->assertSame(1, $september['vacation']);
        $this->assertSame(1, $september['other'], 'The unknown type must land in other, not vanish.');

        // The six named buckets plus other must add up to the total, so the donut can never be short.
        $buckets = ['vacation', 'sick', 'emergency', 'special', 'funeral', 'unpaid', 'other'];
        $sum = array_sum(array_map(fn ($k) => $september[$k] ?? 0, $buckets));
        $this->assertSame($september['total'], $sum);
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

        // One month, identical timesheet rows, only the attendance differs.
        $this->week($employee, '2026-08-31', 40, 40);

        // A clean September: everyone attended and worked a full shift.
        foreach (['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'] as $date) {
            $this->workedShift($employee, $date, 8.0);
        }
        $good = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity?months=1')->assertOk()->json('data');

        Attendance::where('date', '>=', '2026-09-01')
            ->update(['status' => 'Absent', 'regular_hours' => 0, 'total_hours' => 0]);

        $bad = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity?months=1')->assertOk()->json('data');

        $this->assertGreaterThan($bad['score'], $good['score']);

        $byKey = collect($good['components'])->keyBy('key');
        $badByKey = collect($bad['components'])->keyBy('key');
        $this->assertEquals(100.0, $byKey['attendance']['score']);
        $this->assertEquals(0.0, $badByKey['attendance']['score']);
        $this->assertEquals(100.0, $byKey['punctuality']['score']);
        $this->assertEquals(0.0, $badByKey['punctuality']['score']);
        // Nothing was logged against those shifts, so hours-worked drops with them.
        $this->assertEquals(100.0, $byKey['hours']['score']);
        $this->assertEquals(0.0, $badByKey['hours']['score']);

        // The parts fed by the timesheet are untouched by attendance.
        $this->assertEquals($byKey['overtime']['score'], $badByKey['overtime']['score']);
        $this->assertEquals($byKey['timesheets']['score'], $badByKey['timesheets']['score']);
    }

    /**
     * The original defect, kept as a regression test.
     *
     * The first version divided timesheet total_hours by timesheet regular_hours. Those two columns
     * are copied from the same attendance row, so the ratio was 1.0 in every window and that part
     * scored a flat 100 - 25% of the total weight that could never move. It also averaged overtime
     * across all 555 attendance rows, so 22.5 hours of overtime became 0.04h and scored 99.6.
     */
    public function test_no_part_is_pinned_while_the_workforce_actually_changes(): void
    {
        Carbon::setTestNow('2026-10-15 10:00:00');
        $admin = $this->admin();
        $employee = $this->employee();

        // A strong September: full shifts, no overtime.
        foreach (range(1, 20) as $day) {
            $this->workedShift($employee, sprintf('2026-09-%02d', $day), 8.5);
        }
        $this->week($employee, '2026-08-31', 40, 40);

        $strong = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity?months=1')->assertOk()->json('data');

        // Same month, worse month: everyone leaves early and burns overtime. (Updated in place -
        // shift_schedules is unique per employee per day, so the same shifts are re-recorded.)
        Attendance::where('date', '>=', '2026-09-01')
            ->update([
                'regular_hours' => 5.0, 'total_hours' => 5.0,
                'overtime' => 3.0, 'status' => 'Early Leave',
            ]);
        $weak = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity?months=1')->assertOk()->json('data');

        $this->assertGreaterThan($weak['score'] + 5, $strong['score']);

        $strongParts = collect($strong['components'])->keyBy('key');
        $weakParts = collect($weak['components'])->keyBy('key');

        // Hours-worked and overtime must both visibly react to a month that got worse.
        $this->assertGreaterThan(
            $weakParts['hours']['score'] + 20,
            $strongParts['hours']['score'],
            'Hours worked must fall when shifts are cut short.'
        );
        $this->assertGreaterThan(
            $weakParts['overtime']['score'] + 20,
            $strongParts['overtime']['score'],
            'Overtime discipline must fall when overtime rises.'
        );

        // Attendance is deliberately excluded here: everyone still turned up, they just left early, and
        // showing up is exactly what that part measures. The two parts that should react here -
        // hours worked and overtime - are asserted directly above.
        foreach (['hours', 'overtime', 'punctuality'] as $key) {
            $this->assertLessThan(
                100.0,
                $weakParts[$key]['score'],
                "The {$key} part still reads a perfect 100 on a deliberately poor month."
            );
        }

        // 5.0h against a 9h rostered shift is 56%: below the 85% full-mark line, above the floor.
        $this->assertEquals(100.0, $strongParts['hours']['score']);
        $this->assertLessThan(60.0, $weakParts['hours']['score']);
    }

    public function test_hours_worked_is_scored_per_shift_not_as_one_workforce_average(): void
    {
        Carbon::setTestNow('2026-10-15 10:00:00');
        $admin = $this->admin();
        $reliable = $this->employee('EMP001');
        $leaver = $this->employee('EMP002');

        // One reliable worker over four shifts, one who always leaves at noon. Rostered 08:00-17:00
        // is 9 hours; 8.5h clears the 85% full-mark line, 4.5h is half and scores zero.
        foreach (range(1, 4) as $day) {
            $this->workedShift($reliable, sprintf('2026-09-%02d', $day), 8.5);
            $this->workedShift($leaver, sprintf('2026-09-%02d', $day), 4.5);
        }
        $this->week($reliable, '2026-08-31', 40, 40);
        $this->week($leaver, '2026-08-31', 40, 40);

        $data = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity?months=1')->assertOk()->json('data');

        // Averaged per shift across the whole workforce, not per person: half the shifts were short.
        $parts = collect($data['components'])->keyBy('key');
        $this->assertEquals(50.0, $parts['hours']['score']);
        $this->assertEquals(0.0, $data['totals']['shortestShift']);
        $this->assertEquals(100.0, $data['totals']['longestShift']);
    }

    public function test_a_rostered_shift_with_no_punch_scores_as_unworked(): void
    {
        Carbon::setTestNow('2026-10-15 10:00:00');
        $admin = $this->admin();
        $employee = $this->employee();

        $this->workedShift($employee, '2026-09-01', 8.5);
        $this->missedShift($employee, '2026-09-02');
        $this->missedShift($employee, '2026-09-03');
        $this->week($employee, '2026-08-31', 40, 40);

        $data = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity?months=1')->assertOk()->json('data');

        $this->assertSame(3, $data['totals']['shiftsRostered']);
        $this->assertSame(2, $data['totals']['unrecordedShifts']);

        // One full shift out of three rostered: (100 + 0 + 0) / 3.
        $this->assertEquals(33.3, collect($data['components'])->keyBy('key')['hours']['score']);
    }

    public function test_overtime_is_measured_against_rostered_time_not_a_diluted_average(): void
    {
        Carbon::setTestNow('2026-10-15 10:00:00');
        $admin = $this->admin();
        $employee = $this->employee();

        // Two rostered 9h shifts with an hour of overtime each: 2 / 18 = 11.1% of rostered time,
        // which is past the 10% floor, so this part scores zero rather than the 99.6 the old
        // per-row average reported for far worse overtime.
        $this->workedShift($employee, '2026-09-01', 8.5, 1.0);
        $this->workedShift($employee, '2026-09-02', 8.5, 1.0);
        $this->week($employee, '2026-08-31', 40, 40);

        $data = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity?months=1')->assertOk()->json('data');

        $this->assertEquals(11.11, $data['totals']['overtimeShare']);
        $this->assertEquals(0.0, collect($data['components'])->keyBy('key')['overtime']['score']);
    }

    public function test_a_week_left_in_draft_once_it_has_closed_counts_against_the_timesheet_part(): void
    {
        Carbon::setTestNow('2026-10-15 10:00:00');
        $admin = $this->admin();
        $employee = $this->employee();

        $this->workedShift($employee, '2026-09-01', 8.5);

        // Three closed September weeks, one of them never recorded.
        $this->week($employee, '2026-09-01', 40, 40, 'Approved');
        $this->week($employee, '2026-09-07', 40, 40, 'Submitted');
        $this->week($employee, '2026-09-14', 40, 40, 'Draft');

        $data = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity?months=1')->assertOk()->json('data');

        $this->assertSame(3, $data['totals']['weeksClosed']);
        $this->assertSame(2, $data['totals']['weeksRecorded']);
        $this->assertEquals(66.7, collect($data['components'])->keyBy('key')['timesheets']['score']);
    }

    public function test_a_week_that_has_not_ended_yet_is_not_a_missed_record(): void
    {
        // The window ends where October begins, but the final timesheet row can still be dated to a
        // week running into the new month. A week that has not closed cannot have been missed.
        Carbon::setTestNow('2026-10-01 08:00:00');
        $admin = $this->admin();
        $employee = $this->employee();

        $this->workedShift($employee, '2026-09-01', 8.5);
        $this->week($employee, '2026-08-31', 40, 40, 'Draft');

        $data = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity?months=1')->assertOk()->json('data');

        $this->assertSame(0, $data['totals']['weeksClosed']);
        $this->assertEquals(0.0, collect($data['components'])->keyBy('key')['timesheets']['score']);
    }

    public function test_the_components_still_add_up_to_the_published_score(): void
    {
        Carbon::setTestNow('2026-10-15 10:00:00');
        $admin = $this->admin();
        $employee = $this->employee();

        foreach (range(1, 6) as $day) {
            $this->workedShift($employee, sprintf('2026-09-%02d', $day), 8.0, 0.5);
        }
        $this->week($employee, '2026-08-31', 40, 40, 'Approved');

        $data = $this->actingAs($admin)
            ->getJson('/api/analytics/department-productivity?months=1')->assertOk()->json('data');

        $weighted = 0.0;
        $weightTotal = 0.0;
        foreach ($data['components'] as $part) {
            $weighted += $part['score'] * $part['weight'];
            $weightTotal += $part['weight'];
        }

        $this->assertEquals(1.0, $weightTotal, 'The weights must add up to the whole score.');
        $this->assertEquals(round($weighted, 1), $data['score']);
    }
}
