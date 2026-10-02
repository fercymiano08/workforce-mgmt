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
use App\Services\EarlyLeaveEnforcer;
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
        // A Saturday is a work day - checked as "at least one Saturday in the window", not one hardcoded
        // date: demo:refresh also scatters fresh approved leave across this same window (see
        // rollingLeave()), and a specific Saturday can legitimately land inside one person's leave.
        $this->assertTrue(
            $shifts->keys()->contains(fn ($day) => Carbon::parse($day)->isoWeekday() === 6),
            'no Saturday was scheduled anywhere in the rebuilt window'
        );
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

    /**
     * The badge-stuck-at-35 bug, kept as a regression test.
     *
     * demo:refresh runs on every deploy and rebuilds the demo employees' history from scratch. It used
     * to apply the early clock-out policy to each punch it rebuilt, and that policy paged the admins
     * every time. Because the records are deleted and recreated each run, the alerts came back new
     * and unread - so an admin could read everything, watch the badge reach zero, and find it full
     * again after the next deploy. Rebuilding history is not news, so nothing here alerts.
     */
    public function test_a_refresh_does_not_raise_fresh_alerts_about_punches_that_already_happened(): void
    {
        $this->artisan('demo:refresh', ['--weeks' => 3])->assertSuccessful();

        $early = EarlyClockOut::where('employee_id', self::DEMO)->get();
        $this->assertNotEmpty($early, 'the demo should still contain early clock-outs to review');

        // HR still has the records to classify...
        foreach ($early as $record) {
            $this->assertSame('PENDING_REVIEW', $record->classification);
        }
        // ...but the rebuild did not page anyone about them.
        $this->assertSame(0, Notification::where('type', 'early_clock_out')->count());
        $this->assertSame(0, Notification::where('type', 'early_leave_auto_unpaid')->count());

        // Running it again changes nothing: still no alerts, and the count does not creep up.
        $before = Notification::count();
        $this->artisan('demo:refresh', ['--weeks' => 3])->assertSuccessful();
        $this->assertSame(0, Notification::where('type', 'early_clock_out')->count());
        $this->assertLessThanOrEqual($before, Notification::count());
    }

    /**
     * The same bug from the other end: applying the early clock-out policy to a record that has
     * already been alerted must not alert the admins again.
     */
    public function test_reapplying_the_policy_to_an_already_alerted_punch_is_silent(): void
    {
        $this->artisan('demo:refresh', ['--weeks' => 3])->assertSuccessful();

        $record = EarlyClockOut::where('employee_id', self::DEMO)->first();
        $this->assertNotNull($record);

        // A live punch is created un-alerted and alerts once.
        $fresh = EarlyClockOut::create([
            'id' => 'ECO999', 'attendance_id' => $record->attendance_id,
            'employee_id' => $record->employee_id, 'employee_name' => $record->employee_name,
            'date' => $record->date, 'scheduled_end_time' => $record->scheduled_end_time,
            'actual_clock_out_time' => $record->actual_clock_out_time, 'minutes_early' => 30,
            'reason_code' => 'OTHER', 'reason_note' => 'x', 'proof' => [],
            'reason_status' => 'PROVIDED', 'classification' => 'PENDING_REVIEW',
            'notification_sent' => false,
        ]);

        $enforcer = app(EarlyLeaveEnforcer::class);
        $enforcer->applyAtPunch($fresh);
        $this->assertSame(1, Notification::where('type', 'early_clock_out')->count());
        $this->assertTrue($fresh->fresh()->notification_sent);

        // Re-applying it - which a data refresh, a retry or a queued job can all do - is silent.
        $enforcer->applyAtPunch($fresh->fresh());
        $enforcer->applyAtPunch($fresh->fresh());
        $this->assertSame(1, Notification::where('type', 'early_clock_out')->count());
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

    public function test_a_real_employee_who_shares_a_demo_name_keeps_their_notice(): void
    {
        // A different person who happens to have the same name as a demo employee - which is exactly
        // what a company of any size eventually has. Their admin notices carry their own id, and that
        // id is the only thing that can tell the two apart. Deciding it on the name instead deleted
        // this person's notice every time the demo was refreshed.
        Employee::create(['id' => 'EMP20264846', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz', 'email' => 'juan2@x.com', 'department' => 'Ops', 'status' => 'Active']);
        Notification::create(['id' => 'N7', 'type' => 'early_clock_out', 'title' => 't', 'priority' => 'low', 'read' => false, 'employee_id' => null, 'timestamp' => now(),
            'message' => 'Juan Dela Cruz (EMP20264846) needs a medical certificate for the SICK early clock-out on Jan 13, 2030.']);

        $this->artisan('demo:refresh')->assertSuccessful();

        $this->assertTrue(Notification::where('id', 'N7')->exists(),
            'a real employee must not lose an admin notice just because a demo employee shares their name');
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

    public function test_close_today_fills_in_the_whole_day_even_when_run_just_after_midnight(): void
    {
        // The nightly job fires at 00:05. Nobody's arrival time has happened yet, but "close today" means
        // the day is treated as finished - the dashboard must not read zero until the next night's run.
        Carbon::setTestNow(Carbon::parse('2030-01-16 00:05:00', 'Asia/Manila'));

        $this->artisan('demo:refresh', ['--weeks' => 1, '--close-today' => true])->assertSuccessful();

        $today = Attendance::where('employee_id', self::DEMO)->where('date', '2030-01-16')->first();
        $this->assertNotNull($today, 'today has a record');
        $this->assertNotNull($today->clock_out ?? ($today->status === 'Absent' ? 'absent' : null), 'and it is a finished day');
    }
}
