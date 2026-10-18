<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Leave;
use App\Models\LeaveType;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * Leave-request guardrails enforced by the server:
 *   - an employee cannot file leave that starts in the past
 *   - a second request overlapping a Pending/Approved one is a duplicate (double click) and is refused
 */
class LeaveRequestRulesTest extends TestCase
{
    use RefreshDatabase;

    /** Wednesday: the tests below are about dates, and leave now costs working days, so "today" must be a weekday. */
    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2030-01-16 10:00', 'Asia/Manila'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function payload(string $start, string $end, array $extra = []): array
    {
        return array_merge([
            'employeeId' => 'EMP-OTP',
            'employeeName' => 'Juan Dela Cruz',
            'leaveType' => 'Vacation',
            'startDate' => $start,
            'endDate' => $end,
            'reason' => 'Family trip',
            'status' => 'Pending',
            'appliedDate' => '2030-01-01',
        ], $extra);
    }

    public function test_an_employee_cannot_request_leave_that_starts_yesterday(): void
    {
        $yesterday = Carbon::now('Asia/Manila')->subDay()->toDateString();
        $tomorrow = Carbon::now('Asia/Manila')->addDay()->toDateString();

        $this->actingAs($this->otpEmployeeUser())
            ->postJson('/api/leaves', $this->payload($yesterday, $tomorrow))
            ->assertStatus(422)
            ->assertJsonValidationErrors('startDate');

        $this->assertSame(0, Leave::count());
    }

    public function test_an_employee_can_request_leave_starting_today(): void
    {
        $today = Carbon::now('Asia/Manila')->toDateString();

        // Not Vacation here - Vacation needs 7 days' notice (see the test below), so "starting
        // today" is exercised through a type that has no advance-notice rule of its own.
        $this->actingAs($this->otpEmployeeUser())
            ->postJson('/api/leaves', $this->payload($today, $today, ['leaveType' => 'Special']))
            ->assertCreated();
    }

    public function test_vacation_leave_needs_7_days_notice(): void
    {
        $employee = $this->otpEmployeeUser();
        $today = Carbon::now('Asia/Manila')->toDateString();
        $sixDays = Carbon::now('Asia/Manila')->addDays(6)->toDateString();
        $sevenDays = Carbon::now('Asia/Manila')->addDays(7)->toDateString();

        $this->actingAs($employee)
            ->postJson('/api/leaves', $this->payload($today, $today))
            ->assertStatus(422)
            ->assertJsonValidationErrors('startDate');

        $this->actingAs($employee)
            ->postJson('/api/leaves', $this->payload($sixDays, $sixDays))
            ->assertStatus(422);

        $this->actingAs($employee)
            ->postJson('/api/leaves', $this->payload($sevenDays, $sevenDays))
            ->assertCreated();
    }

