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
}
