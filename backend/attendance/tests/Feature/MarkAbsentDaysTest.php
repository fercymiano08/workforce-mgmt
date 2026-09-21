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

    public function test_correcting_an_absent_day_makes_the_server_count_the_hours(): void
    {
        Carbon::setTestNow(Carbon::parse('2030-01-16 09:00', 'Asia/Manila'));
        $this->scheduleShift('E-FORGOT', date: '2030-01-14');
        $this->artisan('attendance:mark-absent')->assertSuccessful();
        $id = Attendance::where('employee_id', 'E-FORGOT')->value('id');

        // the administrator supplies the real times (and even wrong hours): the server ignores the hours it was sent
        $this->actingAs($this->adminUser())->putJson('/api/attendance/'.$id, [
            'status' => 'Present', 'clockIn' => '08:00:00', 'clockOut' => '17:03:00', 'totalHours' => 99, 'overtime' => 50,
        ])->assertOk();

        $row = Attendance::find($id);
        $this->assertSame('17:00:00', $row->clock_out);          // counted only to the end of the shift
        $this->assertSame('17:03:00', $row->actual_clock_out);   // the real punch is kept
        $this->assertEquals(8.0, (float) $row->total_hours);     // 08:00-17:00 less the 1 h lunch
        $this->assertEquals(0.0, (float) $row->overtime);
    }
}

