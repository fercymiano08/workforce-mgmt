<?php

namespace Tests\Feature;

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
 * Automatic scheduling: work patterns, holidays, leave, coverage rules, preview before publishing,
 * undoing a run, and the weekly job that does it all by itself.
 */
class ScheduleAutomationTest extends TestCase
{
    use RefreshDatabase;

    private const MONDAY = '2030-01-14';          // the week of Mon 14 - Sun 20 Jan 2030
    private const NEXT_MONDAY = '2030-01-21';

    private ?User $admin = null;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
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

    private function generate(array $extra = [])
    {
        return $this->actingAs($this->admin())->postJson('/api/shifts/schedules/generate', $extra + [
            'startDate' => self::MONDAY, 'endDate' => '2030-01-20', 'shiftId' => 'SHIFT004',
        ]);
    }

    private function datesOf(string $employeeId): array
    {
        return ShiftSchedule::where('employee_id', $employeeId)->orderBy('date')->get()->map(fn ($s) => $s->date->toDateString())->all();
    }

    // --- the usual rules keep working ----------------------------------------------------------------

    public function test_a_normal_generation_schedules_monday_to_friday_and_skips_the_weekend(): void
    {
        $this->person('EMP1');

        $this->generate()->assertOk()->assertJsonPath('data.created', 5)->assertJsonPath('data.skippedOffDay', 2);

        $this->assertSame(['2030-01-14', '2030-01-15', '2030-01-16', '2030-01-17', '2030-01-18'], $this->datesOf('EMP1'));
    }

    public function test_including_weekends_schedules_every_day(): void
    {
        $this->person('EMP1');

        $this->generate(['skipWeekends' => false])->assertOk()->assertJsonPath('data.created', 7);
    }

    // --- work patterns ------------------------------------------------------------------------------------

    public function test_a_department_pattern_and_an_employee_pattern_change_who_works_saturdays(): void
    {
        $this->person('EMP1', 'Retail');      // Retail works Mon-Sat
        $this->person('EMP2', 'Retail');      // ...but this person has her own pattern: Tue-Sat
        $this->person('EMP3', 'Office');      // the usual Mon-Fri
        $admin = $this->admin();
        $this->actingAs($admin)->putJson('/api/shifts/rules/patterns', ['scope' => 'department', 'key' => 'Retail', 'workDays' => [1, 2, 3, 4, 5, 6]])->assertOk();
        $this->actingAs($admin)->putJson('/api/shifts/rules/patterns', ['scope' => 'employee', 'key' => 'EMP2', 'workDays' => [2, 3, 4, 5, 6]])->assertOk();

        $this->generate()->assertOk();

        $this->assertContains('2030-01-19', $this->datesOf('EMP1'));                       // Saturday, from the department pattern
        $this->assertCount(6, $this->datesOf('EMP1'));
        $this->assertNotContains('2030-01-14', $this->datesOf('EMP2'));                    // her own pattern beats the department's
        $this->assertContains('2030-01-19', $this->datesOf('EMP2'));
        $this->assertNotContains('2030-01-19', $this->datesOf('EMP3'));
        $this->assertCount(5, $this->datesOf('EMP3'));
    }

    // --- holidays, leave, existing shifts --------------------------------------------------------------

    public function test_a_holiday_is_skipped_for_everyone(): void
    {
        $this->person('EMP1');
        Holiday::create(['date' => '2030-01-16', 'name' => 'Test Holiday']);

        $this->generate()->assertOk()->assertJsonPath('data.created', 4)->assertJsonPath('data.skippedHoliday', 1)
            ->assertJsonPath('data.holidays.2030-01-16', 'Test Holiday');

        $this->assertNotContains('2030-01-16', $this->datesOf('EMP1'));
    }

    public function test_leave_and_existing_shifts_are_still_skipped_and_reported(): void
    {
        $this->person('EMP1');
        Leave::create(['id' => 'LVE1', 'employee_id' => 'EMP1', 'employee_name' => 'P', 'leave_type' => 'Sick', 'start_date' => '2030-01-15', 'end_date' => '2030-01-15',
            'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-10']);
        ShiftSchedule::create(['id' => 'SCH001', 'employee_id' => 'EMP1', 'employee_name' => 'P', 'shift_id' => 'SHIFT004', 'date' => '2030-01-17', 'status' => 'Scheduled']);

        $this->generate()->assertOk()->assertJsonPath('data.created', 3)->assertJsonPath('data.skippedOnLeave', 1)->assertJsonPath('data.skippedExisting', 1);
    }

