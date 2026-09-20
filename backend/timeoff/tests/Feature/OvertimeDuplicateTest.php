<?php

namespace Tests\Feature;

use App\Models\OvertimeRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** A double click on "submit overtime" must produce one request, not two. */
class OvertimeDuplicateTest extends TestCase
{
    use RefreshDatabase;

    private function payload(string $date): array
    {
        return [
            'employeeId' => 'EMP-OTP',
            'employeeName' => 'Juan Dela Cruz',
            'date' => $date,
            'expectedHours' => 2,
            'reason' => 'Project deadline',
            'status' => 'Pending',
            'requestedDate' => '2030-02-01',
        ];
    }

    public function test_a_second_request_for_the_same_day_is_refused(): void
    {
        $employee = $this->otpEmployeeUser();

        $this->actingAs($employee)->postJson('/api/overtime', $this->payload('2030-02-15'))->assertCreated();
        $this->actingAs($employee)->postJson('/api/overtime', $this->payload('2030-02-15'))
            ->assertStatus(422)
            ->assertJsonValidationErrors('date');

        $this->assertSame(1, OvertimeRequest::count());
    }

    public function test_a_different_day_is_allowed(): void
    {
        $employee = $this->otpEmployeeUser();

        $this->actingAs($employee)->postJson('/api/overtime', $this->payload('2030-02-15'))->assertCreated();
        $this->actingAs($employee)->postJson('/api/overtime', $this->payload('2030-02-16'))->assertCreated();
    }

    public function test_a_cancelled_request_does_not_block_a_new_one(): void
    {
        $employee = $this->otpEmployeeUser();

        $id = $this->actingAs($employee)->postJson('/api/overtime', $this->payload('2030-02-15'))
            ->assertCreated()->json('data.id');
        $this->actingAs($employee)->patchJson('/api/overtime/'.$id.'/status', ['status' => 'Cancelled'])->assertOk();

        $this->actingAs($employee)->postJson('/api/overtime', $this->payload('2030-02-15'))->assertCreated();
    }

    public function test_an_employee_can_request_overtime_for_a_day_already_worked_this_week(): void
    {
        $yesterday = \Illuminate\Support\Carbon::now('Asia/Manila')->subDay()->toDateString();

        $this->actingAs($this->otpEmployeeUser())
            ->postJson('/api/overtime', $this->payload($yesterday))
            ->assertCreated();
    }

    public function test_a_request_older_than_a_week_is_refused_for_employees(): void
    {
        $old = \Illuminate\Support\Carbon::now('Asia/Manila')->subDays(10)->toDateString();

        $this->actingAs($this->otpEmployeeUser())
            ->postJson('/api/overtime', $this->payload($old))
            ->assertStatus(422)
            ->assertJsonValidationErrors('date');
    }

    public function test_an_administrator_can_record_older_overtime(): void
    {
        $old = \Illuminate\Support\Carbon::now('Asia/Manila')->subDays(10)->toDateString();

        $this->actingAs($this->adminUser())
            ->postJson('/api/overtime', $this->payload($old))
            ->assertCreated();
    }
}