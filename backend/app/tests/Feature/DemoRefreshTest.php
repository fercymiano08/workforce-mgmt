<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\EarlyClockOut;
use App\Models\Employee;
use App\Models\Holiday;
use App\Models\Leave;
use App\Models\Notification;
use App\Models\ScheduleSetting;
use App\Models\ShiftDefinition;
use App\Models\ShiftSchedule;
use App\Models\Timesheet;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * demo:refresh rebuilds the demo employees' history through the system's own rules - so every demo record is
 * one the system itself could have produced - and never touches anyone registered through the system.
 */
class DemoRefreshTest extends TestCase
{
    use RefreshDatabase;

    private const DEMO = 'EMP20260001';     // listed in database/mock/employees.json

    private const REAL = 'EMP20264845';     // registered through the system

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2030-01-16 10:00:00', 'Asia/Manila'));   // Wednesday morning
        ScheduleSetting::current()->update(['default_work_days' => [1, 2, 3, 4, 5, 6]]);  // Mon-Sat
        Employee::create(['id' => self::DEMO, 'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'email' => 'juan@x.com', 'department' => 'Ops', 'status' => 'Active',
            'avatar' => 'https://api.dicebear.com/7.x/avataaars/svg?seed=Juan']);
        Employee::create(['id' => self::REAL, 'first_name' => 'Fercy', 'last_name' => 'Miano', 'email' => 'fercy@x.com', 'department' => 'IT', 'status' => 'Active']);
        Attendance::create(['id' => 'ATT900', 'employee_id' => self::REAL, 'date' => '2030-01-13', 'clock_in' => '09:00:00', 'status' => 'Present']);
        Holiday::create(['date' => '2030-01-01', 'name' => 'New Year']);
        Leave::create(['id' => 'LVE1', 'employee_id' => self::DEMO, 'employee_name' => 'Juan', 'leave_type' => 'Vacation', 'start_date' => '2030-01-09', 'end_date' => '2030-01-09',
            'reason' => 'x', 'status' => 'Approved', 'applied_date' => '2030-01-02']);
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_the_demo_history_follows_every_rule_real_data_follows(): void
    {
        $this->artisan('demo:refresh', ['--weeks' => 2])->assertSuccessful();

        $shifts = ShiftSchedule::where('employee_id', self::DEMO)->get()->keyBy(fn ($s) => $s->date->toDateString());
        $attendance = Attendance::where('employee_id', self::DEMO)->get();

        // Schedules: Mon-Sat only, never on the holiday or the approved leave day
        $this->assertNotEmpty($shifts);
        foreach ($shifts->keys() as $day) {
            $this->assertNotSame(7, Carbon::parse($day)->isoWeekday(), "scheduled on a Sunday: {$day}");
        }
        $this->assertArrayNotHasKey('2030-01-01', $shifts->all());
        $this->assertArrayNotHasKey('2030-01-09', $shifts->all());
        $this->assertArrayHasKey('2030-01-04', $shifts->all());   // a Saturday is a work day
        $this->assertSame('2029-12-31', $shifts->keys()->sort()->first());   // from the Monday two weeks back

        foreach ($attendance as $a) {
            $day = $a->date->toDateString();
            // Attendance only on a scheduled day
            $this->assertArrayHasKey($day, $shifts->all(), "attendance without a shift on {$day}");
            if ($a->status === 'Absent') {
                $this->assertNull($a->clock_in);

                continue;
            }
            if ($a->status === 'Early Leave') {
                // an early leaver arrived like any other day but went home before the 5pm end,
                // and the kiosk recorded why - the same record HR is alerted about
                $this->assertTrue($a->actual_clock_out < '17:00:00', "left at/after the end on {$day}");
                $this->assertNotNull(EarlyClockOut::where('attendance_id', $a->id)->first(), "no early clock-out record on {$day}");
                if ($day < '2030-01-16') {
                    $this->assertLessThan(8.0, (float) $a->total_hours, "an early day should be short on {$day}");
                }

                continue;
            }
            // Present up to 8:15, Late after - the kiosk's rule
            $this->assertSame($a->clock_in > '08:15:00' ? 'Late' : 'Present', $a->status, "wrong status on {$day}");
            if ($day < '2030-01-16') {
                // A finished day: counted like the kiosk counts it (paid from 8:00, an hour of lunch off)
                $this->assertNotNull($a->clock_out);
                $this->assertEqualsWithDelta(8.0, (float) $a->regular_hours, 0.75, "hours on {$day}");
                $this->assertEquals(1.0, (float) $a->break_hours);
            } else {
                $this->assertNull($a->clock_out);   // today: still at work
            }
        }

        // Timesheets: Monday-Sunday weeks, older week approved, last week waiting for review, this week a draft
        $sheets = Timesheet::where('employee_id', self::DEMO)->orderBy('week_start')->get();
        $this->assertSame(['2029-12-31', '2030-01-07', '2030-01-14'], $sheets->map(fn ($t) => $t->week_start->toDateString())->all());
        $this->assertSame(['Approved', 'Submitted', 'Draft'], $sheets->pluck('status')->all());
        $this->assertEqualsWithDelta(
            (float) Attendance::where('employee_id', self::DEMO)->whereBetween('date', ['2030-01-07', '2030-01-13'])->sum('total_hours'),
            (float) $sheets[1]->total_hours, 0.01
        );

        // Initials instead of a borrowed picture
        $this->assertNull(Employee::find(self::DEMO)->avatar);
    }

