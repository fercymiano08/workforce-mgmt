<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\AttendanceAdjustment;
use App\Models\AuditEvent;
use App\Models\Employee;
use App\Models\Notification;
use App\Models\OvertimeRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Corrections (Time & Attendance > Corrections): the employee files with photo proof, the Workforce Admin decides and
 * makes the manual entry. Tested mostly for the refusals - a claim can recover time, never invent it.
 */
class AttendanceAdjustmentTest extends TestCase
{
    use RefreshDatabase;

    private const EMP = 'EMP-2026-0001';

    private const OTHER = 'EMP-2026-0002';

    private const DATE = '2026-09-28';   // a Monday; the shift is 08:00-17:00

    /** A real 1x1 PNG: the server checks that a "photo" really is an image. */
    private const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

    private array $accounts = [];

    private ?User $admin = null;

    protected function setUp(): void
    {
        parent::setUp();

        foreach ([[self::EMP, 'Juan', 'Dela Cruz'], [self::OTHER, 'Pedro', 'Reyes']] as [$id, $first, $last]) {
            Employee::create(['id' => $id, 'first_name' => $first, 'last_name' => $last,
                'email' => strtolower($first).'@workforcepro.com', 'department' => 'Ops', 'status' => 'Active']);
            $this->scheduleShift($id, '08:00:00', '17:00:00', self::DATE);
        }

        $this->at('09:00');
    }

    /** "Now" on the day of the shift, Manila time. */
    private function at(string $time): void
    {
        $this->travelTo(Carbon::parse(self::DATE.' '.$time.':00', 'Asia/Manila'));
    }

    private function employeeAccount(string $employeeId = self::EMP): User
    {
        if (! isset($this->accounts[$employeeId])) {
            $employee = Employee::findOrFail($employeeId);
            $this->accounts[$employeeId] = User::factory()->create([
                'employee_id' => $employeeId, 'name' => $employee->first_name.' '.$employee->last_name,
                'email' => $employee->email, 'role' => 'Employee',
            ]);
        }

        return $this->accounts[$employeeId];
    }

    private function admin(): User
    {
        return $this->admin ??= $this->adminUser();
    }

    private function photos(int $n = 1): array
    {
        return array_map(fn ($i) => ['name' => "photo-$i.png", 'dataUrl' => self::PNG, 'caption' => "Photo $i"], range(1, $n));
    }

    private function submit(array $overrides = [], ?User $as = null)
    {
        return $this->actingAs($as ?? $this->employeeAccount())->postJson('/api/attendance/adjustments', $overrides + [
            'employeeId' => self::EMP, 'date' => self::DATE, 'type' => 'worked_past_shift',
            'claimedTime' => '19:30', 'reason' => 'Stayed to finish the month-end report.', 'proof' => $this->photos(),
        ]);
    }

    private function clockedIn(string $in = '08:00:00', ?string $out = null, array $extra = []): Attendance
    {
        return Attendance::create($extra + [
            'id' => 'ATT'.random_int(1000, 9999), 'employee_id' => self::EMP, 'date' => self::DATE, 'clock_in' => $in,
            'clock_out' => $out, 'actual_clock_out' => $out, 'status' => 'Present',
        ]);
    }

    private function decide(string $id, array $body)
    {
        return $this->actingAs($this->admin())->postJson("/api/attendance/adjustments/{$id}/decide", $body);
    }

    // --- filing ------------------------------------------------------------------------------------------