    // --- coverage rules --------------------------------------------------------------------------------------

    public function test_a_day_below_the_minimum_coverage_is_flagged_and_the_admin_is_told(): void
    {
        $this->person('EMP1', 'Support');
        $this->person('EMP2', 'Support');
        $this->person('EMP3', 'Support');
        CoverageRule::create(['department' => 'Support', 'min_staff' => 3]);
        Leave::create(['id' => 'LVE1', 'employee_id' => 'EMP2', 'employee_name' => 'P', 'leave_type' => 'Sick', 'start_date' => '2030-01-16', 'end_date' => '2030-01-16',
            'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-10']);

        $response = $this->generate()->assertOk();

        $short = collect($response->json('data.coverageShortages'));
        $this->assertCount(1, $short);
        $this->assertSame(['date' => '2030-01-16', 'department' => 'Support', 'have' => 2, 'need' => 3], $short->first());
        $this->assertSame(1, Notification::where('title', 'Below Minimum Coverage')->count());
    }

    // --- preview, then publish, then undo --------------------------------------------------------------------

    public function test_a_preview_creates_nothing(): void
    {
        $this->person('EMP1');

        $this->generate(['preview' => true])->assertOk()->assertJsonPath('data.preview', true)->assertJsonPath('data.created', 5);

        $this->assertSame(0, ShiftSchedule::count());
        $this->assertSame(0, ScheduleBatch::count());
    }

    public function test_publishing_records_a_batch_and_undoing_it_removes_only_shifts_that_have_not_happened(): void
    {
        $this->person('EMP1');
        Carbon::setTestNow(Carbon::parse('2030-01-16 09:00:00', 'Asia/Manila'));       // Wednesday
        $batchId = $this->generate()->assertOk()->json('data.batchId');
        $this->assertNotNull($batchId);
        $this->assertSame(5, ShiftSchedule::count());

        $this->actingAs($this->admin())->deleteJson('/api/shifts/batches/'.$batchId)
            ->assertOk()->assertJsonPath('data.status', 'Undone')->assertJsonPath('data.summary.removed', 3)->assertJsonPath('data.summary.kept', 2);

        $this->assertSame(['2030-01-14', '2030-01-15'], $this->datesOf('EMP1'));       // Mon and Tue already passed: kept
        $this->actingAs($this->admin())->deleteJson('/api/shifts/batches/'.$batchId)->assertStatus(409);
    }

    // --- the automatic weekly job ------------------------------------------------------------------------------

    private function switchOn(int $day = 5, int $hour = 17): void
    {
        ScheduleSetting::current()->update(['auto_enabled' => true, 'run_day' => $day, 'run_hour' => $hour, 'weeks_ahead' => 1]);
    }

    public function test_the_job_does_nothing_while_switched_off_or_before_the_chosen_time(): void
    {
        $this->person('EMP1');
        Carbon::setTestNow(Carbon::parse('2030-01-18 18:00:00', 'Asia/Manila'));       // Friday evening

        $this->artisan('schedules:auto-generate')->assertSuccessful();
        $this->assertSame(0, ShiftSchedule::count());                                   // off

        $this->switchOn(5, 17);
        Carbon::setTestNow(Carbon::parse('2030-01-18 16:59:00', 'Asia/Manila'));
        $this->artisan('schedules:auto-generate')->assertSuccessful();
        $this->assertSame(0, ShiftSchedule::count());                                   // too early

        Carbon::setTestNow(Carbon::parse('2030-01-17 18:00:00', 'Asia/Manila'));       // Thursday
        $this->artisan('schedules:auto-generate')->assertSuccessful();
        $this->assertSame(0, ShiftSchedule::count());                                   // wrong day
    }

