<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Leave;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/** Finished days with a shift but no clock-in and no approved leave are recorded as Absent - exactly once. */
class MarkAbsentDaysTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_only_finished_unexcused_no_shows_are_marked_and_it_is_repeatable(): void
    {
        Carbon::setTestNow(Carbon::parse('2030-01-16 09:00', 'Asia/Manila'));   // Wednesday
        $this->scheduleShift('E-NOSHOW', date: '2030-01-14');   // no-show
        $this->scheduleShift('E-CAME', date: '2030-01-14');     // clocked in
        $this->scheduleShift('E-LEAVE', date: '2030-01-14');    // on approved leave
        $this->scheduleShift('E-TODAY', date: '2030-01-16');    // today: not over yet

        Attendance::create(['id' => 'ATT001', 'employee_id' => 'E-CAME', 'date' => '2030-01-14', 'clock_in' => '08:00:00', 'status' => 'Present']);
        Leave::create([
            'id' => 'LVE001', 'employee_id' => 'E-LEAVE', 'employee_name' => 'X', 'leave_type' => 'Vacation',
            'start_date' => '2030-01-13', 'end_date' => '2030-01-15', 'reason' => 'trip', 'status' => 'Approved', 'applied_date' => '2030-01-01',
        ]);

        $this->artisan('attendance:mark-absent')->assertSuccessful();
        $this->artisan('attendance:mark-absent')->assertSuccessful();   // second run changes nothing

        $absent = Attendance::where('status', 'Absent')->get();
        $this->assertCount(1, $absent);
        $this->assertSame('E-NOSHOW', $absent->first()->employee_id);
        $this->assertSame(0, Attendance::where('employee_id', 'E-TODAY')->count());
        $this->assertSame('Present', Attendance::where('employee_id', 'E-CAME')->value('status'));
    }
}