    public function test_an_employee_files_a_worked_past_shift_correction_with_photos_and_the_system_does_the_arithmetic(): void
    {
        $this->clockedIn('08:00:00', '17:00:00');
        $this->at('21:30');

        $res = $this->submit(['proof' => $this->photos(3)])->assertCreated();

        $this->assertSame('Pending', $res->json('data.status'));
        $this->assertSame(3, $res->json('data.proofCount'));
        $this->assertSame(['Photo 1', 'Photo 2', 'Photo 3'], $res->json('data.proofCaptions'));
        $this->assertEquals(2.5, $res->json('data.derivedOvertime'));    // 17:00 -> 19:30
        $this->assertEquals(10.5, $res->json('data.derivedHours'));      // 08:00 -> 19:30 = 11.5h, less the 1h lunch
        $this->assertNull($res->json('data.proof'), 'the photos themselves stay out of the list payload');
        $this->assertSame(0, Attendance::first()->overtime > 0 ? 1 : 0);   // filing changes nothing on the record
        $this->assertSame('17:00:00', Attendance::first()->clock_out);
    }

    public function test_a_photo_is_required_and_must_be_a_real_image(): void
    {
        $this->clockedIn('08:00:00', '17:00:00');
        $this->at('21:30');

        $this->submit(['proof' => []])->assertStatus(422)->assertJsonValidationErrors('proof');
        $this->submit(['proof' => $this->photos(6)])->assertStatus(422)->assertJsonValidationErrors('proof');
        $this->submit(['proof' => [['dataUrl' => 'data:application/pdf;base64,JVBERi0xLjQ=', 'name' => 'x.pdf']]])
            ->assertStatus(422)->assertJsonValidationErrors('proof.0.dataUrl');
        $this->submit(['proof' => [['dataUrl' => 'data:image/png;base64,'.base64_encode('this is not an image at all'), 'name' => 'fake.png']]])
            ->assertStatus(422)->assertJsonValidationErrors('proof.0.dataUrl');

        $this->assertSame(0, AttendanceAdjustment::count());
        $this->submit(['proof' => $this->photos(5)])->assertCreated();   // five is the limit
    }

    public function test_a_kiosk_that_did_not_clock_you_in_is_worth_the_rest_of_the_day_from_the_time_given(): void
    {
        $this->at('18:00');

        $res = $this->submit(['type' => 'kiosk_clock_in', 'claimedTime' => '08:20'])->assertCreated();

        $this->assertEquals(7.67, $res->json('data.derivedHours'));   // 08:20 -> 17:00 = 8h40, less the 1h lunch
        $this->assertEquals(0, $res->json('data.derivedOvertime'));
    }

    public function test_a_kiosk_clock_in_claim_cannot_invent_time(): void
    {
        $this->at('18:00');

        $this->submit(['type' => 'kiosk_clock_in', 'claimedTime' => '06:00'])->assertStatus(422)->assertJsonValidationErrors('claimedTime');   // before the shift
        $this->submit(['type' => 'kiosk_clock_in', 'claimedTime' => '17:30'])->assertStatus(422)->assertJsonValidationErrors('claimedTime');   // after it ended

        $this->clockedIn('08:05:00');
        $this->submit(['type' => 'kiosk_clock_in', 'claimedTime' => '08:10'])->assertStatus(422)   // already clocked in
            ->assertJsonPath('errors.claimedTime.0', 'A clock-in was already recorded for that day.');
    }

    public function test_a_kiosk_clock_out_claim_is_only_for_a_missing_clock_out_within_the_shift(): void
    {
        $this->at('19:00');
        $this->submit(['type' => 'kiosk_clock_out', 'claimedTime' => '17:00'])->assertStatus(422)   // no clock-in at all
            ->assertJsonValidationErrors('claimedTime');

        $this->clockedIn('08:00:00');
        $this->submit(['type' => 'kiosk_clock_out', 'claimedTime' => '07:30'])->assertStatus(422);    // before the clock-in
        $this->submit(['type' => 'kiosk_clock_out', 'claimedTime' => '18:30'])->assertStatus(422)     // past the shift: the other kind
            ->assertJsonPath('errors.claimedTime.0', 'That is past the end of your shift. Choose "I worked past my shift" instead.');
        $ok = $this->submit(['type' => 'kiosk_clock_out', 'claimedTime' => '17:00'])->assertCreated();
        $this->assertEquals(8.0, $ok->json('data.derivedHours'));
    }

