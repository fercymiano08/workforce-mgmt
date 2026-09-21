<?php

namespace Tests\Feature;

use App\Models\Leave;
use App\Services\SchedulingClient;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/** Leave costs WORKING days: a weekend inside the range is not charged to the balance. */
class LeaveWorkingDaysTest extends TestCase
{
    use RefreshDatabase;

    private function nextWeekday(int $isoDay): Carbon
    {
        return Carbon::now('Asia/Manila')->next($isoDay % 7)->startOfDay();
    }

    public function test_friday_to_monday_costs_two_days_not_four(): void
    {
        $friday = $this->nextWeekday(5);
        $monday = $friday->copy()->addDays(3);

        $this->actingAs($this->otpEmployeeUser())
            ->postJson('/api/leaves', [
                'employeeId' => 'EMP-OTP', 'employeeName' => 'Juan Dela Cruz', 'leaveType' => 'Vacation',
                'startDate' => $friday->toDateString(), 'endDate' => $monday->toDateString(),
                'reason' => 'Long weekend', 'status' => 'Pending', 'appliedDate' => '2030-01-01',
            ])
            ->assertCreated()
            ->assertJsonPath('data.days', 2);

        $this->assertEquals(2, Leave::first()->days);
    }

    public function test_a_range_with_only_a_weekend_is_refused(): void
    {
        $saturday = $this->nextWeekday(6);

        $this->actingAs($this->otpEmployeeUser())
            ->postJson('/api/leaves', [
                'employeeId' => 'EMP-OTP', 'employeeName' => 'Juan Dela Cruz', 'leaveType' => 'Vacation',
                'startDate' => $saturday->toDateString(), 'endDate' => $saturday->copy()->addDay()->toDateString(),
                'reason' => 'Weekend', 'status' => 'Pending', 'appliedDate' => '2030-01-01',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('startDate');
    }

    public function test_the_preview_endpoint_reports_the_count(): void
    {
        $friday = $this->nextWeekday(5);

        $this->actingAs($this->otpEmployeeUser())
            ->getJson('/api/leaves/working-days?employeeId=EMP-OTP&startDate='.$friday->toDateString().'&endDate='.$friday->copy()->addDays(3)->toDateString())
            ->assertOk()
            ->assertJsonPath('data.days', 2)
            ->assertJsonPath('data.calendarDays', 4);
    }

    public function test_weekday_fallback_counts_monday_to_friday(): void
    {
        $r = SchedulingClient::weekdaysOnly('2030-01-07', '2030-01-13'); // Mon..Sun
        $this->assertSame(5, $r['days']);
    }

    public function test_an_administrator_editing_the_dates_recounts_and_refuses_a_weekend_only_range(): void
    {
        $friday = $this->nextWeekday(5);
        $monday = $friday->copy()->addDays(3);
        $leave = Leave::create([
            'id' => 'LVE900', 'employee_id' => 'EMP-OTP', 'employee_name' => 'Juan', 'leave_type' => 'Vacation',
            'start_date' => $friday->toDateString(), 'end_date' => $friday->toDateString(), 'days' => 1,
            'reason' => 'x', 'status' => 'Pending', 'applied_date' => '2030-01-01',
        ]);
        $admin = $this->adminUser();

        $this->actingAs($admin)->putJson('/api/leaves/LVE900', ['endDate' => $monday->toDateString()])
            ->assertOk()->assertJsonPath('data.days', 2);

        $saturday = $this->nextWeekday(6);
        $this->actingAs($admin)->putJson('/api/leaves/LVE900', ['startDate' => $saturday->toDateString(), 'endDate' => $saturday->copy()->addDay()->toDateString()])
            ->assertStatus(422)->assertJsonValidationErrors('startDate');

        $this->actingAs($admin)->putJson('/api/leaves/LVE900', ['startDate' => $monday->toDateString(), 'endDate' => $friday->toDateString()])
            ->assertStatus(422);
        $this->assertEquals(2, $leave->fresh()->days);
    }
}

