<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Leave;
use App\Services\LeaveLedger;
use App\Services\WorkingDays;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The ledger model is only automatically correct in the forward direction (approve -> deduct).
 * Un-approving, editing, or deleting an Approved PaidWithBalance request has to credit the
 * deduction back explicitly, or an admin correcting a decision leaves the employee silently,
 * permanently overcharged - this is "approve, then undo", the near-certain demo test.
 */
class LeaveApprovalLedgerTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2030-01-16 10:00', 'Asia/Manila'));
        Employee::create(['id' => 'EMP-OTP', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'email' => 'juan@example.com', 'status' => 'Active']);
        LeaveLedger::write('EMP-OTP', 'Vacation', 'Accrual', 10, null, null, 'SYSTEM');
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function pendingVacation(float $days = 3): Leave
    {
        return Leave::create([
            'id' => 'LVE-APR1', 'employee_id' => 'EMP-OTP', 'employee_name' => 'Juan Dela Cruz',
            'leave_type' => 'Vacation', 'start_date' => '2030-02-01', 'end_date' => '2030-02-'.(1 + $days - 1),
            'days' => $days, 'pay_type' => 'PaidWithBalance', 'paid_days' => $days, 'unpaid_days' => 0,
            'reason' => 'Trip', 'status' => 'Pending', 'applied_date' => '2030-01-16',
        ]);
    }

    public function test_approving_deducts_from_the_ledger(): void
    {
        $leave = $this->pendingVacation(3);

        $this->actingAs($this->adminUser())
            ->patchJson('/api/leaves/'.$leave->id.'/status', ['status' => 'Approved'])
            ->assertOk();

        $this->assertSame(7.0, LeaveLedger::currentBalance('EMP-OTP', 'Vacation'));
    }

    public function test_un_approving_credits_the_ledger_back(): void
    {
        $leave = $this->pendingVacation(3);
        $admin = $this->adminUser();

        $this->actingAs($admin)->patchJson('/api/leaves/'.$leave->id.'/status', ['status' => 'Approved'])->assertOk();
        $this->assertSame(7.0, LeaveLedger::currentBalance('EMP-OTP', 'Vacation'));

        $this->actingAs($admin)
            ->patchJson('/api/leaves/'.$leave->id.'/status', ['status' => 'Rejected', 'comments' => 'Reconsidered, denying it'])
            ->assertOk();

        $this->assertSame(10.0, LeaveLedger::currentBalance('EMP-OTP', 'Vacation'), 'The deduction must be fully credited back.');
    }

    public function test_deleting_an_approved_request_credits_the_ledger_back(): void
    {
        $leave = $this->pendingVacation(4);
        $admin = $this->adminUser();

        $this->actingAs($admin)->patchJson('/api/leaves/'.$leave->id.'/status', ['status' => 'Approved'])->assertOk();
        $this->assertSame(6.0, LeaveLedger::currentBalance('EMP-OTP', 'Vacation'));

        $this->actingAs($admin)->deleteJson('/api/leaves/'.$leave->id)->assertOk();

        $this->assertSame(10.0, LeaveLedger::currentBalance('EMP-OTP', 'Vacation'));
    }

    public function test_editing_an_approved_requests_days_re_resolves_the_ledger(): void
    {
        $leave = $this->pendingVacation(3);
        $admin = $this->adminUser();

        $this->actingAs($admin)->patchJson('/api/leaves/'.$leave->id.'/status', ['status' => 'Approved'])->assertOk();
        $this->assertSame(7.0, LeaveLedger::currentBalance('EMP-OTP', 'Vacation'));

        // Extend the same Approved request's end date - whatever the real new working-day count
        // is, the OLD 3-day deduction must be reversed and the NEW count applied, not stacked.
        $newWorkingDays = (new WorkingDays())->count('EMP-OTP', '2030-02-01', '2030-02-10')['days'];
        $this->assertNotSame(3, $newWorkingDays, 'Pick a range that actually changes the day count, or this proves nothing.');

        $this->actingAs($admin)
            ->putJson('/api/leaves/'.$leave->id, ['endDate' => '2030-02-10'])
            ->assertOk();

        $this->assertSame(10.0 - $newWorkingDays, LeaveLedger::currentBalance('EMP-OTP', 'Vacation'));
    }

    public function test_a_balance_drift_at_approval_is_flagged_not_hidden(): void
    {
        // Two requests both resolved against the same 10-day balance before either is decided -
        // approving both in sequence drives the balance negative. The second approval must still
        // go through (snapshot-trusting), but the drift has to be visible in the audit trail.
        $first = $this->pendingVacation(8);
        $second = Leave::create([
            'id' => 'LVE-APR2', 'employee_id' => 'EMP-OTP', 'employee_name' => 'Juan Dela Cruz',
            'leave_type' => 'Vacation', 'start_date' => '2030-03-01', 'end_date' => '2030-03-05',
            'days' => 5, 'pay_type' => 'PaidWithBalance', 'paid_days' => 5, 'unpaid_days' => 0,
            'reason' => 'Trip 2', 'status' => 'Pending', 'applied_date' => '2030-01-16',
        ]);

        $admin = $this->adminUser();
        $this->actingAs($admin)->patchJson('/api/leaves/'.$first->id.'/status', ['status' => 'Approved'])->assertOk();
        $this->actingAs($admin)->patchJson('/api/leaves/'.$second->id.'/status', ['status' => 'Approved'])->assertOk();

        $this->assertSame(-3.0, LeaveLedger::currentBalance('EMP-OTP', 'Vacation'));

        $flagged = \App\Models\AuditEvent::where('entity_id', $second->id)
            ->where('event', 'leave.status_changed')
            ->latest('created_at')
            ->first();
        $this->assertTrue((bool) ($flagged?->meta['balanceDriftDetected'] ?? false));
    }
}