    public function test_worked_past_shift_must_really_be_past_the_shift_and_within_the_cap(): void
    {
        $this->clockedIn('08:00:00', '17:00:00');
        $this->at('23:00');

        $this->submit(['claimedTime' => '16:00'])->assertStatus(422)->assertJsonValidationErrors('claimedTime');   // not past the end
        $this->submit(['claimedTime' => '21:30'])->assertStatus(422)->assertJsonValidationErrors('claimedTime');   // 4.5h: over the 4h cap
        $this->submit(['claimedTime' => '21:00'])->assertCreated();                                                // exactly 4h
    }

    public function test_a_time_that_has_not_happened_yet_is_refused(): void
    {
        $this->clockedIn('08:00:00');   // it is 09:00
        $this->submit(['type' => 'kiosk_clock_out', 'claimedTime' => '17:00'])->assertStatus(422)
            ->assertJsonPath('errors.claimedTime.0', 'That time has not happened yet.');
    }

    public function test_the_day_must_be_recent_scheduled_and_the_persons_own(): void
    {
        $this->clockedIn('08:00:00', '17:00:00');
        $this->at('21:30');

        $this->submit(['date' => '2026-09-29'])->assertStatus(422)->assertJsonValidationErrors('date');            // has not happened yet
        $this->travelTo(Carbon::parse('2026-10-20 09:00:00', 'Asia/Manila'));
        $this->submit()->assertStatus(422)->assertJsonValidationErrors('date');                                     // older than 7 days
        $this->at('21:30');
        $this->submit(['date' => '2026-09-27'])->assertStatus(422)->assertJsonValidationErrors('claimedTime');    // no shift that day
        $this->submit(['employeeId' => self::OTHER])->assertStatus(422)->assertJsonValidationErrors('employeeId'); // somebody else's
    }

    public function test_you_cannot_stack_two_open_requests_for_the_same_problem(): void
    {
        $this->clockedIn('08:00:00', '17:00:00');
        $this->at('21:30');

        $this->submit()->assertCreated();
        $this->submit()->assertStatus(422)->assertJsonValidationErrors('type');
    }

    // --- who can see and decide -------------------------------------------------------------------------

    public function test_only_the_admin_can_list_open_preview_and_decide(): void
    {
        $this->clockedIn('08:00:00', '17:00:00');
        $this->at('21:30');
        $id = $this->submit()->json('data.id');
        $employee = $this->employeeAccount();

        $this->actingAs($employee)->getJson('/api/attendance/adjustments')->assertForbidden();
        $this->actingAs($employee)->getJson("/api/attendance/adjustments/{$id}")->assertForbidden();
        $this->actingAs($employee)->postJson("/api/attendance/adjustments/{$id}/preview", ['time' => '19:30'])->assertForbidden();
        $this->actingAs($employee)->postJson("/api/attendance/adjustments/{$id}/decide", ['decision' => 'Approved'])->assertForbidden();

        $this->actingAs($this->admin())->getJson('/api/attendance/adjustments')->assertOk()->assertJsonPath('data.0.id', $id);
    }

    public function test_an_employee_only_sees_and_can_withdraw_their_own_requests(): void
    {
        $this->clockedIn('08:00:00', '17:00:00');
        $this->at('21:30');
        $mine = $this->submit()->json('data.id');

        $this->assertCount(1, $this->actingAs($this->employeeAccount())->getJson('/api/attendance/adjustments/mine')->assertOk()->json('data'));
        $this->assertCount(0, $this->actingAs($this->employeeAccount(self::OTHER))->getJson('/api/attendance/adjustments/mine')->assertOk()->json('data'));
        $this->actingAs($this->employeeAccount(self::OTHER))->postJson("/api/attendance/adjustments/{$mine}/cancel")->assertStatus(422);

        $this->actingAs($this->employeeAccount())->postJson("/api/attendance/adjustments/{$mine}/cancel")->assertOk();
        $this->assertSame('Cancelled', AttendanceAdjustment::find($mine)->status);
    }

