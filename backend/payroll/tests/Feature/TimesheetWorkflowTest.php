<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Notification;
use App\Models\Timesheet;
use App\Models\User;
use App\Services\TimesheetGenerationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The timesheet workflow: Draft -> Submitted -> Approved / Rejected, a finished week only, reasons
 * for rejecting and reopening, locked hours once submitted, automatic submission, and payroll export.
 */
class TimesheetWorkflowTest extends TestCase
{
    use RefreshDatabase;

    private const WEEK_START = '2030-01-14';   // a Monday; the week ends Sunday 2030-01-20

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function at(string $manilaTime): void
    {
        Carbon::setTestNow(Carbon::parse($manilaTime, 'Asia/Manila'));
    }

    private function worker(): User
    {
        Employee::create([
            'id' => 'EMP-OTP', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz',
            'email' => 'employee@workforcepro.com', 'department' => 'IT & Systems', 'salary' => 20800,
        ]);

        return $this->otpEmployeeUser();
    }

    private function workDay(string $date, float $hours = 8, ?string $clockOut = '17:00:00'): void
    {
        Attendance::create([
            'id' => 'ATT-'.$date, 'employee_id' => 'EMP-OTP', 'date' => $date, 'clock_in' => '08:00:00',
            'clock_out' => $clockOut, 'status' => 'Present', 'regular_hours' => $hours, 'overtime' => 0,
            'total_hours' => $hours, 'break_hours' => 1,
        ]);
    }

    private function sheet(): Timesheet
    {
        return app(TimesheetGenerationService::class)->syncForEmployee('EMP-OTP', self::WEEK_START);
    }

    private function submitted(User $employee): Timesheet
    {
        $sheet = $this->sheet();
        $this->at('2030-01-21 09:00:00');
        $this->actingAs($employee)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Submitted'])->assertOk();

        return $sheet->fresh();
    }

    // --- submitting ------------------------------------------------------------------------------------

    public function test_a_week_that_is_not_over_cannot_be_submitted(): void
    {
        $employee = $this->worker();
        $this->workDay('2030-01-14');
        $sheet = $this->sheet();
        $this->at('2030-01-18 17:00:00');   // Friday, week still running

        $this->actingAs($employee)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Submitted'])
            ->assertStatus(422)->assertJsonPath('message', fn ($m) => str_contains($m, 'not over yet'));
        $this->assertSame('Draft', $sheet->fresh()->status);
    }

    public function test_the_employee_submits_a_finished_week_and_it_is_recorded(): void
    {
        $employee = $this->worker();
        $this->workDay('2030-01-14');

        $sheet = $this->submitted($employee)->fresh();

        $this->assertSame('Submitted', $sheet->status);
        $this->assertNotNull($sheet->submitted_at);
        $this->assertSame('Juan Dela Cruz', $sheet->submitted_by);
        $this->assertFalse($sheet->auto_submitted);
        $this->assertSame('submitted', $sheet->history[0]['event']);
        $this->assertSame(1, Notification::where('type', 'timesheet_submitted')->count());
    }

    public function test_only_a_draft_or_returned_timesheet_can_be_submitted_and_only_by_its_owner(): void
    {
        $employee = $this->worker();
        $this->workDay('2030-01-14');
        $sheet = $this->submitted($employee);

        $this->actingAs($employee)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Submitted'])->assertStatus(422);
        $this->actingAs($this->adminUser())->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Submitted'])->assertForbidden();
    }

    // --- reviewing -------------------------------------------------------------------------------------

    public function test_only_a_submitted_timesheet_can_be_approved_and_approval_is_recorded(): void
    {
        $employee = $this->worker();
        $this->workDay('2030-01-14');
        $sheet = $this->sheet();
        $this->at('2030-01-21 09:00:00');
        $admin = $this->adminUser();

        $this->actingAs($admin)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Approved'])->assertStatus(422);   // still a draft

        $this->actingAs($employee)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Submitted'])->assertOk();
        $this->actingAs($admin)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Approved'])
            ->assertOk()->assertJsonPath('data.status', 'Approved')->assertJsonPath('data.approvedBy', 'John Delgado');

        $sheet = $sheet->fresh();
        $this->assertNotNull($sheet->reviewed_at);
        $this->assertSame(['submitted', 'approved'], array_column($sheet->history, 'event'));
    }

    public function test_a_rejection_needs_a_reason_and_the_employee_can_fix_and_resubmit(): void
    {
        $employee = $this->worker();
        $this->workDay('2030-01-14');
        $sheet = $this->submitted($employee);
        $admin = $this->adminUser();

        $this->actingAs($admin)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Rejected'])->assertStatus(422);
        $this->actingAs($admin)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Rejected', 'reason' => 'Tuesday is missing a clock-out.'])
            ->assertOk()->assertJsonPath('data.status', 'Rejected')->assertJsonPath('data.statusReason', 'Tuesday is missing a clock-out.');

        $this->assertStringContainsString('missing a clock-out', Notification::where('type', 'timesheet_rejected')->first()->message);

        $this->actingAs($employee)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Submitted'])
            ->assertOk()->assertJsonPath('data.status', 'Submitted');
    }

