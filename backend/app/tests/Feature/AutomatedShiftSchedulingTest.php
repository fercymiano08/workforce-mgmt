<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\Notification;
use App\Models\ScheduleSetting;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Automated shift scheduling: the rules build a draft, HR approves it. Anchored at Monday 2030-01-14 (Manila), so the
 * earliest start is Tuesday the 15th and "the week of Monday the 21st" is Mon 21 - Sun 27 January.
 */
class AutomatedShiftSchedulingTest extends TestCase
{
    use RefreshDatabase;

    private ?User $admin = null;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2030-01-14 09:00:00', 'Asia/Manila'));
        ScheduleSetting::current()->update(['default_work_days' => [1, 2, 3, 4, 5, 6], 'max_weekly_hours' => 48]);   // Mon-Sat
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function staff(int $n, string $department = 'Ops', string $position = 'Staff', string $prefix = 'E'): array
    {
        $ids = [];
        for ($i = 1; $i <= $n; $i++) {
            $id = $prefix.$i;
            Employee::create(['id' => $id, 'first_name' => $prefix, 'last_name' => (string) $i, 'email' => strtolower($id).'@x.com',
                'department' => $department, 'position' => $position, 'status' => 'Active']);
            $ids[] = $id;
        }

        return $ids;
    }

    private function request(array $override = []): array
    {
        return array_replace_recursive([
            'startDate' => '2030-01-21',   // a Monday
            'weeks' => 1,
            'required' => 2,
        ], $override);
    }

    private function preview(array $override = [])
    {
        $this->admin ??= $this->adminUser();

        return $this->actingAs($this->admin)->postJson('/api/shifts/automated/preview', $this->request($override));
    }

    private function approve(array $assignments, array $override = [])
    {
        $this->admin ??= $this->adminUser();

        return $this->actingAs($this->admin)->postJson('/api/shifts/automated/approve', $this->request($override) + ['assignments' => $assignments]);
    }

    /** @return array<string, list<string>> employeeId => dates the draft assigns */
    private function assigned(array $draft): array
    {
        $out = [];
        foreach ($draft['employees'] as $e) {
            foreach ((array) $e['cells'] as $date => $cell) {
                if ($cell['state'] === 'assigned') {
                    $out[$e['id']][] = $date;
                }
            }
        }

        return $out;
    }

    public function test_a_draft_assigns_the_required_number_each_day_and_writes_nothing(): void
    {
        $this->staff(5);

        $draft = $this->preview(['required' => 3])->assertOk()->json('data');

        $this->assertSame(0, ShiftSchedule::count());
        $this->assertSame(5, $draft['eligibleEmployees']);
        $this->assertSame(3, $draft['required']);
        $this->assertSame(18, $draft['totalAssignments']);   // 6 working days (Mon-Sat) x 3
        $this->assertCount(6, $draft['days']);
        $this->assertSame('2030-01-21', $draft['days'][0]['date']);
        $this->assertSame('2030-01-26', $draft['days'][5]['date']);   // Saturday: Sunday is the day off
        $this->assertEquals(8.0, $draft['shift']['hours']);              // 9 hours minus the unpaid hour of lunch

        $perDay = [];
        foreach ($this->assigned($draft) as $dates) {
            foreach ($dates as $d) {
                $perDay[$d] = ($perDay[$d] ?? 0) + 1;
            }
        }
        $this->assertCount(6, $perDay);
        $this->assertSame([3], array_values(array_unique($perDay)));
    }

    public function test_the_work_is_shared_fairly(): void
    {
        $this->staff(4);   // 2 a day over 6 days = 12 shifts: exactly 3 each

        $counts = array_map('count', $this->assigned($this->preview(['required' => 2])->json('data')));

        $this->assertSame([3, 3, 3, 3], array_values($counts));
    }

    public function test_the_same_input_always_gives_the_same_draft(): void
    {
        $this->staff(7);

        $this->assertSame($this->preview()->json('data.employees'), $this->preview()->json('data.employees'));
    }

