<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\ShiftSchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/** The "By Employee" tab inside Workforce Analytics - the same window as the workforce cards, for one person. */
class EmployeeAnalyticsTest extends TestCase
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
            'id' => $id, 'first_name' => 'Test', 'last_name' => $id,
            'email' => strtolower($id).'@example.com', 'department' => 'IT & Systems', 'position' => 'Developer',
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

    public function test_it_reads_one_employees_attendance_punctuality_leave_and_overtime(): void
    {
        Carbon::setTestNow('2026-06-15 10:00:00');
        $admin = $this->admin();
        $e = $this->employee();
        $other = $this->employee('EMP002');

        foreach (['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04'] as $date) {
            $this->roster($e, $date);
        }
        $this->punch($e, '2026-06-01', 'Present');
        $this->punch($e, '2026-06-02', 'Present');
        $this->punch($e, '2026-06-03', 'Late', 1.5);
        $this->punch($e, '2026-06-04', 'Absent');
        // A second employee's data must never leak into the first one's card.
        $this->punch($other, '2026-06-01', 'Absent');

        $this->leave($e, 'Vacation', '2026-06-10', '2026-06-10', 1.0);

        $data = $this->actingAs($admin)
            ->getJson('/api/analytics/employee/'.$e->id.'?period=year')
            ->assertOk()->json('data');

        $this->assertSame('Test EMP001', $data['employee']['name']);
        $this->assertSame(3, $data['attendance']['presentDays']); // Present + Present + Late
        $this->assertSame(4, $data['attendance']['scheduledDays']);
        $this->assertEquals(75.0, $data['attendance']['rate']); // 3/4
        $this->assertEquals(66.7, $data['punctuality']['rate']); // 2 on-time / 3 present days
        $this->assertEquals(1.5, $data['overtime']['hours']);
        $this->assertEquals(1.0, $data['leave']['daysUsed']);
        $this->assertEquals(1.0, $data['leave']['byType']['Vacation']);
        $this->assertNotEmpty($data['leave']['balances']);
    }

    private function leave(Employee $employee, string $type, string $start, string $end, float $days): void
    {
        Leave::create([
            'id' => 'LV'.strtoupper(str_replace(' ', '', $type)).str_replace('-', '', $start).$employee->id,
            'employee_id' => $employee->id, 'employee_name' => $employee->first_name.' '.$employee->last_name,
            'leave_type' => $type, 'start_date' => $start, 'end_date' => $end, 'days' => $days,
            'reason' => 'test', 'status' => 'Approved', 'applied_date' => $start,
        ]);
    }

    public function test_too_few_records_is_reported_as_not_enough_data_rather_than_a_score(): void
    {
        Carbon::setTestNow('2026-06-15 10:00:00');
        $admin = $this->admin();
        $e = $this->employee();
        $this->punch($e, '2026-06-01', 'Present');

        $performance = $this->actingAs($admin)
            ->getJson('/api/analytics/employee/'.$e->id.'?period=year')
            ->assertOk()->json('data.performance');

        $this->assertSame('Not enough data yet', $performance['label']);
        $this->assertNull($performance['score']);
    }

    public function test_the_performance_read_is_never_presented_as_a_full_review(): void
    {
        Carbon::setTestNow('2026-06-15 10:00:00');
        $admin = $this->admin();
        $e = $this->employee();
        foreach (['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'] as $date) {
            $this->roster($e, $date);
            $this->punch($e, $date, 'Present');
        }

        $performance = $this->actingAs($admin)
            ->getJson('/api/analytics/employee/'.$e->id.'?period=year')
            ->assertOk()->json('data.performance');

        $this->assertSame('Consistently punctual and present', $performance['label']);
        $this->assertStringContainsString('not a full performance review', $performance['note']);
    }

    public function test_an_unknown_employee_is_refused(): void
    {
        $this->actingAs($this->admin())
            ->getJson('/api/analytics/employee/EMP-NOPE?period=year')
            ->assertStatus(404);
    }

    public function test_an_employee_cannot_read_it_even_their_own(): void
    {
        $e = $this->employee();
        $employeeUser = User::factory()->create(['role' => 'Employee', 'employee_id' => $e->id]);

        $this->actingAs($employeeUser)->getJson('/api/analytics/employee/'.$e->id)->assertForbidden();
    }

    public function test_an_anonymous_request_is_rejected(): void
    {
        $e = $this->employee();

        $this->getJson('/api/analytics/employee/'.$e->id)->assertUnauthorized();
    }

    // --- Top Performers --------------------------------------------------------------------------

    public function test_employees_are_ranked_best_first_and_each_has_a_rank(): void
    {
        Carbon::setTestNow('2026-06-15 10:00:00');
        $admin = $this->admin();
        $star = $this->employee('EMP001');
        $struggling = $this->employee('EMP002');

        foreach (['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'] as $date) {
            $this->roster($star, $date);
            $this->punch($star, $date, 'Present');
            $this->roster($struggling, $date);
            $this->punch($struggling, $date, 'Late');
        }
        // One extra absence for the struggling employee, so their attendance rate is also lower.
        $this->roster($struggling, '2026-06-08');

        $ranked = $this->actingAs($admin)
            ->getJson('/api/analytics/top-performers?period=year')
            ->assertOk()->json('data.ranked');

        $this->assertSame('EMP001', $ranked[0]['employeeId']);
        $this->assertSame(1, $ranked[0]['rank']);
        $this->assertSame('EMP002', $ranked[1]['employeeId']);
        $this->assertSame(2, $ranked[1]['rank']);
        $this->assertGreaterThan($ranked[1]['score'], $ranked[0]['score']);
        $this->assertSame('Consistently punctual and present', $ranked[0]['label']);
    }

    public function test_an_employee_with_too_few_records_is_still_ranked_but_flagged(): void
    {
        Carbon::setTestNow('2026-06-15 10:00:00');
        $admin = $this->admin();
        $e = $this->employee();
        $this->roster($e, '2026-06-01');
        $this->punch($e, '2026-06-01', 'Present');

        $data = $this->actingAs($admin)
            ->getJson('/api/analytics/top-performers?period=year')
            ->assertOk()->json('data');

        $this->assertCount(1, $data['ranked']);
        $this->assertSame(1, $data['ranked'][0]['rank']);
        $this->assertTrue($data['ranked'][0]['limitedData']);
        $this->assertSame('Limited data so far', $data['ranked'][0]['label']);
        $this->assertSame(1, $data['meta']['limitedDataCount']);
    }

    public function test_a_terminated_employee_is_never_ranked(): void
    {
        Carbon::setTestNow('2026-06-15 10:00:00');
        $admin = $this->admin();
        $e = $this->employee();
        $e->update(['status' => 'Terminated']);
        foreach (['2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04', '2026-06-05'] as $date) {
            $this->roster($e, $date);
            $this->punch($e, $date, 'Present');
        }

        $ranked = $this->actingAs($admin)
            ->getJson('/api/analytics/top-performers?period=year')
            ->assertOk()->json('data.ranked');

        $this->assertSame([], $ranked);
    }

    public function test_an_employee_cannot_read_the_ranking(): void
    {
        $employeeUser = User::factory()->create(['role' => 'Employee', 'employee_id' => $this->employee()->id]);

        $this->actingAs($employeeUser)->getJson('/api/analytics/top-performers')->assertForbidden();
    }
}