    public function test_the_admin_sees_the_photos_and_the_day_as_it_stands_but_the_list_does_not_carry_them(): void
    {
        $this->clockedIn('08:00:00', '17:00:00');
        $this->at('21:30');
        $id = $this->submit(['proof' => $this->photos(2)])->json('data.id');

        $list = $this->actingAs($this->admin())->getJson('/api/attendance/adjustments')->json('data.0');
        $this->assertSame(2, $list['proofCount']);
        $this->assertArrayNotHasKey('proof', $list);

        $one = $this->actingAs($this->admin())->getJson("/api/attendance/adjustments/{$id}")->assertOk()->json('data');
        $this->assertCount(2, $one['proof']);
        $this->assertStringStartsWith('data:image/png;base64,', $one['proof'][0]['dataUrl']);
        $this->assertSame('Photo 1', $one['proof'][0]['caption']);
        $this->assertSame('17:00:00', $one['currentAttendance']['clockOut']);
    }

    public function test_the_admin_can_preview_a_time_before_entering_it(): void
    {
        $this->clockedIn('08:00:00', '17:00:00');
        $this->at('21:30');
        $id = $this->submit()->json('data.id');
        $preview = fn (string $t) => $this->actingAs($this->admin())->postJson("/api/attendance/adjustments/{$id}/preview", ['time' => $t])->assertOk()->json('data');

        $this->assertEquals(['ok' => true, 'hours' => 9.0, 'overtime' => 1.0], $preview('18:00'));   // 08:00 -> 18:00, less lunch; 1h past the end
        $this->assertFalse($preview('16:00')['ok']);
    }

    // --- approving is the manual entry ------------------------------------------------------------------

    public function test_approving_worked_past_shift_edits_the_clock_out_and_pays_only_the_hours_not_already_approved(): void
    {
        // The day: the kiosk saw 21:01, but only 18:00 was counted because 1h of overtime was approved in advance
        OvertimeRequest::create(['id' => 'OT001', 'employee_id' => self::EMP, 'employee_name' => 'Juan Dela Cruz', 'date' => self::DATE,
            'expected_hours' => 1, 'approved_hours' => 1, 'status' => 'Approved', 'reason' => 'x', 'requested_date' => self::DATE]);
        $this->clockedIn('08:00:00', '18:00:00', ['actual_clock_out' => '21:01:00']);
        $this->at('22:00');
        $id = $this->submit(['claimedTime' => '21:00'])->json('data.id');

        $this->decide($id, ['decision' => 'Approved'])->assertOk()->assertJsonPath('data.status', 'Approved');

        $day = Attendance::first();
        $this->assertSame('21:00:00', $day->clock_out);
        $this->assertSame('21:00:00', $day->actual_clock_out);
        $this->assertEquals(12.0, (float) $day->total_hours);     // 08:00 -> 21:00 = 13h, less lunch
        $this->assertEquals(4.0, (float) $day->overtime);
        $this->assertStringContainsString('Manually entered via '.$id.' by John Delgado', (string) $day->notes);
        // 4h past the shift end in total: 1h was approved already, so only 3h are added - not another 4h
        $this->assertEquals(4.0, (float) OvertimeRequest::where('employee_id', self::EMP)->where('date', self::DATE)->where('status', 'Approved')->sum('approved_hours'));
        $this->assertSame('21:00', substr(AttendanceAdjustment::find($id)->final_time, 0, 5));
        $this->assertEquals(12.0, AttendanceAdjustment::find($id)->recorded_hours);
    }

