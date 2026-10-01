<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\ShiftSchedule;
use App\Models\User;
use App\Services\ShiftHours;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The Workforce Analytics page (This Week / This Month / This Year). Each test here proves one
 * card's formula against a small, hand-computed dataset - the same numbers a panelist could be
 * shown by hand, which is the entire point of this revision.
 */
class WorkforceAnalyticsTest extends TestCase
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

    private function employee(string $id = 'EMP001', string $department = 'IT & Systems'): Employee
    {
        return Employee::create([
            'id' => $id, 'first_name' => 'Test', 'last_name' => $id,
            'email' => strtolower($id).'@example.com', 'department' => $department,
        ]);
    }

    private function punch(Employee $employee, string $date, string $status, float $overtime = 0.0): void
    {
        Attendance::create([
            'id' => 'ATT'.str_replace('-', '', $date).$employee->id,
            'employee_id' => $employee->id, 'date' => $date,
            'clock_in' => '08:00', 'clock_out' => '17:00', 'status' => $status, 'overtime' => $overtime,
        ]);
    }

    private function roster(Employee $employee, string $date): void
    {
        ShiftSchedule::create([
            'id' => 'SS'.str_replace('-', '', $date).$employee->id,
            'employee_id' => $employee->id, 'employee_name' => $employee->first_name.' '.$employee->last_name,
            'shift_id' => 'SHIFT004', 'date' => $date, 'status' => 'Scheduled',
        ]);
    }

    private function leave(Employee $employee, string $type, string $start, string $end, float $days, string $status = 'Approved', ?string $id = null): void
    {
        Leave::create([
            'id' => $id ?? 'LV'.strtoupper(str_replace(' ', '', $type)).str_replace('-', '', $start).$employee->id,
            'employee_id' => $employee->id, 'employee_name' => $employee->first_name.' '.$employee->last_name,
            'leave_type' => $type, 'start_date' => $start, 'end_date' => $end, 'days' => $days,
            'reason' => 'test', 'status' => $status, 'applied_date' => $start,
        ]);
    }

    public function test_attendance_summary_counts_each_status_and_its_share_of_the_period(): void
    {
        Carbon::setTestNow('2026-06-15 10:00:00');
        $admin = $this->admin();
        $e = $this->employee();

        $this->punch($e, '2026-06-01', 'Present');
        $this->punch($e, '2026-06-02', 'Present');
        $this->punch($e, '2026-06-03', 'Late');
        $this->punch($e, '2026-06-04', 'Early Leave');
        $this->punch($e, '2026-06-05', 'Absent');

        $data = $this->actingAs($admin)->getJson('/api/analytics/workforce?period=year')->assertOk()->json('data');
        $slices = collect($data['attendanceSummary']['slices'])->keyBy('key');

        $this->assertSame(5, $data['attendanceSummary']['total']);
        $this->assertSame(2, $slices['onTime']['value']);
        $this->assertEquals(40.0, $slices['onTime']['pct']);
        $this->assertSame(1, $slices['late']['value']);
        $this->assertEquals(20.0, $slices['late']['pct']);
        $this->assertSame(1, $slices['earlyLeave']['value']);
        $this->assertSame(1, $slices['absent']['value']);
        $this->assertSame('emerald', $slices['onTime']['color']);
        $this->assertSame('amber', $slices['late']['color']);
        $this->assertSame('blue', $slices['earlyLeave']['color']);
        $this->assertSame('red', $slices['absent']['color']);
    }

    public function test_attendance_rate_excludes_approved_leave_and_days_that_have_not_happened_yet(): void
    {
        // Any Monday works - the point under test is the exclusion rules, not the calendar.
        $monday = Carbon::parse('2026-10-12', ShiftHours::timezone())->startOfWeek(Carbon::MONDAY);
        Carbon::setTestNow($monday->copy()->addDays(3)->setTime(10, 0)); // Thursday of that week
        $admin = $this->admin();
        $e = $this->employee();

        $mon = $monday->toDateString();
        $tue = $monday->copy()->addDay()->toDateString();
        $wed = $monday->copy()->addDays(2)->toDateString();
        $thu = $monday->copy()->addDays(3)->toDateString();
        $fri = $monday->copy()->addDays(4)->toDateString();

        foreach ([$mon, $tue, $wed, $thu, $fri] as $d) {
            $this->roster($e, $d);
        }
        $this->punch($e, $mon, 'Present');
        $this->punch($e, $tue, 'Present');
        // Wed: scheduled, no clock-in at all - counts against the rate.
        // Thu: scheduled, but on approved leave - excused, not counted either way.
        $this->leave($e, 'Vacation', $thu, $thu, 1);
        // Fri: scheduled, but has not happened yet - must not appear in the total at all.

        $data = $this->actingAs($admin)->getJson('/api/analytics/workforce?period=week')->assertOk()->json('data');
        $rate = $data['attendanceRate'];

        // Scheduled = Mon, Tue, Wed (Thu excused by leave, Fri hasn't happened). Present = Mon, Tue.
        $this->assertSame(2, $rate['presentDays']);
        $this->assertSame(3, $rate['scheduledDays']);
        $this->assertEquals(66.7, $rate['rate']);

        $this->assertCount(7, $rate['trend']);
        $this->assertSame('Mon', $rate['trend'][0]['label']);
        $this->assertSame('Sun', $rate['trend'][6]['label']);
        $this->assertEquals(100.0, $rate['trend'][0]['rate']);
        $this->assertEquals(100.0, $rate['trend'][1]['rate']);
        $this->assertEquals(0.0, $rate['trend'][2]['rate'], 'Wed was scheduled but never clocked in.');
        $this->assertEquals(0.0, $rate['trend'][4]['rate'], 'Fri has not happened yet.');
    }

    public function test_leave_trend_sums_approved_leave_days_not_request_counts_grouped_by_type(): void
    {
        Carbon::setTestNow('2026-06-15 10:00:00');
        $admin = $this->admin();
        $e = $this->employee();

        $this->leave($e, 'Vacation', '2026-06-02', '2026-06-04', 3, 'Approved', 'LV1');
        $this->leave($e, 'Sick', '2026-06-10', '2026-06-10', 1, 'Approved', 'LV2');
        // Not approved: must not be counted at all, here or anywhere else on the page.
        $this->leave($e, 'Vacation', '2026-06-12', '2026-06-12', 1, 'Pending', 'LV3');

        $data = $this->actingAs($admin)->getJson('/api/analytics/workforce?period=year')->assertOk()->json('data');
        $june = collect($data['leaveTrend']['buckets'])->firstWhere('label', 'Jun');

        $this->assertNotNull($june);
        $this->assertEquals(3.0, $june['vacation'], 'A 3-day request contributes 3 days, not 1.');
        $this->assertEquals(1.0, $june['sick']);
        $this->assertEquals(4.0, $june['total']);
    }

    public function test_overtime_hours_sums_the_overtime_logged_in_each_sub_bucket(): void
    {
        Carbon::setTestNow('2026-06-15 10:00:00');
        $admin = $this->admin();
        $e = $this->employee();

        $this->punch($e, '2026-05-10', 'Present', 2.0);
        $this->punch($e, '2026-05-20', 'Present', 1.5);
        $this->punch($e, '2026-06-05', 'Present', 3.0);

        $data = $this->actingAs($admin)->getJson('/api/analytics/workforce?period=year')->assertOk()->json('data');
        $buckets = collect($data['overtimeHours']['buckets'])->keyBy('label');

        $this->assertEquals(3.5, $buckets['May']['hours']);
        $this->assertEquals(3.0, $buckets['Jun']['hours']);
        $this->assertEquals(6.5, $data['overtimeHours']['totalHours']);
    }

    public function test_department_punctuality_ranks_departments_by_on_time_share_not_individuals(): void
    {
        Carbon::setTestNow('2026-06-15 10:00:00');
        $admin = $this->admin();
        $itGood = $this->employee('EMP001', 'IT & Systems');
        $itAlsoGood = $this->employee('EMP002', 'IT & Systems');
        $hrMixed = $this->employee('EMP003', 'Human Resources');

        $this->punch($itGood, '2026-06-01', 'Present');
        $this->punch($itGood, '2026-06-02', 'Present');
        $this->punch($itAlsoGood, '2026-06-01', 'Present');
        $this->punch($hrMixed, '2026-06-01', 'Present');
        $this->punch($hrMixed, '2026-06-02', 'Late');
        $this->punch($hrMixed, '2026-06-03', 'Late');

        $data = $this->actingAs($admin)->getJson('/api/analytics/workforce?period=year')->assertOk()->json('data');
        $departments = collect($data['departmentPunctuality']['departments'])->keyBy('department');

        $this->assertEquals(100.0, $departments['IT & Systems']['rate']);
        $this->assertSame(3, $departments['IT & Systems']['totalClockIns']);
        $this->assertEquals(33.3, $departments['Human Resources']['rate']);

        // Ranked, better first, and never by name - nobody is singled out.
        $this->assertSame('IT & Systems', $data['departmentPunctuality']['departments'][0]['department']);
        $this->assertStringNotContainsString('Test', json_encode($data['departmentPunctuality']));
    }

    public function test_leave_composition_counts_approved_requests_only_not_days_and_excludes_other_statuses(): void
    {
        Carbon::setTestNow('2026-06-15 10:00:00');
        $admin = $this->admin();
        $e = $this->employee();

        // A 5-day vacation counts as ONE request here - unlike Leave Trends, which sums its days.
        $this->leave($e, 'Vacation', '2026-06-01', '2026-06-05', 5, 'Approved', 'LV1');
        $this->leave($e, 'Sick', '2026-06-10', '2026-06-10', 1, 'Approved', 'LV2');
        $this->leave($e, 'Sick', '2026-06-11', '2026-06-11', 1, 'Pending', 'LV3');
        $this->leave($e, 'Sick', '2026-06-12', '2026-06-12', 1, 'Rejected', 'LV4');
        $this->leave($e, 'Sick', '2026-06-13', '2026-06-13', 1, 'Cancelled', 'LV5');

        $data = $this->actingAs($admin)->getJson('/api/analytics/workforce?period=year')->assertOk()->json('data');
        $composition = $data['leaveComposition'];
        $slices = collect($composition['slices'])->keyBy('type');

        $this->assertSame(2, $composition['total'], 'Only the two Approved requests count.');
        $this->assertSame(1, $slices['vacation']['count'], 'A 5-day leave is still one request here, not five.');
        $this->assertSame(1, $slices['sick']['count']);
        $this->assertEquals(50.0, $slices['vacation']['pct']);
    }

    public function test_leave_composition_puts_an_unrecognised_leave_type_in_other_not_its_own_slice(): void
    {
        Carbon::setTestNow('2026-06-15 10:00:00');
        $admin = $this->admin();
        $e = $this->employee();

        // 'Half Day' is a real approved request in the data but has no slice of its own - same case
        // leave_trend already guards (WorkforceProductivityTest), now true of this donut too.
        $this->leave($e, 'Half Day', '2026-06-01', '2026-06-01', 1, 'Approved', 'LV1');
        $this->leave($e, 'Vacation', '2026-06-02', '2026-06-02', 1, 'Approved', 'LV2');

        $data = $this->actingAs($admin)->getJson('/api/analytics/workforce?period=year')->assertOk()->json('data');
        $slices = collect($data['leaveComposition']['slices'])->keyBy('type');

        $this->assertSame(2, $data['leaveComposition']['total']);
        $this->assertArrayNotHasKey('half day', $slices, "An unrecognised type must not get its own slice.");
        $this->assertSame(1, $slices['other']['count']);
        $this->assertSame(1, $slices['vacation']['count']);
    }

    public function test_an_unknown_period_falls_back_to_this_month(): void
    {
        Carbon::setTestNow('2026-06-15 10:00:00');
        $admin = $this->admin();

        $data = $this->actingAs($admin)->getJson('/api/analytics/workforce?period=decade')->assertOk()->json('data');

        $this->assertSame('month', $data['period']['key']);
        $this->assertSame('2026-06-01', $data['period']['from']);
        $this->assertSame('2026-06-15', $data['period']['to']);
    }

    public function test_each_period_reports_its_own_label_and_bounds(): void
    {
        Carbon::setTestNow('2026-06-15 10:00:00');
        $admin = $this->admin();

        $week = $this->actingAs($admin)->getJson('/api/analytics/workforce?period=week')->assertOk()->json('data');
        $this->assertSame('week', $week['period']['key']);

        $year = $this->actingAs($admin)->getJson('/api/analytics/workforce?period=year')->assertOk()->json('data');
        $this->assertSame('year', $year['period']['key']);
        $this->assertSame('2026-01-01', $year['period']['from']);
        $this->assertSame('2026-06-15', $year['period']['to']);
        $this->assertSame('2026', $year['period']['label']);
    }

    public function test_every_card_carries_its_own_data_source_and_formula_text(): void
    {
        Carbon::setTestNow('2026-06-15 10:00:00');
        $admin = $this->admin();

        $data = $this->actingAs($admin)->getJson('/api/analytics/workforce?period=month')->assertOk()->json('data');

        foreach (['attendanceSummary', 'attendanceRate', 'leaveTrend', 'overtimeHours', 'departmentPunctuality', 'leaveComposition'] as $card) {
            $this->assertArrayHasKey('meta', $data[$card], "{$card} must explain its own data source and formula.");
            $this->assertNotEmpty($data[$card]['meta']['dataSource']);
            $this->assertNotEmpty($data[$card]['meta']['formula']);
        }
    }
}
