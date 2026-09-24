<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\AuditEvent;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\SecurityEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Every figure AI Decision Support shows is checked against what is in the database: the right days (Manila's
 * calendar), the right people (not those who left), every attendance status counted the way the rest of the
 * system counts it, and decisions made here leaving the same trail as anywhere else.
 */
class AIDecisionSupportAccuracyTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function person(string $id, string $status = 'Active'): Employee
    {
        return Employee::create(['id' => $id, 'first_name' => 'P', 'last_name' => $id, 'email' => "{$id}@x.com", 'department' => 'Ops', 'status' => $status]);
    }

    private function day(string $employee, string $date, string $status, ?string $in = '07:55:00', float $overtime = 0): void
    {
        Attendance::create(['id' => 'ATT'.$employee.str_replace('-', '', $date), 'employee_id' => $employee, 'date' => $date,
            'clock_in' => $status === 'Absent' ? null : $in, 'status' => $status, 'overtime' => $overtime]);
    }

    private ?User $admin = null;

    private function admin(): User
    {
        return $this->admin ??= $this->adminUser();
    }

    private function insights(): array
    {
        return $this->actingAs($this->admin())->getJson('/api/analytics/ai/insights')->assertOk()->json('data');
    }

    private function byId(array $data): array
    {
        return array_column($data['insights'], null, 'id');
    }

    public function test_a_day_that_ended_early_counts_as_attended_and_is_judged_on_time_by_its_clock_in(): void
    {
        Carbon::setTestNow(Carbon::parse('2030-01-18 12:00:00', 'Asia/Manila'));
        $this->person('EMP1');
        $this->scheduleShift('EMP1', '08:00:00', '17:00:00', '2030-01-14');
        $this->scheduleShift('EMP1', '08:00:00', '17:00:00', '2030-01-15');
        $this->day('EMP1', '2030-01-14', 'Early Leave', '07:58:00');   // on time, left early
        $this->day('EMP1', '2030-01-15', 'Early Leave', '08:40:00');   // late, then left early
        $this->day('EMP1', '2030-01-16', 'Present');
        $this->day('EMP1', '2030-01-17', 'Present');

        $data = $this->insights();
        $healthy = $this->byId($data)['healthy-attendance'];

        // 4 of 4 attended (not 2 of 4) and 3 of 4 on time
        $this->assertStringContainsString('4 of 4 expected work days', $healthy['message']);
        $this->assertContains(['label' => 'Punctuality', 'points' => 12.5, 'detail' => '75% of arrivals on time'], $data['scoreBreakdown']);
    }

    public function test_the_30_days_are_counted_on_manila_calendar_days(): void
    {
        // 07:00 on Jan 31 in Manila is still Jan 30 in UTC: the window must end on the 31st and start on Jan 2
        Carbon::setTestNow(Carbon::parse('2030-01-31 07:00:00', 'Asia/Manila'));
        $this->person('EMP1');
        $this->day('EMP1', '2030-01-01', 'Absent');   // 31 days ago: outside
        $this->day('EMP1', '2030-01-02', 'Present');  // first day in
        $this->day('EMP1', '2030-01-31', 'Present');  // today

        $data = $this->insights();

        $this->assertSame(['from' => '2030-01-02', 'to' => '2030-01-31', 'days' => 30], $data['window']);
        $this->assertStringContainsString('2 of 2 expected work days', $this->byId($data)['healthy-attendance']['message']);
    }

    public function test_people_who_left_are_not_flagged(): void
    {
        Carbon::setTestNow(Carbon::parse('2030-01-18 12:00:00', 'Asia/Manila'));
        $this->person('EMP1', 'Inactive');
        foreach (['2030-01-14', '2030-01-15', '2030-01-16'] as $d) {
            $this->day('EMP1', $d, 'Late', '09:00:00');
        }

        $this->assertArrayNotHasKey('late-EMP1', $this->byId($this->insights()));
    }

    public function test_overtime_is_averaged_over_days_worked_not_days_absent(): void
    {
        Carbon::setTestNow(Carbon::parse('2030-01-18 12:00:00', 'Asia/Manila'));
        $this->person('EMP1');
        $this->day('EMP1', '2030-01-14', 'Present', '07:55:00', 3);
        $this->day('EMP1', '2030-01-15', 'Present', '07:55:00', 0);
        $this->day('EMP1', '2030-01-16', 'Absent');
        $this->day('EMP1', '2030-01-17', 'Absent');

        // 3h over 2 days worked = 1.5h a day (not 0.75h over 4 records)
        $this->assertSame('1.5h/day avg', $this->byId($this->insights())['overtime-EMP1']['metric']);
    }

    public function test_a_scheduled_person_is_a_possible_no_show_only_after_the_grace_time_like_the_alert(): void
    {
        $this->person('EMP1');
        $this->scheduleShift('EMP1', '08:00:00', '17:00:00', '2030-01-14');

        Carbon::setTestNow(Carbon::parse('2030-01-14 07:30:00', 'Asia/Manila'));   // before the shift
        $early = $this->byId($this->insights());
        $this->assertArrayNotHasKey('no-show-today', $early);
        $this->assertStringContainsString('1 is not due yet', $early['coverage-today']['message']);

        Carbon::setTestNow(Carbon::parse('2030-01-14 09:05:00', 'Asia/Manila'));   // 65 minutes in, no clock-in
        $late = $this->byId($this->insights());
        $this->assertSame('warning', $late['no-show-today']['severity']);
        $this->assertStringContainsString('P EMP1', $late['no-show-today']['message']);
    }

    public function test_someone_on_approved_leave_is_not_a_no_show(): void
    {
        Carbon::setTestNow(Carbon::parse('2030-01-14 10:00:00', 'Asia/Manila'));
        $this->person('EMP1');
        $this->scheduleShift('EMP1', '08:00:00', '17:00:00', '2030-01-14');
        Leave::withoutEvents(fn () => Leave::create(['id' => 'LVE1', 'employee_id' => 'EMP1', 'employee_name' => 'P EMP1', 'leave_type' => 'Vacation',
            'start_date' => '2030-01-14', 'end_date' => '2030-01-14', 'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-01']));

        $this->assertArrayNotHasKey('no-show-today', $this->byId($this->insights()));
    }

    public function test_a_handled_finding_comes_back_when_it_happens_again(): void
    {
        Carbon::setTestNow(Carbon::parse('2030-01-18 12:00:00', 'Asia/Manila'));
        $admin = $this->admin();
        $this->person('EMP1');
        foreach (['2030-01-14', '2030-01-15', '2030-01-16'] as $d) {
            $this->day('EMP1', $d, 'Late', '09:00:00');
        }

        $key = $this->byId($this->insights())['late-EMP1']['resolveKey'];
        $this->actingAs($admin)->postJson('/api/analytics/ai/actions', ['action' => 'resolve_insight', 'key' => $key])->assertOk();
        $this->assertTrue($this->byId($this->insights())['late-EMP1']['resolved']);

        $this->day('EMP1', '2030-01-17', 'Late', '09:00:00');   // late again after it was handled

        $this->assertFalse($this->byId($this->insights())['late-EMP1']['resolved']);
    }

    public function test_the_queue_shows_the_leave_balance_and_who_else_is_off(): void
    {
        Carbon::setTestNow(Carbon::parse('2030-01-10 12:00:00', 'Asia/Manila'));
        $this->person('EMP1');
        $this->person('EMP2');
        Leave::withoutEvents(function () {
            Leave::create(['id' => 'LVE1', 'employee_id' => 'EMP2', 'employee_name' => 'P EMP2', 'leave_type' => 'Vacation', 'days' => 2,
                'start_date' => '2030-01-20', 'end_date' => '2030-01-21', 'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-01']);
            Leave::create(['id' => 'LVE2', 'employee_id' => 'EMP1', 'employee_name' => 'P EMP1', 'leave_type' => 'Vacation', 'days' => 3,
                'start_date' => '2030-01-21', 'end_date' => '2030-01-23', 'reason' => 'x', 'status' => 'Pending', 'applied_date' => '2030-01-05']);
        });

        $item = $this->insights()['queue']['leave'][0];
        $total = collect(Employee::find('EMP1')->leaveBalances())->firstWhere('type', 'Vacation')['total'];

        $this->assertSame('LVE2', $item['id']);
        $this->assertEquals($total, $item['balance']['remaining']);
        $this->assertEquals($total - 3, $item['balance']['afterApproval']);
        $this->assertSame(1, $item['othersOff']);         // EMP2 is off on the 21st
        $this->assertFalse($item['alreadyStarted']);
    }

    public function test_a_decision_made_here_is_in_the_audit_log(): void
    {
        $this->person('EMP1');
        Leave::create(['id' => 'LVE1', 'employee_id' => 'EMP1', 'employee_name' => 'P EMP1', 'leave_type' => 'Vacation',
            'start_date' => '2030-01-20', 'end_date' => '2030-01-20', 'reason' => 'x', 'status' => 'Pending', 'applied_date' => '2030-01-01']);

        $this->actingAs($this->admin())->postJson('/api/analytics/ai/actions', ['action' => 'approve_leave', 'id' => 'LVE1'])->assertOk();

        $audit = AuditEvent::where('event', 'leave.status_changed')->where('entity_id', 'LVE1')->sole();
        $this->assertSame('Approved', $audit->meta['status']);
        $this->assertSame('John Delgado', $audit->actor);
    }

    public function test_resolve_all_leaves_escalated_events_escalated(): void
    {
        $open = fn ($id, $status) => SecurityEvent::create(['id' => $id, 'type' => 'pin_failed', 'message' => 'Failed attempt (incorrect PIN)', 'status' => $status]);
        $open('SEV1', 'Open');
        $open('SEV2', 'Flagged');

        $this->actingAs($this->admin())->postJson('/api/analytics/ai/actions', ['action' => 'resolve_all_security'])
            ->assertOk()->assertJson(['resolved' => 1]);

        $this->assertSame('Resolved', SecurityEvent::find('SEV1')->status);
        $this->assertSame('Flagged', SecurityEvent::find('SEV2')->status);
    }
}