    public function test_the_admin_can_correct_the_time_when_approving(): void
    {
        $this->clockedIn('08:00:00', '17:00:00');
        $this->at('21:30');
        $id = $this->submit(['claimedTime' => '20:00'])->json('data.id');

        $this->decide($id, ['decision' => 'Approved', 'time' => '19:00'])->assertOk();

        $adjustment = AttendanceAdjustment::find($id);
        $this->assertSame('20:00', substr($adjustment->claimed_time, 0, 5));   // what the employee said
        $this->assertSame('19:00', substr($adjustment->final_time, 0, 5));     // what the admin entered
        $this->assertSame('19:00:00', Attendance::first()->clock_out);
        $this->assertEquals(2.0, (float) Attendance::first()->overtime);
    }

    public function test_an_admin_entry_that_makes_no_sense_is_refused_and_changes_nothing(): void
    {
        $this->clockedIn('08:00:00', '17:00:00');
        $this->at('21:30');
        $id = $this->submit()->json('data.id');

        $this->decide($id, ['decision' => 'Approved', 'time' => '16:00'])->assertStatus(422)->assertJsonValidationErrors('time');   // not past the end
        $this->decide($id, ['decision' => 'Approved', 'time' => '22:30'])->assertStatus(422);                                        // in the future

        $this->assertSame('Pending', AttendanceAdjustment::find($id)->status);
        $this->assertSame('17:00:00', Attendance::first()->clock_out);
        $this->assertSame(0, OvertimeRequest::count());
    }

    public function test_approving_a_kiosk_that_did_not_clock_you_in_records_the_clock_in_and_the_day_that_followed(): void
    {
        $this->at('18:00');   // the day is over
        $id = $this->submit(['type' => 'kiosk_clock_in', 'claimedTime' => '08:10'])->json('data.id');

        $this->decide($id, ['decision' => 'Approved'])->assertOk();

        $day = Attendance::where('employee_id', self::EMP)->first();
        $this->assertSame('08:10:00', $day->clock_in);
        $this->assertSame('Present', $day->status);
        $this->assertSame('17:00:00', $day->clock_out);          // nobody is left to clock out: it ends at the scheduled end
        $this->assertEquals(7.83, (float) $day->total_hours);    // 08:10 -> 17:00, less the 1h lunch
        $this->assertSame('Manual entry', $day->location);
    }

    public function test_a_manual_clock_in_is_late_by_the_kiosks_own_rule_and_replaces_an_automatic_absence(): void
    {
        Attendance::create(['id' => 'ATT900', 'employee_id' => self::EMP, 'date' => self::DATE, 'status' => 'Absent', 'notes' => 'Recorded automatically.']);
        $this->at('18:00');
        $id = $this->submit(['type' => 'kiosk_clock_in', 'claimedTime' => '08:40'])->json('data.id');

        $this->decide($id, ['decision' => 'Approved'])->assertOk();

        $day = Attendance::where('employee_id', self::EMP)->sole();
        $this->assertSame('Late', $day->status);      // 08:40 is past the 15-minute grace
        $this->assertSame('08:40:00', $day->clock_in);
    }

    public function test_a_manual_clock_in_during_the_shift_leaves_the_day_open_for_a_normal_clock_out(): void
    {
        $this->at('10:00');
        $id = $this->submit(['type' => 'kiosk_clock_in', 'claimedTime' => '08:05'])->json('data.id');

        $this->decide($id, ['decision' => 'Approved'])->assertOk();

        $day = Attendance::where('employee_id', self::EMP)->first();
        $this->assertSame('08:05:00', $day->clock_in);
        $this->assertNull($day->clock_out);
    }

    public function test_approving_a_kiosk_that_did_not_clock_you_out_fills_in_the_end_of_the_day(): void
    {
        $this->clockedIn('08:00:00');
        $this->at('18:00');
        $id = $this->submit(['type' => 'kiosk_clock_out', 'claimedTime' => '17:00'])->json('data.id');

        $this->decide($id, ['decision' => 'Approved'])->assertOk();

        $day = Attendance::first();
        $this->assertSame('17:00:00', $day->clock_out);
        $this->assertEquals(8.0, (float) $day->total_hours);
        $this->assertEquals(0.0, (float) $day->overtime);
        $this->assertSame(0, OvertimeRequest::count());
    }