    public function test_an_employee_can_never_approve_reject_or_reopen(): void
    {
        $employee = $this->worker();
        $this->workDay('2030-01-14');
        $sheet = $this->submitted($employee);

        foreach ([['status' => 'Approved'], ['status' => 'Rejected', 'reason' => 'no way'], ['status' => 'Draft', 'reason' => 'no way']] as $body) {
            $this->actingAs($employee)->patchJson('/api/timesheets/'.$sheet->id.'/status', $body)->assertForbidden();
        }
    }

    // --- locking and reopening ---------------------------------------------------------------------------

    public function test_hours_are_frozen_once_submitted_and_a_later_change_only_raises_a_flag(): void
    {
        $employee = $this->worker();
        $this->workDay('2030-01-14');
        $sheet = $this->submitted($employee);
        $this->assertEquals(8.0, $sheet->total_hours);

        $this->workDay('2030-01-15');                 // attendance changes after submission
        $again = app(TimesheetGenerationService::class)->syncForEmployee('EMP-OTP', self::WEEK_START);

        $this->assertEquals(8.0, $again->total_hours);                 // the reviewed hours did not move
        $this->assertTrue($again->needs_refresh);
        $flags = collect($this->actingAs($this->adminUser())->getJson('/api/timesheets')->assertOk()->json('data'))->firstWhere('id', $sheet->id)['flags'];
        $this->assertContains('changed_after_submit', $flags);
    }

    public function test_reopening_needs_a_reason_brings_the_hours_up_to_date_and_is_refused_after_payroll(): void
    {
        $employee = $this->worker();
        $this->workDay('2030-01-14');
        $sheet = $this->submitted($employee);
        $admin = $this->adminUser();
        $this->workDay('2030-01-15');
        app(TimesheetGenerationService::class)->syncForEmployee('EMP-OTP', self::WEEK_START);

        $this->actingAs($admin)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Draft'])->assertStatus(422);
        $this->actingAs($admin)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Draft', 'reason' => 'Attendance was corrected.'])
            ->assertOk()->assertJsonPath('data.status', 'Draft')->assertJsonPath('data.totalHours', 16);
        $this->assertFalse($sheet->fresh()->needs_refresh);

        // approved and sent to payroll: no more reopening
        $this->actingAs($employee)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Submitted'])->assertOk();
        $this->actingAs($admin)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Approved'])->assertOk();
        $this->actingAs($admin)->postJson('/api/timesheets/payroll-export')->assertOk();
        $this->actingAs($admin)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Draft', 'reason' => 'Too late now'])->assertStatus(409);
    }

    public function test_hours_cannot_be_typed_in_and_submitted_timesheets_cannot_be_deleted(): void
    {
        $employee = $this->worker();
        $this->workDay('2030-01-14');
        $sheet = $this->submitted($employee);
        $admin = $this->adminUser();

        $this->actingAs($admin)->putJson('/api/timesheets/'.$sheet->id, ['totalHours' => 99, 'notes' => 'Checked with payroll'])->assertOk();
        $this->assertEquals(8.0, $sheet->fresh()->total_hours);
        $this->assertSame('Checked with payroll', $sheet->fresh()->notes);

        $this->actingAs($admin)->deleteJson('/api/timesheets/'.$sheet->id)->assertStatus(409);
    }

    // --- payroll ---------------------------------------------------------------------------------------

    public function test_payroll_export_sends_approved_timesheets_once(): void
    {
        $employee = $this->worker();
        $this->workDay('2030-01-14');
        $sheet = $this->submitted($employee);
        $admin = $this->adminUser();

        $this->actingAs($admin)->postJson('/api/timesheets/payroll-export')->assertStatus(422);   // nothing approved yet

        $this->actingAs($admin)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Approved'])->assertOk();
        $this->actingAs($admin)->postJson('/api/timesheets/payroll-export')
            ->assertOk()->assertJsonCount(1, 'data')->assertJsonPath('data.0.id', $sheet->id);

        $this->assertNotNull($sheet->fresh()->exported_at);
        $this->actingAs($admin)->postJson('/api/timesheets/payroll-export')->assertStatus(422);   // never paid twice
    }

    // --- automatic behaviour -----------------------------------------------------------------------------

    public function test_an_unsubmitted_week_is_submitted_automatically_at_the_deadline(): void
    {
        $this->worker();
        $this->workDay('2030-01-14');
        $sheet = $this->sheet();

        $this->at('2030-01-21 11:59:00');             // Monday, just before noon
        $this->artisan('timesheets:auto-submit')->assertSuccessful();
        $this->assertSame('Draft', $sheet->fresh()->status);

        $this->at('2030-01-21 12:00:00');
        $this->artisan('timesheets:auto-submit')->assertSuccessful();

        $sheet = $sheet->fresh();
        $this->assertSame('Submitted', $sheet->status);
        $this->assertTrue($sheet->auto_submitted);
        $this->assertSame('auto_submitted', $sheet->history[0]['event']);
        $this->assertSame(1, Notification::where('type', 'timesheet_submitted')->where('employee_id', 'EMP-OTP')->count());
    }

