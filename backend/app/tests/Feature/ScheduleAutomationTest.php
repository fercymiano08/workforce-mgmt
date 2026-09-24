<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\CoverageRule;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\Notification;
use App\Models\ScheduleBatch;
use App\Models\ScheduleSetting;
use App\Models\ShiftSchedule;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Automated shift scheduling as ONE feature: the rules (work days, holidays, leave, coverage), the calendar
 * window it keeps scheduled (this week, this + next week, this month, next month - weeks run Monday to Sunday,
 * ISO 8601), "Run now" with a preview, undo, and the automatic switch - which performs the very same run by
 * itself for days not yet scheduled. The shift is 8:00 AM, so a day can be scheduled until 8:00 that morning.
 */
class ScheduleAutomationTest extends TestCase
{
    use RefreshDatabase;

    // Monday 14 Jan 2030, before the 8:00 shift: "this week" is Mon 14 - Sun 20 Jan, today included.
    private const MONDAY_EARLY = '2030-01-14 06:00:00';

    private ?User $admin = null;

    protected function setUp(): void
    {
        parent::setUp();
        $this->at(self::MONDAY_EARLY);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function at(string $manilaTime): void
    {
        Carbon::setTestNow(Carbon::parse($manilaTime, 'Asia/Manila'));
    }

    private function admin(): User
    {
        return $this->admin ??= $this->adminUser();
    }

    private function person(string $id, string $department = 'Operations', string $status = 'Active'): Employee
    {
        return Employee::create([
            'id' => $id, 'first_name' => 'Person', 'last_name' => $id, 'email' => $id.'@example.com',
            'department' => $department, 'position' => 'Staff', 'status' => $status,
        ]);
    }

    private function settings(array $changes): void
    {
        ScheduleSetting::current()->update($changes);
    }

    private function runNow(bool $preview = false)
    {
        return $this->actingAs($this->admin())->postJson('/api/shifts/automation/run', ['preview' => $preview]);
    }

    private function autoJob(): void
    {
        $this->artisan('schedules:auto-generate')->assertSuccessful();
    }

    private function datesOf(string $employeeId): array
    {
        return ShiftSchedule::where('employee_id', $employeeId)->orderBy('date')->get()->map(fn ($s) => $s->date->toDateString())->all();
    }

    private function weekdays(string $from, string $to): array
    {
        $days = [];
        for ($d = Carbon::parse($from); $d->toDateString() <= $to; $d->addDay()) {
            if ($d->isoWeekday() <= 5) {
                $days[] = $d->toDateString();
            }
        }

        return $days;
    }

    // --- the windows are calendar periods ----------------------------------------------------------------

    public function test_each_window_is_a_calendar_period_with_weeks_running_monday_to_sunday(): void
    {
        $this->at('2026-09-24 06:00:00');   // Thursday 24 Sep 2026 - the example: this week is Mon 21 - Sun 27
        $admin = $this->admin();

        foreach ([
            'week' => ['2026-09-21', '2026-09-27'],
            'two_weeks' => ['2026-09-21', '2026-10-04'],
            'month' => ['2026-09-01', '2026-09-30'],
            'next_month' => ['2026-10-01', '2026-10-31'],
        ] as $window => [$from, $to]) {
            $this->actingAs($admin)->putJson('/api/shifts/rules/automation', ['autoEnabled' => false, 'window' => $window, 'defaultWorkDays' => [1, 2, 3, 4, 5]])
                ->assertOk()->assertJsonPath('data.window', $window)
                ->assertJsonPath('data.range.from', $from)->assertJsonPath('data.range.to', $to);
        }

        $this->actingAs($admin)->putJson('/api/shifts/rules/automation', ['autoEnabled' => false, 'window' => 'three_weeks', 'defaultWorkDays' => [1]])->assertStatus(422);
    }

    public function test_one_week_schedules_this_week(): void
    {
        $this->person('EMP1');

        $this->runNow()->assertOk()->assertJsonPath('data.totals.created', 5)->assertJsonPath('data.totals.skippedOffDay', 2);

        $this->assertSame($this->weekdays('2030-01-14', '2030-01-20'), $this->datesOf('EMP1'));
    }

    public function test_two_weeks_schedules_this_week_and_next(): void
    {
        $this->person('EMP1');
        $this->settings(['window' => 'two_weeks']);

        $this->runNow()->assertOk()->assertJsonPath('data.totals.weeks', 2)->assertJsonPath('data.totals.created', 10);

        $this->assertSame($this->weekdays('2030-01-14', '2030-01-27'), $this->datesOf('EMP1'));
    }

    public function test_one_month_schedules_the_rest_of_this_calendar_month(): void
    {
        $this->person('EMP1');
        $this->settings(['window' => 'month']);

        $this->runNow()->assertOk();

        $this->assertSame($this->weekdays('2030-01-14', '2030-01-31'), $this->datesOf('EMP1'));   // ends on Thu 31 Jan
    }

    public function test_next_month_schedules_all_of_next_month_and_nothing_of_this_one(): void
    {
        $this->person('EMP1');
        $this->settings(['window' => 'next_month']);

        $this->runNow()->assertOk()->assertJsonPath('data.totals.created', 20);

        $this->assertSame($this->weekdays('2030-02-01', '2030-02-28'), $this->datesOf('EMP1'));
    }

    public function test_days_that_have_already_started_are_never_filled(): void
    {
        $this->person('EMP1');
        $this->at('2030-01-16 09:00:00');   // Wednesday, after the 8:00 shift began

        $this->actingAs($this->admin())->getJson('/api/shifts/rules')
            ->assertJsonPath('data.automation.range.from', '2030-01-14')            // the window is still the whole week
            ->assertJsonPath('data.automation.firstOpenDay', '2030-01-17');
        $this->runNow()->assertOk();

        $this->assertSame(['2030-01-17', '2030-01-18'], $this->datesOf('EMP1'));    // Mon-Wed are left alone
    }

    public function test_today_can_still_be_scheduled_until_its_shift_starts(): void
    {
        $this->person('EMP1');
        $this->at('2030-01-16 07:30:00');   // Wednesday, before 8:00

        $this->runNow()->assertOk();

        $this->assertSame(['2030-01-16', '2030-01-17', '2030-01-18'], $this->datesOf('EMP1'));
    }

    // --- the rules ----------------------------------------------------------------------------------------

    public function test_changing_everyones_usual_days_schedules_weekends_too(): void
    {
        $this->person('EMP1');
        $this->settings(['default_work_days' => [1, 2, 3, 4, 5, 6, 7]]);

        $this->runNow()->assertOk()->assertJsonPath('data.totals.created', 7);
    }

    public function test_a_department_pattern_and_an_employee_pattern_change_who_works_saturdays(): void
    {
        $this->person('EMP1', 'Retail');      // Retail works Mon-Sat
        $this->person('EMP2', 'Retail');      // ...but this person has her own pattern: Tue-Sat
        $this->person('EMP3', 'Office');      // the usual Mon-Fri
        $admin = $this->admin();
        $this->actingAs($admin)->putJson('/api/shifts/rules/patterns', ['scope' => 'department', 'key' => 'Retail', 'workDays' => [1, 2, 3, 4, 5, 6]])->assertOk();
        $this->actingAs($admin)->putJson('/api/shifts/rules/patterns', ['scope' => 'employee', 'key' => 'EMP2', 'workDays' => [2, 3, 4, 5, 6]])->assertOk();

        $this->runNow()->assertOk();

        $this->assertContains('2030-01-19', $this->datesOf('EMP1'));                       // Saturday, from the department pattern
        $this->assertCount(6, $this->datesOf('EMP1'));
        $this->assertNotContains('2030-01-14', $this->datesOf('EMP2'));                    // her own pattern beats the department's
        $this->assertContains('2030-01-19', $this->datesOf('EMP2'));
        $this->assertNotContains('2030-01-19', $this->datesOf('EMP3'));
        $this->assertCount(5, $this->datesOf('EMP3'));
    }

    public function test_holidays_leave_existing_shifts_and_inactive_people_are_skipped(): void
    {
        $this->person('EMP1');
        $this->person('EMP2', 'Office', 'Inactive');
        Holiday::create(['date' => '2030-01-16', 'name' => 'Test Holiday']);
        Leave::create(['id' => 'LVE1', 'employee_id' => 'EMP1', 'employee_name' => 'P', 'leave_type' => 'Sick', 'start_date' => '2030-01-15', 'end_date' => '2030-01-15',
            'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-10']);
        ShiftSchedule::create(['id' => 'SCH001', 'employee_id' => 'EMP1', 'employee_name' => 'P', 'shift_id' => 'SHIFT004', 'date' => '2030-01-17', 'status' => 'Scheduled']);

        $this->runNow()->assertOk()
            ->assertJsonPath('data.totals.created', 2)                          // Mon and Fri
            ->assertJsonPath('data.totals.skippedHoliday', 1)
            ->assertJsonPath('data.totals.skippedOnLeave', 1)
            ->assertJsonPath('data.totals.skippedExisting', 1)
            ->assertJsonPath('data.weeks.0.holidays.2030-01-16', 'Test Holiday');

        $this->assertSame(['2030-01-14', '2030-01-17', '2030-01-18'], $this->datesOf('EMP1'));
        $this->assertSame([], $this->datesOf('EMP2'));
    }

    public function test_a_day_below_the_minimum_coverage_is_flagged_and_the_admin_is_told_once(): void
    {
        $this->person('EMP1', 'Support');
        $this->person('EMP2', 'Support');
        $this->person('EMP3', 'Support');
        CoverageRule::create(['department' => 'Support', 'min_staff' => 3]);
        Leave::create(['id' => 'LVE1', 'employee_id' => 'EMP2', 'employee_name' => 'P', 'leave_type' => 'Sick', 'start_date' => '2030-01-16', 'end_date' => '2030-01-16',
            'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-10']);

        $short = collect($this->runNow()->assertOk()->json('data.weeks.0.coverageShortages'));

        $this->assertCount(1, $short);
        $this->assertSame(['date' => '2030-01-16', 'department' => 'Support', 'have' => 2, 'need' => 3], $short->first());
        $this->assertSame(1, Notification::where('title', 'Below Minimum Coverage')->count());
    }

    // --- preview, publish, undo -------------------------------------------------------------------------

    public function test_a_preview_creates_nothing(): void
    {
        $this->person('EMP1');

        $this->runNow(preview: true)->assertOk()->assertJsonPath('data.preview', true)->assertJsonPath('data.totals.created', 5);

        $this->assertSame(0, ShiftSchedule::count());
        $this->assertSame(0, ScheduleBatch::count());
    }

    public function test_a_month_is_published_one_history_entry_per_week_with_one_message_per_person(): void
    {
        $this->person('EMP1');
        $this->settings(['window' => 'month']);

        $this->runNow()->assertOk()->assertJsonPath('data.totals.weeks', 3);   // 14-20, 21-27, 28-31 Jan

        $this->assertSame(['2030-01-14', '2030-01-21', '2030-01-28'], ScheduleBatch::orderBy('start_date')->pluck('start_date')->map->toDateString()->all());
        $this->assertSame('2030-01-31', ScheduleBatch::orderByDesc('start_date')->first()->end_date->toDateString());   // stops at the month's end
        $this->assertSame(1, Notification::where('employee_id', 'EMP1')->where('type', 'shift_assigned')->count());
    }

    public function test_undoing_a_week_removes_only_shifts_from_tomorrow_on(): void
    {
        $this->person('EMP1');
        $batchId = $this->runNow()->assertOk()->json('data.weeks.0.batchId');
        $this->at('2030-01-16 09:00:00');   // Wednesday of that week

        $this->actingAs($this->admin())->deleteJson('/api/shifts/batches/'.$batchId)
            ->assertOk()->assertJsonPath('data.status', 'Undone')->assertJsonPath('data.summary.removed', 2)->assertJsonPath('data.summary.kept', 3);

        // Mon and Tue already passed, and today (Wed) people may already be at work: kept. Thu and Fri go.
        $this->assertSame(['2030-01-14', '2030-01-15', '2030-01-16'], $this->datesOf('EMP1'));
        $this->actingAs($this->admin())->deleteJson('/api/shifts/batches/'.$batchId)->assertStatus(409);
    }

    // --- the automatic switch: the same run, done by the system ------------------------------------------

    public function test_while_switched_off_nothing_happens_by_itself(): void
    {
        $this->person('EMP1');

        $this->autoJob();

        $this->assertSame(0, ShiftSchedule::count());
    }

    public function test_switched_on_it_schedules_the_window_right_away_and_only_once(): void
    {
        $this->person('EMP1');
        $this->settings(['auto_enabled' => true]);

        $this->autoJob();

        $this->assertSame(5, ShiftSchedule::count());
        $this->assertSame('automatic', ScheduleBatch::first()->source);
        $this->assertSame('System', ScheduleBatch::first()->created_by);
        $this->assertSame(1, Notification::where('type', 'schedule_generated')->count());

        $this->at('2030-01-14 07:00:00');   // the next hourly check
        $this->autoJob();

        $this->assertSame(1, ScheduleBatch::count());
        $this->assertSame(1, Notification::where('type', 'schedule_generated')->count());
    }

    public function test_a_new_week_is_scheduled_just_after_midnight_on_monday_including_monday(): void
    {
        $this->person('EMP1');
        $this->settings(['auto_enabled' => true]);
        $this->autoJob();                           // week of 14 Jan

        $this->at('2030-01-20 23:00:00');           // Sunday night: still that week
        $this->autoJob();
        $this->assertSame(1, ScheduleBatch::count());

        $this->at('2030-01-21 00:05:00');           // Monday 21 Jan, before the shift
        $this->autoJob();

        $this->assertContains('2030-01-21', $this->datesOf('EMP1'));
        $this->assertSame($this->weekdays('2030-01-21', '2030-01-27'), array_values(array_filter($this->datesOf('EMP1'), fn ($d) => $d >= '2030-01-21')));
    }

    public function test_with_one_month_the_new_month_is_scheduled_on_the_first_including_the_first(): void
    {
        $this->person('EMP1');
        $this->settings(['auto_enabled' => true, 'window' => 'month']);
        $this->autoJob();                           // rest of January

        $this->at('2030-02-01 00:30:00');           // Friday 1 Feb
        $this->autoJob();

        $this->assertContains('2030-02-01', $this->datesOf('EMP1'));
        $this->assertSame('2030-02-28', collect($this->datesOf('EMP1'))->last());
    }

    public function test_with_next_month_the_month_after_joins_on_the_first(): void
    {
        $this->person('EMP1');
        $this->settings(['auto_enabled' => true, 'window' => 'next_month']);
        $this->autoJob();                           // all of February
        $this->assertSame('2030-02-28', collect($this->datesOf('EMP1'))->last());

        $this->at('2030-02-01 00:30:00');           // 1 Feb: March is now "next month"
        $this->autoJob();

        $this->assertSame($this->weekdays('2030-03-01', '2030-03-31'), array_values(array_filter($this->datesOf('EMP1'), fn ($d) => $d >= '2030-03-01')));
    }

    public function test_the_automatic_switch_never_redoes_days_run_now_already_did(): void
    {
        $this->person('EMP1');
        $this->runNow()->assertOk();
        $this->settings(['auto_enabled' => true]);

        $this->autoJob();

        $this->assertSame(1, ScheduleBatch::count());
        $this->assertSame(0, Notification::where('type', 'schedule_generated')->count());
    }

    public function test_days_with_nothing_new_to_add_still_count_as_done_so_admins_are_not_told_every_hour(): void
    {
        $this->person('EMP1');
        foreach ($this->weekdays('2030-01-14', '2030-01-18') as $i => $date) {
            ShiftSchedule::create(['id' => 'SCH00'.$i, 'employee_id' => 'EMP1', 'employee_name' => 'P', 'shift_id' => 'SHIFT004', 'date' => $date, 'status' => 'Scheduled']);
        }
        $this->settings(['auto_enabled' => true]);

        foreach (['06:00', '07:00', '08:00', '09:00'] as $hour) {
            $this->at('2030-01-14 '.$hour.':00');
            $this->autoJob();
        }

        $this->assertSame(1, ScheduleBatch::count());
        $this->assertSame(0, ScheduleBatch::first()->created_count);
        $this->assertSame(1, Notification::where('type', 'schedule_generated')->count());
    }

    public function test_an_undone_week_is_not_refilled_automatically_but_run_now_refills_it(): void
    {
        $this->person('EMP1');
        $this->settings(['auto_enabled' => true]);
        $this->autoJob();
        $this->actingAs($this->admin())->deleteJson('/api/shifts/batches/'.ScheduleBatch::first()->id)->assertOk();
        $this->assertSame(['2030-01-14'], $this->datesOf('EMP1'));                          // today stays

        $this->at('2030-01-14 07:00:00');
        $this->autoJob();
        $this->assertSame(['2030-01-14'], $this->datesOf('EMP1'));
        $this->actingAs($this->admin())->getJson('/api/shifts/rules')->assertJsonPath('data.automation.weeks.0.status', 'undone');

        $this->runNow()->assertOk()->assertJsonPath('data.totals.created', 4);
    }

    // --- a published schedule stays true when things change afterwards -----------------------------------

    public function test_approving_leave_after_publishing_takes_the_person_off_those_days(): void
    {
        $this->person('EMP1');
        $this->runNow()->assertOk();
        $this->at('2030-01-15 09:00:00');   // Tuesday: already at work today
        Attendance::create(['id' => 'ATT1', 'employee_id' => 'EMP1', 'date' => '2030-01-15', 'clock_in' => '08:00:00', 'status' => 'Present']);
        $leave = Leave::create(['id' => 'LVE1', 'employee_id' => 'EMP1', 'employee_name' => 'P', 'leave_type' => 'Sick', 'start_date' => '2030-01-14', 'end_date' => '2030-01-17',
            'reason' => 'x', 'status' => 'Pending', 'applied_date' => '2030-01-10']);
        $this->assertCount(5, $this->datesOf('EMP1'));                                  // pending leave changes nothing

        $leave->update(['status' => 'Approved']);

        // Mon (passed) and Tue (worked today) stay; Wed and Thu go; Fri was never on leave
        $this->assertSame(['2030-01-14', '2030-01-15', '2030-01-18'], $this->datesOf('EMP1'));
        $this->assertSame(1, Notification::where('employee_id', 'EMP1')->where('title', 'Schedule Updated')->count());
    }

    public function test_an_employee_set_to_inactive_loses_their_upcoming_shifts(): void
    {
        $this->person('EMP1');
        $this->runNow()->assertOk();
        $this->at('2030-01-16 09:00:00');   // Wednesday

        Employee::find('EMP1')->update(['status' => 'Inactive']);

        $this->assertSame(['2030-01-14', '2030-01-15'], $this->datesOf('EMP1'));
    }

    public function test_adding_a_holiday_after_publishing_clears_that_day_and_says_how_many(): void
    {
        $this->person('EMP1');
        $this->person('EMP2');
        $this->runNow()->assertOk();

        $this->actingAs($this->admin())->postJson('/api/shifts/rules/holidays', ['date' => '2030-01-16', 'name' => 'Surprise Holiday'])
            ->assertCreated()->assertJsonPath('data.removedShifts', 2);

        $this->assertNotContains('2030-01-16', $this->datesOf('EMP1'));
        $this->assertSame(2, Notification::where('title', 'Schedule Updated')->count());
    }

    public function test_someone_hired_after_the_week_was_scheduled_is_added_to_it_automatically_once(): void
    {
        $this->person('EMP1');
        $this->settings(['auto_enabled' => true]);
        $this->autoJob();
        $this->assertSame(1, Notification::where('type', 'schedule_generated')->count());

        $this->at('2030-01-14 07:00:00');
        $this->person('EMP2');                                                           // hired later that morning
        $this->at('2030-01-14 07:30:00');
        $this->autoJob();

        $this->assertCount(5, $this->datesOf('EMP2'));
        $this->assertCount(5, $this->datesOf('EMP1'));                                   // nobody else touched
        $this->assertSame(2, Notification::where('type', 'schedule_generated')->count());

        $this->at('2030-01-14 07:45:00');
        $this->autoJob();                                                                // nothing new: silent
        $this->assertSame(2, Notification::where('type', 'schedule_generated')->count());
        $this->assertCount(5, $this->datesOf('EMP2'));
    }

    public function test_withdrawing_an_approved_leave_puts_the_person_back_on_those_days(): void
    {
        $this->person('EMP1');
        $leave = Leave::create(['id' => 'LVE1', 'employee_id' => 'EMP1', 'employee_name' => 'P', 'leave_type' => 'Vacation', 'start_date' => '2030-01-16', 'end_date' => '2030-01-17',
            'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-10']);
        $this->runNow()->assertOk();
        $this->assertSame(['2030-01-14', '2030-01-15', '2030-01-18'], $this->datesOf('EMP1'));

        $leave->update(['status' => 'Cancelled']);

        $this->assertCount(5, $this->datesOf('EMP1'));
        $this->assertSame('restored', ScheduleBatch::orderByDesc('created_at')->orderByDesc('id')->first()->source);
        $this->assertStringContainsString('added back', Notification::where('employee_id', 'EMP1')->where('title', 'Schedule Updated')->first()->message);
    }

    public function test_a_reactivated_employee_and_a_deleted_holiday_are_scheduled_again(): void
    {
        $this->person('EMP1');
        $this->person('EMP2');
        Holiday::create(['date' => '2030-01-16', 'name' => 'Test Holiday']);
        $this->runNow()->assertOk();
        Employee::find('EMP2')->update(['status' => 'Inactive']);
        $this->assertSame([], $this->datesOf('EMP2'));

        Employee::find('EMP2')->update(['status' => 'Active']);
        $this->assertSame(['2030-01-14', '2030-01-15', '2030-01-17', '2030-01-18'], $this->datesOf('EMP2'));   // the holiday still counts

        $this->actingAs($this->admin())->deleteJson('/api/shifts/rules/holidays/'.Holiday::where('name', 'Test Holiday')->value('id'))->assertOk();
        $this->assertContains('2030-01-16', $this->datesOf('EMP1'));
        $this->assertContains('2030-01-16', $this->datesOf('EMP2'));
    }

    public function test_nothing_is_restored_into_a_week_the_admin_undid(): void
    {
        $this->person('EMP1');
        $leave = Leave::create(['id' => 'LVE1', 'employee_id' => 'EMP1', 'employee_name' => 'P', 'leave_type' => 'Vacation', 'start_date' => '2030-01-16', 'end_date' => '2030-01-16',
            'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-10']);
        $batchId = $this->runNow()->json('data.weeks.0.batchId');
        $this->actingAs($this->admin())->deleteJson('/api/shifts/batches/'.$batchId)->assertOk();

        $leave->update(['status' => 'Cancelled']);

        $this->assertSame(['2030-01-14'], $this->datesOf('EMP1'));                       // only today, which undo keeps
    }

    // --- the settings screen -------------------------------------------------------------------------------

    public function test_the_settings_show_each_week_of_the_window_and_only_admins_can_change_them(): void
    {
        $admin = $this->admin();
        $this->person('EMP1');
        $this->settings(['window' => 'month']);
        $this->at('2030-01-16 09:00:00');   // Wednesday 16 Jan, after the shift started

        $weeks = $this->actingAs($admin)->getJson('/api/shifts/rules')->assertOk()
            ->assertJsonPath('data.automation.autoEnabled', false)
            ->assertJsonPath('data.automation.defaultWorkDays', [1, 2, 3, 4, 5])
            ->json('data.automation.weeks');
        $this->assertSame(['past', 'past', 'not_scheduled', 'not_scheduled', 'not_scheduled'], array_column($weeks, 'status'));   // 1-6, 7-13 passed; 14-20 open from the 17th
        $this->assertSame(['2030-01-01', '2030-01-07', '2030-01-14', '2030-01-21', '2030-01-28'], array_column($weeks, 'from'));
        $this->assertSame('2030-01-17', $weeks[2]['openFrom']);
        $this->assertGreaterThan(10, Holiday::count());                                  // starter holidays are in

        $this->runNow()->assertOk();
        $this->actingAs($admin)->getJson('/api/shifts/rules')->assertJsonPath('data.automation.weeks.2.status', 'scheduled')
            ->assertJsonPath('data.automation.weeks.2.shifts', 2);

        $this->actingAs($admin)->postJson('/api/shifts/rules/holidays', ['date' => '2030-06-03', 'name' => 'Company Day'])->assertCreated();
        $this->actingAs($admin)->postJson('/api/shifts/rules/holidays', ['date' => '2030-06-03', 'name' => 'Again'])->assertStatus(422);
        $this->actingAs($admin)->putJson('/api/shifts/rules/coverage', ['department' => 'Support', 'minStaff' => 4])->assertOk();
        $this->actingAs($admin)->putJson('/api/shifts/rules/coverage', ['department' => 'Support', 'minStaff' => 0])->assertOk();
        $this->assertSame(0, CoverageRule::count());

        $employee = $this->otpEmployeeUser();
        $this->actingAs($employee)->getJson('/api/shifts/rules')->assertForbidden();
        $this->actingAs($employee)->putJson('/api/shifts/rules/automation', ['autoEnabled' => true, 'window' => 'week', 'defaultWorkDays' => [1]])->assertForbidden();
        $this->actingAs($employee)->postJson('/api/shifts/automation/run', ['preview' => true])->assertForbidden();
        $this->actingAs($employee)->getJson('/api/shifts/batches')->assertForbidden();
    }
}