    public function test_notifications_about_the_replaced_records_go_but_everything_else_stays(): void
    {
        $n = fn ($id, $type, $employee, $message) => Notification::create(['id' => $id, 'type' => $type, 'title' => 't', 'message' => $message,
            'timestamp' => now(), 'read' => false, 'employee_id' => $employee, 'priority' => 'low']);
        $n('N1', 'timesheet_submitted', null, "Juan Dela Cruz's timesheet for the week of Sep 17 - Sep 23 was submitted automatically.");
        $n('N2', 'timesheet_submitted', self::DEMO, 'Your timesheet was submitted automatically.');
        $n('N3', 'attendance_absent', null, 'Juan Dela Cruz (#'.self::DEMO.") was due at 8:00 AM today but hasn't clocked in.");
        $n('N4', 'leave_approved', self::DEMO, 'Your leave was approved.');                      // still true
        $n('N5', 'timesheet_submitted', null, "Fercy Miano's timesheet was submitted.");           // a real employee
        $n('N6', 'attendance_clock_in', self::REAL, 'You clocked in at 9:00 AM.');                 // a real employee

        $this->artisan('demo:refresh')->assertSuccessful();

        // The records these notifications talked about are gone, so they go too
        foreach (['N1', 'N2', 'N3'] as $gone) {
            $this->assertFalse(Notification::where('id', $gone)->exists(), $gone.' should be gone');
        }
        // Everything that is still true stays
        foreach (['N4', 'N5', 'N6'] as $kept) {
            $this->assertTrue(Notification::where('id', $kept)->exists(), $kept.' should stay');
        }
        // The only new notifications are the HR alerts the demo's early clock-outs legitimately raise
        foreach (Notification::whereNotIn('id', ['N4', 'N5', 'N6'])->get() as $extra) {
            $this->assertSame('early_clock_out', $extra->type);
            $this->assertNull($extra->employee_id, 'an admin alert, not one about a real employee');
        }
    }

    public function test_today_is_open_by_default_and_closed_with_the_flag(): void
    {
        $this->artisan('demo:refresh')->assertSuccessful();
        $this->assertSame(0, Attendance::whereDate('date', '2030-01-16')->whereNotNull('clock_out')->count(),
            'by default today is a shift in progress, so nothing has clocked out yet');

        $this->artisan('demo:refresh', ['--close-today' => true])->assertSuccessful();
        $this->assertSame(0, Attendance::whereDate('date', '2030-01-16')->whereNotNull('clock_in')->whereNull('clock_out')->count(),
            'every demo punch today should be finished with --close-today');

        // Fercy registered through the system: his open punch is never the demo's business
        $this->assertSame('ATT900', Attendance::where('employee_id', self::REAL)->value('id'));
        $this->assertNull(Attendance::where('employee_id', self::REAL)->value('clock_out'));
    }

    public function test_the_demo_uses_the_standard_shift_even_if_another_sorts_first(): void
    {
        // A fresh seed re-creates the Morning/Night templates, whose ids sort before Standard
        ShiftDefinition::create(['id' => 'SHIFT001', 'name' => 'Morning Shift', 'start_time' => '06:00:00', 'end_time' => '14:00:00', 'color' => '#111111']);
        ShiftDefinition::create(['id' => 'SHIFT002', 'name' => 'Night Shift', 'start_time' => '22:00:00', 'end_time' => '06:00:00', 'color' => '#222222']);

        $this->artisan('demo:refresh', ['--close-today' => true])->assertSuccessful();

        $this->assertSame('SHIFT004', ShiftSchedule::where('employee_id', self::DEMO)->value('shift_id'),
            'the demo belongs on the 8-to-5 Standard Shift');
        $in = Attendance::where('employee_id', self::DEMO)->whereNotNull('clock_in')->orderBy('date')->value('clock_in');
        $this->assertGreaterThanOrEqual('07:00:00', $in, 'arrivals should be around 8am, not the 6am Morning Shift');
        $this->assertLessThan('09:00:00', $in);
    }

    public function test_people_registered_through_the_system_are_never_touched(): void
    {
        $this->artisan('demo:refresh')->assertSuccessful();

        $this->assertSame(['ATT900'], Attendance::where('employee_id', self::REAL)->pluck('id')->all());
        $this->assertSame(0, ShiftSchedule::where('employee_id', self::REAL)->count());
        $this->assertSame(0, Timesheet::where('employee_id', self::REAL)->count());
    }

    public function test_running_it_again_gives_the_same_result(): void
    {
        $this->artisan('demo:refresh', ['--weeks' => 2])->assertSuccessful();
        $first = Attendance::where('employee_id', self::DEMO)->orderBy('date')->get(['date', 'clock_in', 'status'])->toArray();

        $this->artisan('demo:refresh', ['--weeks' => 2])->assertSuccessful();
        $second = Attendance::where('employee_id', self::DEMO)->orderBy('date')->get(['date', 'clock_in', 'status'])->toArray();

        $this->assertSame($first, $second);
    }
}