    public function test_sick_leave_can_be_filed_for_today_or_up_to_7_days_in_the_past(): void
    {
        $employee = $this->otpEmployeeUser();
        $today = Carbon::now('Asia/Manila')->toDateString();
        $sevenDaysAgo = Carbon::now('Asia/Manila')->subDays(7)->toDateString();
        $eightDaysAgo = Carbon::now('Asia/Manila')->subDays(8)->toDateString();

        $this->actingAs($employee)
            ->postJson('/api/leaves', $this->payload($today, $today, ['leaveType' => 'Sick']))
            ->assertCreated();

        $this->actingAs($employee)
            ->postJson('/api/leaves', $this->payload($sevenDaysAgo, $sevenDaysAgo, ['leaveType' => 'Sick']))
            ->assertCreated();

        $this->actingAs($employee)
            ->postJson('/api/leaves', $this->payload($eightDaysAgo, $eightDaysAgo, ['leaveType' => 'Sick']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('startDate');
    }

    public function test_maternity_and_paternity_are_gender_checked(): void
    {
        $employee = $this->otpEmployeeUser();
        Employee::create([
            'id' => 'EMP-OTP', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz',
            'email' => 'juan@example.com', 'gender' => 'Male', 'status' => 'Active',
        ]);
        $sevenDays = Carbon::now('Asia/Manila')->addDays(7)->toDateString();

        $this->actingAs($employee)
            ->postJson('/api/leaves', $this->payload($sevenDays, $sevenDays, ['leaveType' => 'Maternity']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('leaveType');

        // Paternity requires proof for any length (proof_threshold_days = 0) - without it this
        // would 422 on the documents field instead of exercising the gender check.
        $this->actingAs($employee)
            ->postJson('/api/leaves', $this->payload($sevenDays, $sevenDays, [
                'leaveType' => 'Paternity',
                'documents' => [['name' => 'birth-cert.pdf', 'dataUrl' => 'data:application/pdf;base64,AAAA']],
            ]))
            ->assertCreated();
    }

    public function test_vacation_and_special_are_blocked_while_on_probation(): void
    {
        $employee = $this->otpEmployeeUser();
        Employee::create([
            'id' => 'EMP-OTP', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz',
            'email' => 'juan@example.com', 'gender' => 'Male', 'status' => 'Active',
            'hire_date' => Carbon::now('Asia/Manila')->subDays(10)->toDateString(),
        ]);
        $sevenDays = Carbon::now('Asia/Manila')->addDays(7)->toDateString();
        $today = Carbon::now('Asia/Manila')->toDateString();

        $this->actingAs($employee)
            ->postJson('/api/leaves', $this->payload($sevenDays, $sevenDays, ['leaveType' => 'Vacation']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('leaveType');

        // Sick is not gated by probation - a new hire can still get sick. (acceptSplit isolates
        // that from the separate zero-ledger-balance check: this employee has no accrual history.)
        $this->actingAs($employee)
            ->postJson('/api/leaves', $this->payload($today, $today, ['leaveType' => 'Sick', 'acceptSplit' => true]))
            ->assertCreated();
    }

    public function test_an_administrator_may_still_record_a_past_leave(): void
    {
        $past = Carbon::now('Asia/Manila')->subDays(2)->toDateString();   // the Monday before

        $this->actingAs($this->adminUser())
            ->postJson('/api/leaves', $this->payload($past, $past, ['status' => 'Approved']))
            ->assertCreated();
    }

    public function test_a_double_click_creates_only_one_leave_request(): void
    {
        $employee = $this->otpEmployeeUser();
        $payload = $this->payload('2030-05-10', '2030-05-10');

        $this->actingAs($employee)->postJson('/api/leaves', $payload)->assertCreated();

        // Identical second request (the spammed submit button) is refused.
        $this->actingAs($employee)->postJson('/api/leaves', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors('startDate');

        $this->assertSame(1, Leave::count());
    }

    public function test_partially_overlapping_dates_are_also_refused(): void
    {
        $employee = $this->otpEmployeeUser();

        $this->actingAs($employee)->postJson('/api/leaves', $this->payload('2030-05-10', '2030-05-12'))->assertCreated();

        $this->actingAs($employee)->postJson('/api/leaves', $this->payload('2030-05-12', '2030-05-14'))
            ->assertStatus(422);
        $this->actingAs($employee)->postJson('/api/leaves', $this->payload('2030-05-13', '2030-05-14'))
            ->assertCreated(); // no overlap: the day after
    }

    public function test_a_cancelled_or_rejected_request_does_not_block_a_new_one(): void
    {
        $employee = $this->otpEmployeeUser();

        $id = $this->actingAs($employee)->postJson('/api/leaves', $this->payload('2030-06-10', '2030-06-10'))
            ->assertCreated()->json('data.id');

        $this->actingAs($employee)->patchJson('/api/leaves/'.$id.'/status', ['status' => 'Cancelled'])->assertOk();

        $this->actingAs($employee)->postJson('/api/leaves', $this->payload('2030-06-10', '2030-06-10'))
            ->assertCreated();
    }

    public function test_an_end_date_before_the_start_date_is_refused(): void
    {
        $this->actingAs($this->otpEmployeeUser())
            ->postJson('/api/leaves', $this->payload('2030-07-10', '2030-07-08'))
            ->assertStatus(422)
            ->assertJsonValidationErrors('endDate');
    }

    /**
     * leaveType used to be validated as a bare string, so any text could be filed and stored.
     * 'Half Day' reached the database that way: with no allowance row of its own it skipped the
     * balance check completely, and with no chart bucket it appeared on no report at all.
     */
    public function test_a_leave_type_that_is_not_one_of_the_six_is_refused(): void
    {
        $this->actingAs($this->otpEmployeeUser())
            ->postJson('/api/leaves', $this->payload('2030-07-10', '2030-07-10', ['leaveType' => 'Half Day']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('leaveType');

        $this->assertSame(0, Leave::where('leave_type', 'Half Day')->count());
    }

    public function test_free_text_is_refused_as_a_leave_type(): void
    {
        $this->actingAs($this->otpEmployeeUser())
            ->postJson('/api/leaves', $this->payload('2030-07-10', '2030-07-10', ['leaveType' => 'Not A Real Type']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('leaveType');
    }

    public function test_editing_a_request_cannot_smuggle_in_an_unknown_leave_type(): void
    {
        $existing = Leave::create([
            'id' => 'LVE900', 'employee_id' => 'EMP-OTP', 'employee_name' => 'Juan Dela Cruz',
            'leave_type' => 'Vacation', 'start_date' => '2030-07-10', 'end_date' => '2030-07-10',
            'reason' => 'Family trip', 'status' => 'Pending', 'applied_date' => '2030-01-01',
        ]);

        // Editing a leave request is an Administrator action, so this is where an unknown type
        // would otherwise be introduced into the table from.
        $this->actingAs($this->adminUser())
            ->putJson('/api/leaves/'.$existing->id, ['leaveType' => 'Half Day'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('leaveType');

        $this->assertSame('Vacation', $existing->fresh()->leave_type);
    }

    /** The canonical list is driven entirely by the admin-configurable leave_types table now. */
    public function test_every_allowed_leave_type_matches_the_active_configured_types(): void
    {
        $types = Employee::leaveTypes();

        $this->assertSame(['Vacation', 'Sick', 'Special', 'Bereavement', 'Maternity', 'Paternity', 'Unpaid'], $types);
        $this->assertSame($types, LeaveType::activeCodes());
    }

    /**
     * Balance comes entirely from the ledger now - an employee with no accrual history for a
     * balance-requiring type has zero balance, not a hidden default. A request against zero
     * balance is not blocked outright; it comes back asking for split consent (LeavePayResolver).
     */
    public function test_a_balance_requiring_type_with_no_ledger_history_offers_a_split_instead_of_blocking(): void
    {
        $user = $this->otpEmployeeUser();
        Employee::firstOrCreate(['id' => 'EMP-OTP'], [
            'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'email' => 'jdc@x.com',
            'department' => 'IT & Systems', 'status' => 'Active',
        ]);
        // No leave_balance_ledger rows exist for this employee at all - zero balance for Sick.

        $this->actingAs($user)
            ->postJson('/api/leaves', $this->payload('2030-07-10', '2030-07-10', ['leaveType' => 'Sick']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('leaveType');

        $this->assertSame(0, Leave::where('leave_type', 'Sick')->count());
    }

    /** Accepting the offered split resubmits successfully, with the shortfall recorded as unpaid. */
    public function test_accepting_the_split_consent_creates_the_request_as_partly_unpaid(): void
    {
        $user = $this->otpEmployeeUser();
        Employee::firstOrCreate(['id' => 'EMP-OTP'], [
            'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'email' => 'jdc@x.com',
            'department' => 'IT & Systems', 'status' => 'Active',
        ]);

        $response = $this->actingAs($user)
            ->postJson('/api/leaves', $this->payload('2030-07-10', '2030-07-10', [
                'leaveType' => 'Sick', 'acceptSplit' => true,
            ]))
            ->assertStatus(201);

        $response->assertJsonPath('data.payType', 'PaidWithBalance');
        $response->assertJsonPath('data.paidDays', 0);
        $response->assertJsonPath('data.unpaidDays', 1);
    }
}
