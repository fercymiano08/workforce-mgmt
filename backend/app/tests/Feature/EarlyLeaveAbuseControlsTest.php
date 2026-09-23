<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\EarlyClockOut;
use App\Models\Employee;
use App\Models\Notification;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * An early clock-out reason is a CLAIM the kiosk cannot verify, so the system
 * verifies what it can: a free allowance per rolling window (the next one is
 * unexcused automatically), proof for SICK within a deadline, an alert to the
 * admins for every early clock-out, and detection of a spreading excuse.
 */
class EarlyLeaveAbuseControlsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->withHeaders($this->kioskDeviceHeaders());
    }

    /** Jump to a moment (kiosk time) and re-issue the device token - it only lives 24 hours. */
    private function at(string $moment): void
    {
        $this->travelTo(Carbon::parse($moment, 'Asia/Manila'));
        $this->withHeaders($this->kioskDeviceHeaders());
    }

    private function employee(string $id): Employee
    {
        return Employee::create([
            'id' => $id,
            'first_name' => 'Emp '.$id,
            'last_name' => 'Test',
            'email' => $id.'@workforcepro.com',
            'department' => 'IT & Systems',
        ]);
    }

    /** Clock in at 08:00 on the given day and clock out at 12:00 with the given reason. */
    private function leaveEarly(string $employeeId, string $date, ?string $reason = 'OTHER'): EarlyClockOut
    {
        $this->at($date.' 08:00:00');
        $this->scheduleShift($employeeId, '08:00:00', '17:00:00', $date);

        $this->postJson('/api/kiosk/attendance', [
            'employeeId' => $employeeId, 'date' => $date, 'clockIn' => '08:00:00', 'status' => 'Present',
        ])->assertCreated();

        $id = Attendance::where('employee_id', $employeeId)->whereDate('date', $date)->first()->id;

        $this->putJson('/api/kiosk/attendance/'.$id, array_filter([
            'clockOut' => '12:00:00', 'regularHours' => 4, 'overtime' => 0, 'totalHours' => 4, 'breakHours' => 0,
            'reasonCode' => $reason,
        ]))->assertOk();

        return EarlyClockOut::where('attendance_id', $id)->firstOrFail();
    }

    private function employeeUser(string $employeeId): User
    {
        return User::factory()->create([
            'employee_id' => $employeeId, 'name' => 'Emp '.$employeeId, 'email' => $employeeId.'@u.test',
            'role' => 'Employee', 'role_label' => 'Employee', 'avatar_seed' => 'x',
        ]);
    }

    public function test_the_free_allowance_is_two_and_the_third_is_unexcused_automatically(): void
    {
        $this->employee('EMP1');

        $first = $this->leaveEarly('EMP1', '2026-09-21');
        $second = $this->leaveEarly('EMP1', '2026-09-22');
        $third = $this->leaveEarly('EMP1', '2026-09-23');

        $this->assertSame('PENDING_REVIEW', $first->fresh()->classification);
        $this->assertSame('PENDING_REVIEW', $second->fresh()->classification);
        $this->assertSame('UNPAID', $third->fresh()->classification);
        $this->assertSame('Policy (automatic)', $third->fresh()->classified_by);
        $this->assertStringContainsString('#3', $third->fresh()->classification_note);
    }

    public function test_early_clock_outs_outside_the_window_do_not_count(): void
    {
        $this->employee('EMP1');

        $this->leaveEarly('EMP1', '2026-07-01');
        $this->leaveEarly('EMP1', '2026-07-02');
        $recent = $this->leaveEarly('EMP1', '2026-09-21');   // > 30 days after the others

        $this->assertSame('PENDING_REVIEW', $recent->fresh()->classification);
    }

    public function test_the_kiosk_can_show_how_many_free_early_outs_are_used(): void
    {
        $this->employee('EMP1');
        $this->leaveEarly('EMP1', '2026-09-21');
        $this->leaveEarly('EMP1', '2026-09-22');

        $this->at('2026-09-23 08:00:00');
        $this->scheduleShift('EMP1', '08:00:00', '17:00:00', '2026-09-23');

        $this->getJson('/api/kiosk/schedule/EMP1?date=2026-09-23')
            ->assertOk()
            ->assertJsonPath('data.earlyLeave.used', 2)
            ->assertJsonPath('data.earlyLeave.allowed', 2)
            ->assertJsonPath('data.earlyLeave.certificateHours', 48);
    }

    public function test_every_early_clock_out_alerts_the_admins_with_the_running_count(): void
    {
        $this->employee('EMP1');

        $this->leaveEarly('EMP1', '2026-09-21', 'OTHER');   // 'Other' used to be silent

        $alert = Notification::where('type', 'early_clock_out')->first();
        $this->assertNotNull($alert, 'admins must be told about every early clock-out');
        $this->assertStringContainsString('#1', $alert->message);
        $this->assertStringContainsString('free allowance of 2', $alert->message);
    }

    public function test_an_over_allowance_early_out_alerts_with_high_priority(): void
    {
        $this->employee('EMP1');
        $this->leaveEarly('EMP1', '2026-09-21');
        $this->leaveEarly('EMP1', '2026-09-22');
        $this->leaveEarly('EMP1', '2026-09-23');

        $this->assertSame(1, Notification::where('type', 'early_clock_out')->where('priority', 'high')->count());
    }

    public function test_a_sick_claim_needs_a_certificate_within_48_hours(): void
    {
        $this->employee('EMP1');

        $record = $this->leaveEarly('EMP1', '2026-09-21', 'SICK');

        $this->assertSame('CERTIFICATE_REQUIRED', $record->fresh()->reason_status);
        $this->assertEqualsWithDelta(
            now()->addHours(48)->timestamp,
            $record->fresh()->proof_due_at->timestamp,
            5
        );
        $this->assertSame(1, Notification::where('type', 'early_leave_certificate_required')->where('employee_id', 'EMP1')->count());
    }

    public function test_a_sick_claim_without_proof_becomes_unexcused_after_the_deadline(): void
    {
        $this->employee('EMP1');
        $record = $this->leaveEarly('EMP1', '2026-09-21', 'SICK');

        $this->travelTo(now()->addHours(47));
        $this->artisan('early-outs:expire-certificates')->assertSuccessful();
        $this->assertSame('PENDING_REVIEW', $record->fresh()->classification, 'still within 48 hours');

        $this->travelTo(now()->addHours(2));   // 49 hours after the punch
        $this->artisan('early-outs:expire-certificates')->assertSuccessful();

        $this->assertSame('UNPAID', $record->fresh()->classification);
        $this->assertSame('CERTIFICATE_OVERDUE', $record->fresh()->reason_status);
        $this->assertSame(1, Notification::where('type', 'early_leave_auto_unpaid')->where('employee_id', 'EMP1')->count());
    }

    public function test_a_sick_claim_with_proof_is_not_expired(): void
    {
        $this->employee('EMP1');
        $record = $this->leaveEarly('EMP1', '2026-09-21', 'SICK');

        $this->actingAs($this->employeeUser('EMP1'))
            ->putJson('/api/attendance/early-outs/'.$record->id.'/reason', [
                'proof' => [['name' => 'certificate.jpg', 'dataUrl' => 'data:image/jpeg;base64,AAAA']],
            ])->assertOk()
            ->assertJsonPath('data.reasonStatus', 'PROOF_SUBMITTED');

        $this->assertSame(1, Notification::where('type', 'early_leave_proof_submitted')->count());

        $this->travelTo(now()->addHours(60));
        $this->artisan('early-outs:expire-certificates')->assertSuccessful();

        $this->assertSame('PENDING_REVIEW', $record->fresh()->classification);
    }

    public function test_hr_cannot_excuse_a_sick_claim_without_proof_unless_overriding(): void
    {
        $this->employee('EMP1');
        $record = $this->leaveEarly('EMP1', '2026-09-21', 'SICK');
        $admin = $this->adminUser();

        $this->actingAs($admin)
            ->postJson('/api/attendance/early-outs/'.$record->id.'/classify', ['classification' => 'EXCUSED_SICK'])
            ->assertStatus(422)
            ->assertJsonPath('data.reason', 'proof_required');

        $this->assertSame('PENDING_REVIEW', $record->fresh()->classification);

        // With proof on file the same decision goes through.
        $record->update(['proof' => [['name' => 'certificate.jpg', 'dataUrl' => 'data:image/jpeg;base64,AAAA']]]);
        $this->actingAs($admin)
            ->postJson('/api/attendance/early-outs/'.$record->id.'/classify', ['classification' => 'EXCUSED_SICK'])
            ->assertOk()
            ->assertJsonPath('data.classification', 'EXCUSED_SICK');
    }

    public function test_approved_leave_is_not_accepted_as_a_reason_at_the_kiosk(): void
    {
        $this->employee('EMP1');
        $this->at('2026-09-21 08:00:00');
        $this->scheduleShift('EMP1', '08:00:00', '17:00:00', '2026-09-21');
        $this->postJson('/api/kiosk/attendance', [
            'employeeId' => 'EMP1', 'date' => '2026-09-21', 'clockIn' => '08:00:00', 'status' => 'Present',
        ])->assertCreated();
        $id = Attendance::first()->id;

        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '12:00:00', 'reasonCode' => 'APPROVED_LEAVE'])
            ->assertStatus(422)
            ->assertJsonPath('data.reason', 'reason_not_verifiable');

        $this->assertSame(0, EarlyClockOut::count());
    }

    public function test_three_people_leaving_early_with_the_same_reason_the_same_day_is_flagged(): void
    {
        foreach (['EMP1', 'EMP2', 'EMP3'] as $id) {
            $this->employee($id);
        }

        $this->leaveEarly('EMP1', '2026-09-21', 'FAMILY_EMERGENCY');
        $this->leaveEarly('EMP2', '2026-09-21', 'FAMILY_EMERGENCY');
        $this->assertSame(0, Notification::where('type', 'early_clock_out_pattern')->count(), 'two is not yet a pattern');

        $this->leaveEarly('EMP3', '2026-09-21', 'FAMILY_EMERGENCY');
        $this->assertSame(1, Notification::where('type', 'early_clock_out_pattern')->count());
    }

    public function test_different_reasons_on_the_same_day_are_not_a_pattern(): void
    {
        foreach (['EMP1', 'EMP2', 'EMP3'] as $id) {
            $this->employee($id);
        }

        $this->leaveEarly('EMP1', '2026-09-21', 'SICK');
        $this->leaveEarly('EMP2', '2026-09-21', 'FAMILY_EMERGENCY');
        $this->leaveEarly('EMP3', '2026-09-21', 'PERSONAL_EMERGENCY');

        $this->assertSame(0, Notification::where('type', 'early_clock_out_pattern')->count());
    }

    public function test_the_kiosk_response_tells_the_employee_the_consequence(): void
    {
        $this->employee('EMP1');
        $this->leaveEarly('EMP1', '2026-09-21');
        $this->leaveEarly('EMP1', '2026-09-22');

        $this->at('2026-09-23 08:00:00');
        $this->scheduleShift('EMP1', '08:00:00', '17:00:00', '2026-09-23');
        $this->postJson('/api/kiosk/attendance', [
            'employeeId' => 'EMP1', 'date' => '2026-09-23', 'clockIn' => '08:00:00', 'status' => 'Present',
        ])->assertCreated();
        $id = Attendance::whereDate('date', '2026-09-23')->first()->id;

        $this->putJson('/api/kiosk/attendance/'.$id, ['clockOut' => '12:00:00', 'reasonCode' => 'SICK'])
            ->assertOk()
            ->assertJsonPath('earlyLeave.autoUnpaid', true)
            ->assertJsonPath('earlyLeave.position', 3)
            ->assertJsonPath('earlyLeave.proofRequired', true)
            ->assertJsonPath('earlyLeave.certificateHours', 48);
    }
}