    public function test_the_pool_only_holds_active_people_matching_the_department_and_position(): void
    {
        $this->staff(3, 'Ops', 'Staff', 'A');
        $this->staff(2, 'Ops', 'Lead', 'B');
        $this->staff(2, 'IT', 'Staff', 'C');
        Employee::create(['id' => 'GONE', 'first_name' => 'X', 'last_name' => 'Y', 'email' => 'g@x.com', 'department' => 'Ops', 'position' => 'Staff', 'status' => 'Inactive']);

        $this->assertSame(7, $this->preview()->json('data.eligibleEmployees'));   // everyone active
        $this->assertSame(5, $this->preview(['department' => 'Ops'])->json('data.eligibleEmployees'));
        $this->assertSame(2, $this->preview(['department' => 'Ops', 'position' => 'Lead'])->json('data.eligibleEmployees'));
        $draft = $this->preview(['position' => 'Staff'])->json('data');
        $this->assertSame(5, $draft['eligibleEmployees']);
        $this->assertNotContains('GONE', array_column($draft['employees'], 'id'));
    }

    public function test_someone_on_approved_leave_is_never_assigned_that_day_and_shows_as_on_leave(): void
    {
        $this->staff(3);
        Leave::withoutEvents(fn () => Leave::create(['id' => 'LVE1', 'employee_id' => 'E1', 'employee_name' => 'E 1', 'leave_type' => 'Vacation',
            'start_date' => '2030-01-22', 'end_date' => '2030-01-23', 'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-01']));
        Leave::withoutEvents(fn () => Leave::create(['id' => 'LVE2', 'employee_id' => 'E2', 'employee_name' => 'E 2', 'leave_type' => 'Vacation',
            'start_date' => '2030-01-24', 'end_date' => '2030-01-24', 'reason' => 'x', 'status' => 'Pending', 'applied_date' => '2030-01-01']));

        $draft = $this->preview(['required' => 3])->json('data');
        $e1 = collect($draft['employees'])->firstWhere('id', 'E1');
        $e2 = collect($draft['employees'])->firstWhere('id', 'E2');

        $this->assertSame('leave', $e1['cells']['2030-01-22']['state']);
        $this->assertSame('leave', $e1['cells']['2030-01-23']['state']);
        $this->assertSame('assigned', $e1['cells']['2030-01-21']['state']);
        $this->assertSame('assigned', $e2['cells']['2030-01-24']['state']);   // a pending request does not count
        $this->assertSame(2, collect($draft['shortfalls'])->count());          // 2 of 3 on the two leave days
        $this->assertSame(['date' => '2030-01-22', 'needed' => 3, 'assigned' => 2], $draft['shortfalls'][0]);
    }

    public function test_someone_already_scheduled_that_day_is_not_double_booked(): void
    {
        $this->staff(2);
        $this->scheduleShift('E1', '08:00:00', '17:00:00', '2030-01-21');

        $draft = $this->preview(['required' => 2])->json('data');
        $e1 = collect($draft['employees'])->firstWhere('id', 'E1');

        $this->assertSame('existing', $e1['cells']['2030-01-21']['state']);
        $this->assertNotEmpty($e1['cells']['2030-01-21']['label']);
        $this->assertSame(1, collect($this->assigned($draft))->flatten()->filter(fn ($d) => $d === '2030-01-21')->count());   // only E2
    }

    public function test_nobody_goes_over_the_weekly_hours_limit(): void
    {
        $this->staff(2);

        // 8 paid hours a shift, at most 24 hours a week = 3 shifts each, so 6 shifts a week however many are required
        $draft = $this->preview(['required' => 2, 'maxWeeklyHours' => 24])->json('data');

        foreach ($this->assigned($draft) as $dates) {
            $this->assertLessThanOrEqual(3, count($dates));
        }
        $this->assertSame(6, $draft['totalAssignments']);
        $this->assertNotEmpty($draft['shortfalls']);
    }

    public function test_hours_already_scheduled_that_week_count_towards_the_limit(): void
    {
        $this->staff(1);
        foreach (['2030-01-21', '2030-01-22'] as $d) {
            $this->scheduleShift('E1', '08:00:00', '17:00:00', $d);   // 16 hours already
        }

        $draft = $this->preview(['required' => 1, 'maxWeeklyHours' => 24])->json('data');

        $this->assertCount(1, $this->assigned($draft)['E1']);   // only one more 8-hour shift fits under 24
    }

    public function test_the_limit_is_per_week_not_per_period(): void
    {
        $this->staff(1);

        $draft = $this->preview(['required' => 1, 'weeks' => 2, 'maxWeeklyHours' => 24])->json('data');

        $this->assertSame('2030-02-03', $draft['endDate']);
        $this->assertCount(6, $this->assigned($draft)['E1']);   // 3 in each of the two weeks
    }

