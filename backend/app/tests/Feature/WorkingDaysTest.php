<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\Holiday;
use App\Services\WorkingDays;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** The count time-off charges a leave request: pattern days minus holidays. */
class WorkingDaysTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_weekend_is_not_counted_and_a_holiday_is_skipped(): void
    {
        Employee::create(['id' => 'E1', 'first_name' => 'A', 'last_name' => 'B', 'email' => 'a@x.com', 'department' => 'Ops', 'position' => 'Staff', 'status' => 'Active']);
        Holiday::create(['date' => '2030-01-16', 'name' => 'Founders Day']);   // a Wednesday

        // Mon 14 .. Sun 20 Jan 2030
        $r = app(WorkingDays::class)->count('E1', '2030-01-14', '2030-01-20');

        $this->assertSame(4, $r['days']);
        $this->assertSame(7, $r['calendarDays']);
        $this->assertSame(['2030-01-16' => 'Founders Day'], $r['holidays']);
    }
}
