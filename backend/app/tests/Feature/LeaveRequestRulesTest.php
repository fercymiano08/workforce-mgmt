<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Leave;
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

        $this->actingAs($this->otpEmployeeUser())
            ->postJson('/api/leaves', $this->payload($today, $today))
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

    /** The canonical list and the entitlement map are the same list, kept side by side. */
    public function test_every_allowed_leave_type_has_an_allowance_and_nothing_more(): void
    {
        $types = Employee::leaveTypes();
        $entitlements = Employee::defaultLeaveBalances();

        $this->assertSame(['Vacation', 'Sick', 'Emergency', 'Special', 'Funeral', 'Unpaid'], $types);
        // The allowance map is the single source of truth: no type allowed through validation is
        // missing an entitlement, and no entitlement lacks a validation entry.
        $this->assertSame([], array_diff($types, array_keys($entitlements)));
        $this->assertSame([], array_diff(array_keys($entitlements), $types));
    }

    /**
     * A type missing from an employee's stored allowance map used to skip the balance check
     * entirely, so it could be filed for unlimited days. It now falls back to the default
     * entitlement, which is what stops unlimited leave appearing to be allowed.
     */
    public function test_a_type_missing_from_a_employees_allowances_falls_back_to_the_default(): void
    {
        $user = $this->otpEmployeeUser();
        // The employee's own map omits Sick, so there is no row for it to check against.
        $employee = Employee::firstOrCreate(['id' => 'EMP-OTP'], [
            'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'email' => 'jdc@x.com',
            'department' => 'IT & Systems', 'status' => 'Active',
        ]);
        $employee->leave_balances = ['Vacation' => 20, 'Unpaid' => 30];
        $employee->save();
        $this->assertNull(
            collect($employee->fresh()->leaveBalances())->firstWhere('type', 'Sick'),
            'Sick must genuinely be absent from this employee\'s map for the fallback to be exercised.'
        );

        // Well over the default 10-day Sick entitlement, so the fallback limit must bite.
        $this->actingAs($user)
            ->postJson('/api/leaves', $this->payload('2030-07-01', '2030-08-31', ['leaveType' => 'Sick']))
            ->assertStatus(422)
            ->assertJsonValidationErrors('leaveType');

        $this->assertSame(0, Leave::where('leave_type', 'Sick')->count());
    }

    /** Inside the fallback entitlement the request is allowed, proving the fallback is a real limit. */
    public function test_the_fallback_allowance_still_permits_a_request_within_it(): void
    {
        $user = $this->otpEmployeeUser();
        $employee = Employee::firstOrCreate(['id' => 'EMP-OTP'], [
            'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'email' => 'jdc@x.com',
            'department' => 'IT & Systems', 'status' => 'Active',
        ]);
        $employee->leave_balances = ['Vacation' => 20, 'Unpaid' => 30];
        $employee->save();

        $this->actingAs($user)
            ->postJson('/api/leaves', $this->payload('2030-07-10', '2030-07-10', ['leaveType' => 'Sick']))
            ->assertStatus(201);

        $this->assertSame(1, Leave::where('leave_type', 'Sick')->count());
    }
}