    public function test_on_the_chosen_day_and_hour_the_job_schedules_next_week_once_and_tells_the_admins(): void
    {
        $this->person('EMP1');
        $this->person('EMP2', 'Office', 'Inactive');                                    // inactive people are not scheduled
        Holiday::create(['date' => '2030-01-23', 'name' => 'Test Holiday']);
        $this->switchOn(5, 17);
        Carbon::setTestNow(Carbon::parse('2030-01-18 17:00:00', 'Asia/Manila'));       // Friday at the chosen hour

        $this->artisan('schedules:auto-generate')->assertSuccessful();

        $this->assertSame(['2030-01-21', '2030-01-22', '2030-01-24', '2030-01-25'], $this->datesOf('EMP1'));   // next Mon-Fri less the holiday
        $this->assertSame([], $this->datesOf('EMP2'));
        $batch = ScheduleBatch::first();
        $this->assertSame('automatic', $batch->source);
        $this->assertSame('System', $batch->created_by);
        $this->assertSame(1, Notification::where('type', 'schedule_generated')->count());
        $this->assertSame(1, Notification::where('type', 'shift_assigned')->where('employee_id', 'EMP1')->count());

        Carbon::setTestNow(Carbon::parse('2030-01-18 18:00:00', 'Asia/Manila'));       // an hour later: already done
        $this->artisan('schedules:auto-generate')->assertSuccessful();
        $this->assertSame(1, ScheduleBatch::count());
        $this->assertSame(4, ShiftSchedule::count());
    }

    public function test_an_undone_automatic_run_is_not_recreated_by_the_next_hourly_check(): void
    {
        $this->person('EMP1');
        $this->switchOn(5, 17);
        Carbon::setTestNow(Carbon::parse('2030-01-18 17:00:00', 'Asia/Manila'));
        $this->artisan('schedules:auto-generate')->assertSuccessful();
        $this->actingAs($this->admin())->deleteJson('/api/shifts/batches/'.ScheduleBatch::first()->id)->assertOk();

        Carbon::setTestNow(Carbon::parse('2030-01-18 19:00:00', 'Asia/Manila'));
        $this->artisan('schedules:auto-generate')->assertSuccessful();

        $this->assertSame(0, ShiftSchedule::count());
    }

    // --- the rules screen --------------------------------------------------------------------------------------

    public function test_the_rules_can_be_read_and_edited_by_the_admin_only(): void
    {
        $admin = $this->admin();
        $this->actingAs($admin)->getJson('/api/shifts/rules')->assertOk()->assertJsonPath('data.automation.autoEnabled', false)
            ->assertJsonPath('data.automation.defaultWorkDays', [1, 2, 3, 4, 5]);
        $this->assertGreaterThan(10, Holiday::count());                                  // starter holidays are in

        $this->actingAs($admin)->putJson('/api/shifts/rules/automation', ['autoEnabled' => true, 'runDay' => 4, 'runHour' => 15, 'weeksAhead' => 2, 'defaultWorkDays' => [1, 2, 3, 4, 5, 6]])
            ->assertOk()->assertJsonPath('data.runDay', 4)->assertJsonPath('data.weeksAhead', 2);
        $this->actingAs($admin)->postJson('/api/shifts/rules/holidays', ['date' => '2030-06-01', 'name' => 'Company Day'])->assertCreated();
        $this->actingAs($admin)->postJson('/api/shifts/rules/holidays', ['date' => '2030-06-01', 'name' => 'Again'])->assertStatus(422);
        $this->actingAs($admin)->putJson('/api/shifts/rules/coverage', ['department' => 'Support', 'minStaff' => 4])->assertOk();
        $this->actingAs($admin)->putJson('/api/shifts/rules/coverage', ['department' => 'Support', 'minStaff' => 0])->assertOk();
        $this->assertSame(0, CoverageRule::count());

        $employee = $this->otpEmployeeUser();
        $this->actingAs($employee)->getJson('/api/shifts/rules')->assertForbidden();
        $this->actingAs($employee)->putJson('/api/shifts/rules/automation', ['autoEnabled' => true, 'runDay' => 4, 'runHour' => 15, 'weeksAhead' => 1, 'defaultWorkDays' => [1]])->assertForbidden();
        $this->actingAs($employee)->getJson('/api/shifts/batches')->assertForbidden();
    }
}
