<?php

namespace Tests\Feature;

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
        $past = Carbon::now('Asia/Manila')->subDays(3)->toDateString();

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
}