    public function test_a_holiday_gets_no_shifts(): void
    {
        $this->staff(3);
        Holiday::create(['date' => '2030-01-23', 'name' => 'Founders Day']);

        $draft = $this->preview()->json('data');
        $holiday = collect($draft['days'])->firstWhere('date', '2030-01-23');

        $this->assertSame('Founders Day', $holiday['holiday']);
        $this->assertSame(10, $draft['totalAssignments']);   // 5 other working days x 2
        $this->assertNotContains('2030-01-23', collect($this->assigned($draft))->flatten()->all());
    }

    public function test_the_usual_work_days_are_the_default_and_can_be_changed_for_a_draft(): void
    {
        $this->staff(2);

        $this->assertCount(6, $this->preview()->json('data.days'));
        $custom = $this->preview(['workDays' => [1, 2, 3, 4, 5]])->json('data.days');

        $this->assertCount(5, $custom);
        $this->assertNotContains(6, array_column($custom, 'weekday'));
    }

    public function test_the_start_date_must_be_tomorrow_or_later(): void
    {
        $this->staff(1);

        $this->preview(['startDate' => '2030-01-14'])->assertStatus(422)->assertJsonValidationErrors('startDate');   // today
        $this->preview(['startDate' => '2030-01-10'])->assertStatus(422);
        $this->preview(['startDate' => '2030-01-15'])->assertOk();                                                  // tomorrow
    }

    public function test_bad_requests_are_refused(): void
    {
        $this->preview(['weeks' => 5])->assertStatus(422)->assertJsonValidationErrors('weeks');
        $this->preview(['required' => 0])->assertStatus(422)->assertJsonValidationErrors('required');
    }

    public function test_approving_saves_the_shifts_tells_each_employee_and_is_audited(): void
    {
        $this->staff(2);
        $draft = $this->preview(['required' => 1])->json('data');
        $assignments = collect($this->assigned($draft))->flatMap(fn ($dates, $id) => array_map(fn ($d) => ['employeeId' => $id, 'date' => $d], $dates))->values()->all();

        $res = $this->approve($assignments, ['required' => 1])->assertCreated();

        $this->assertSame(6, $res->json('data.created'));
        $this->assertSame(6, ShiftSchedule::count());
        $this->assertSame(['Scheduled'], ShiftSchedule::pluck('status')->unique()->all());
        $shiftId = $res->json('data.shiftId');
        $this->assertSame(6, ShiftSchedule::where('shift_id', $shiftId)->count());

        $note = Notification::where('employee_id', 'E1')->where('type', 'shift_assigned')->sole();
        $this->assertStringContainsString('Jan 21 – Jan 27, 2030 (3 shifts, Standard Shift 8:00 AM – 5:00 PM)', $note->message);
        $audit = AuditEvent::where('event', 'schedule.automated_approved')->sole();
        $this->assertSame(6, $audit->after['created']);
        $this->assertSame('John Delgado', $audit->actor);
    }

    public function test_the_shift_is_always_the_standard_shift_and_none_can_be_chosen_or_created(): void
    {
        $this->staff(1);

        // whatever a client sends about shifts is ignored
        $draft = $this->preview(['shift' => ['name' => 'Night', 'startTime' => '22:00', 'endTime' => '23:30']])->assertOk()->json('data');
        $this->assertSame('SHIFT004', $draft['shift']['id']);
        $this->assertSame('Standard Shift', $draft['shift']['name']);
        $this->assertSame('08:00', $draft['shift']['startTime']);
        $this->assertSame('17:00', $draft['shift']['endTime']);

        $res = $this->approve([['employeeId' => 'E1', 'date' => '2030-01-21']], ['shift' => ['name' => 'Night', 'startTime' => '22:00', 'endTime' => '23:30']])->assertCreated();

        $this->assertSame('SHIFT004', $res->json('data.shiftId'));
        $this->assertSame(1, ShiftDefinition::count());   // nothing was created
        $this->assertSame('SHIFT004', ShiftSchedule::sole()->shift_id);
    }

    public function test_it_refuses_when_the_standard_shift_is_missing(): void
    {
        $this->staff(1);
        ShiftDefinition::query()->delete();

        $this->preview()->assertStatus(422)->assertJsonValidationErrors('shift');
    }