    // --- rejecting, and the record left behind ------------------------------------------------------------

    public function test_rejecting_needs_a_reason_changes_nothing_and_tells_the_employee(): void
    {
        $this->clockedIn('08:00:00', '17:00:00');
        $this->at('21:30');
        $id = $this->submit()->json('data.id');

        $this->decide($id, ['decision' => 'Rejected'])->assertStatus(422)->assertJsonValidationErrors('note');
        $this->decide($id, ['decision' => 'Rejected', 'note' => 'Your manager did not confirm the extra hours.'])->assertOk();

        $this->assertSame('Rejected', AttendanceAdjustment::find($id)->status);
        $this->assertSame('17:00:00', Attendance::first()->clock_out);
        $note = Notification::where('employee_id', self::EMP)->where('type', 'attendance_adjustment')->latest('timestamp')->first();
        $this->assertSame('Correction not approved', $note->title);
        $this->assertStringContainsString('Your manager did not confirm', $note->message);
        $this->assertSame('/my-attendance?tab=corrections', $note->action_url);
    }

    public function test_a_decided_request_cannot_be_decided_again_or_withdrawn(): void
    {
        $this->clockedIn('08:00:00', '17:00:00');
        $this->at('21:30');
        $id = $this->submit()->json('data.id');
        $this->decide($id, ['decision' => 'Approved'])->assertOk();

        $this->decide($id, ['decision' => 'Rejected', 'note' => 'changed my mind'])->assertStatus(422);
        $this->actingAs($this->employeeAccount())->postJson("/api/attendance/adjustments/{$id}/cancel")->assertStatus(422);
    }

    public function test_admins_and_employees_are_notified_and_every_step_is_audited(): void
    {
        $this->clockedIn('08:00:00', '17:00:00');
        $this->at('21:30');
        $this->admin();
        $id = $this->submit(['proof' => $this->photos(2)])->json('data.id');

        $adminNote = Notification::where('type', 'attendance_adjustment')->whereNull('employee_id')->first();
        $this->assertSame('/attendance?tab=corrections', $adminNote->action_url);
        $this->assertStringContainsString('2 photos', $adminNote->message);

        $this->decide($id, ['decision' => 'Approved'])->assertOk();

        $this->assertSame(['adjustment.approved', 'adjustment.requested'], AuditEvent::where('entity_id', $id)->orderBy('event')->pluck('event')->all());
        $approved = AuditEvent::where('entity_id', $id)->where('event', 'adjustment.approved')->first();
        $this->assertSame('John Delgado', $approved->actor);
        $this->assertSame('19:30', $approved->meta['finalTime']);
        $this->assertSame('17:00:00', $approved->before['clockOut']);    // the day before the entry is kept
        $this->assertSame('Correction approved', Notification::where('employee_id', self::EMP)->where('type', 'attendance_adjustment')->latest('timestamp')->first()->title);
    }

    public function test_repeat_requests_are_shown_to_the_admin_as_a_pattern(): void
    {
        $this->clockedIn('08:00:00', '17:00:00');
        $this->at('21:30');
        foreach (range(1, 4) as $i) {
            AttendanceAdjustment::create(['id' => "ADJ90$i", 'employee_id' => self::EMP, 'employee_name' => 'Juan', 'date' => '2026-09-2'.$i, 'type' => 'kiosk_clock_in',
                'reason' => 'earlier', 'status' => 'Approved', 'requested_date' => '2026-09-2'.$i, 'proof' => []]);
        }
        $this->submit()->assertCreated();

        $row = $this->actingAs($this->admin())->getJson('/api/attendance/adjustments?status=Pending')->json('data.0');
        $this->assertTrue($row['isPattern']);
        $this->assertSame(5, $row['recentClaimCount']);
    }
}