    public function test_a_week_with_no_hours_is_not_submitted_automatically(): void
    {
        $this->worker();
        Timesheet::create([
            'id' => 'TS777', 'employee_id' => 'EMP-OTP', 'employee_name' => 'Juan', 'department' => 'IT & Systems',
            'date' => '2030-01-20', 'week_start' => self::WEEK_START, 'week_end' => '2030-01-20',
            'regular_hours' => 0, 'overtime_hours' => 0, 'break_hours' => 0, 'total_hours' => 0, 'status' => 'Draft',
        ]);

        $this->at('2030-01-22 09:00:00');
        $this->artisan('timesheets:auto-submit')->assertSuccessful();

        $this->assertSame('Draft', Timesheet::find('TS777')->status);
    }

    public function test_the_employee_is_reminded_once_and_the_admins_are_nudged_about_old_submissions(): void
    {
        $employee = $this->worker();
        $this->workDay('2030-01-14');
        $sheet = $this->sheet();

        $this->at('2030-01-21 08:00:00');
        $this->artisan('timesheets:remind')->assertSuccessful();
        $this->artisan('timesheets:remind')->assertSuccessful();
        $this->assertSame(1, Notification::where('type', 'timesheet_reminder')->where('employee_id', 'EMP-OTP')->count());

        $this->actingAs($employee)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Submitted'])->assertOk();
        $this->at('2030-01-24 09:00:00');             // three days later, nobody reviewed it
        $this->artisan('timesheets:remind')->assertSuccessful();
        $this->artisan('timesheets:remind')->assertSuccessful();

        $this->assertSame(1, Notification::where('type', 'timesheet_reminder')->whereNull('employee_id')->count());
    }

    // --- what the admin should look at ---------------------------------------------------------------------

    public function test_the_admin_sees_warnings_for_zero_hours_missing_clock_outs_and_unpaid_overtime(): void
    {
        $this->worker();
        $this->workDay('2030-01-14', 8, null);        // clocked in, never clocked out
        $this->workDay('2030-01-15');
        Attendance::where('id', 'ATT-2030-01-15')->update(['overtime' => 2, 'total_hours' => 10]);
        $sheet = $this->sheet();
        $this->at('2030-01-21 09:00:00');

        $flags = collect($this->actingAs($this->adminUser())->getJson('/api/timesheets')->assertOk()->json('data'))->firstWhere('id', $sheet->id)['flags'];

        $this->assertContains('missing_clock_out', $flags);
        $this->assertContains('unpaid_overtime', $flags);
        $this->assertNotContains('zero_hours', $flags);
    }

    // --- catching up after the attendance copy refreshes ---------------------------------------------------

    public function test_the_scheduled_refresh_brings_an_editable_timesheet_up_to_date_and_only_flags_a_locked_one(): void
    {
        $employee = $this->worker();
        $this->workDay('2030-01-14');
        $sheet = $this->sheet();                              // Draft, 8 h
        $this->at('2030-01-21 09:00:00');

        $this->workDay('2030-01-15');                         // the attendance copy learns about a second day
        $this->artisan('timesheets:refresh')->assertSuccessful();
        $this->assertEquals(16.0, $sheet->fresh()->total_hours);              // a draft follows attendance

        $this->actingAs($employee)->patchJson('/api/timesheets/'.$sheet->id.'/status', ['status' => 'Submitted'])->assertOk();
        $this->workDay('2030-01-16');                         // ...and then a third day, after it was submitted
        $this->artisan('timesheets:refresh')->assertSuccessful();

        $sheet = $sheet->fresh();
        $this->assertEquals(16.0, $sheet->total_hours);                        // the submitted hours did not move
        $this->assertTrue($sheet->needs_refresh);                              // but the admin is warned
    }

    public function test_the_flag_clears_by_itself_when_attendance_returns_to_what_was_submitted(): void
    {
        $employee = $this->worker();
        $this->workDay('2030-01-14');
        $sheet = $this->submitted($employee);

        Attendance::where('id', 'ATT-2030-01-14')->update(['total_hours' => 6, 'regular_hours' => 6]);
        $this->artisan('timesheets:refresh')->assertSuccessful();
        $this->assertTrue($sheet->fresh()->needs_refresh);

        Attendance::where('id', 'ATT-2030-01-14')->update(['total_hours' => 8, 'regular_hours' => 8]);   // the approval is restored
        $this->artisan('timesheets:refresh')->assertSuccessful();
        $this->assertFalse($sheet->fresh()->needs_refresh);
    }
}