    public function test_the_draft_explains_why_people_were_not_scheduled(): void
    {
        $this->staff(3);
        Leave::withoutEvents(fn () => Leave::create(['id' => 'LVE1', 'employee_id' => 'E1', 'employee_name' => 'E 1', 'leave_type' => 'Vacation',
            'start_date' => '2030-01-22', 'end_date' => '2030-01-22', 'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-01']));
        $this->scheduleShift('E2', '08:00:00', '17:00:00', '2030-01-21');
        Holiday::create(['date' => '2030-01-23', 'name' => 'Founders Day']);
        for ($d = 21; $d <= 22; $d++) {
            $this->scheduleShift('E3', '08:00:00', '17:00:00', '2030-01-'.$d);   // 16 hours already; the limit below allows one more
        }

        $notes = $this->preview(['required' => 3, 'maxWeeklyHours' => 24])->json('data.notes');

        $this->assertSame([['id' => 'E1', 'name' => 'E 1', 'dates' => ['2030-01-22']]], $notes['onLeave']);
        $this->assertSame(['E2', 'E3'], array_column($notes['alreadyScheduled'], 'id'));
        $this->assertSame([['date' => '2030-01-23', 'name' => 'Founders Day']], $notes['holidays']);
        $this->assertNotEmpty($notes['hoursLimited']);   // E3 hit the 24-hour cap after one more shift
        $this->assertArrayHasKey('shiftsPerEmployee', $notes);
    }

    public function test_hr_can_change_the_draft_before_approving(): void
    {
        $this->staff(3);
        // HR's own choice: E3 works Monday and Saturday, nobody else
        $res = $this->approve([['employeeId' => 'E3', 'date' => '2030-01-21'], ['employeeId' => 'E3', 'date' => '2030-01-26']])->assertCreated();

        $this->assertSame(2, $res->json('data.created'));
        $this->assertSame(['E3'], ShiftSchedule::pluck('employee_id')->unique()->all());
    }

    public function test_an_assignment_that_stopped_being_valid_while_the_draft_was_open_is_skipped_and_reported(): void
    {
        $this->staff(3);
        $draft = $this->preview(['required' => 3])->json('data');
        $assignments = collect($this->assigned($draft))->flatMap(fn ($dates, $id) => array_map(fn ($d) => ['employeeId' => $id, 'date' => $d], $dates))->values()->all();

        // while HR looked at the draft: E1 got leave approved for Monday, and E2 was scheduled by hand on Tuesday
        Leave::withoutEvents(fn () => Leave::create(['id' => 'LVE1', 'employee_id' => 'E1', 'employee_name' => 'E 1', 'leave_type' => 'Vacation',
            'start_date' => '2030-01-21', 'end_date' => '2030-01-21', 'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-01']));
        $this->scheduleShift('E2', '08:00:00', '17:00:00', '2030-01-22');

        $res = $this->approve($assignments, ['required' => 3])->assertCreated();

        $reasons = collect($res->json('data.skipped'))->pluck('reason', 'employeeId')->all();
        $this->assertSame('on approved leave that day', $reasons['E1']);
        $this->assertSame('already has a shift that day', $reasons['E2']);
        $this->assertSame(count($assignments) - 2, $res->json('data.created'));
        $this->assertSame(0, ShiftSchedule::where('employee_id', 'E1')->whereDate('date', '2030-01-21')->count());
    }

    public function test_approving_something_nobody_can_work_is_refused(): void
    {
        $this->staff(1);

        $this->approve([['employeeId' => 'E1', 'date' => '2030-01-27']])   // a Sunday: not a working day
            ->assertStatus(422);
        $this->approve([['employeeId' => 'NOBODY', 'date' => '2030-01-21']])->assertStatus(422);

        $this->assertSame(0, ShiftSchedule::count());
    }

    public function test_only_an_administrator_can_use_it(): void
    {
        $employee = $this->otpEmployeeUser();

        $this->actingAs($employee)->postJson('/api/shifts/automated/preview', $this->request())->assertForbidden();
        $this->actingAs($employee)->postJson('/api/shifts/automated/approve', $this->request() + ['assignments' => []])->assertForbidden();
    }

    public function test_a_newly_approved_leave_still_clears_shifts_that_were_saved_earlier(): void
    {
        $this->staff(1);
        $this->approve([['employeeId' => 'E1', 'date' => '2030-01-22'], ['employeeId' => 'E1', 'date' => '2030-01-23']])->assertCreated();

        Leave::create(['id' => 'LVE1', 'employee_id' => 'E1', 'employee_name' => 'E 1', 'leave_type' => 'Vacation',
            'start_date' => '2030-01-22', 'end_date' => '2030-01-22', 'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-15']);

        $this->assertSame(['2030-01-23'], ShiftSchedule::pluck('date')->map->toDateString()->all());
    }
}
