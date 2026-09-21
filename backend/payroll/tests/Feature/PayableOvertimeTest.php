<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\OvertimeRequest;
use App\Models\Timesheet;
use App\Services\TimesheetGenerationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Overtime is paid only for time that was BOTH approved AND actually worked, per day:
 *   payable = min(worked past 5 PM, approved for that day)
 */
class PayableOvertimeTest extends TestCase
{
    use RefreshDatabase;

    private const MONDAY = '2030-01-14';

    private function employee(): Employee
    {
        return Employee::create([
            'id' => 'EMP20260001',
            'first_name' => 'Juan',
            'last_name' => 'Dela Cruz',
            'email' => 'juan@workforcepro.com',
            'department' => 'IT & Systems',
            'salary' => 20800,   // rate = 20800*12 / (52*40) = 120/h
        ]);
    }

    private function workDay(string $date, float $overtime): void
    {
        Attendance::create([
            'id' => 'ATT-'.$date,
            'employee_id' => 'EMP20260001',
            'date' => $date,
            'clock_in' => '08:00:00',
            'clock_out' => '17:00:00',
            'status' => 'Present',
            'regular_hours' => 8,
            'overtime' => $overtime,
            'total_hours' => 8 + $overtime,
            'break_hours' => 1,
        ]);
    }

    private function approveOvertime(string $date, float $hours, string $status = 'Approved'): void
    {
        OvertimeRequest::create([
            'id' => 'OT-'.$date.'-'.$status,
            'employee_id' => 'EMP20260001',
            'employee_name' => 'Juan Dela Cruz',
            'date' => $date,
            'requested_date' => $date,
            'expected_hours' => $hours,
            'approved_hours' => $status === 'Approved' ? $hours : null,
            'reason' => 'Deadline',
            'status' => $status,
        ]);
    }

    private function week(): Timesheet
    {
        return app(TimesheetGenerationService::class)->syncForEmployee('EMP20260001', self::MONDAY);
    }

    public function test_working_late_without_an_approved_request_is_not_paid(): void
    {
        $this->employee();
        $this->workDay(self::MONDAY, 2);

        $sheet = $this->week();

        $this->assertEquals(2.0, $sheet->overtime_hours);      // recorded honestly
        $this->assertEquals(0.0, $sheet->approved_ot_hours);
        $this->assertEquals(0.0, $sheet->paid_ot_hours);       // ...but not paid
    }

    public function test_an_approved_request_that_was_not_used_is_not_paid(): void
    {
        $this->employee();
        $this->workDay(self::MONDAY, 0);                 // left on time
        $this->approveOvertime(self::MONDAY, 2);         // approved 2h

        $sheet = $this->week();

        $this->assertEquals(2.0, $sheet->approved_ot_hours);
        $this->assertEquals(0.0, $sheet->paid_ot_hours);
    }

    public function test_paid_overtime_is_the_smaller_of_worked_and_approved(): void
    {
        $this->employee();
        $this->workDay(self::MONDAY, 3);                 // worked 3h
        $this->approveOvertime(self::MONDAY, 2);         // approved 2h

        $this->assertEquals(2.0, $this->week()->paid_ot_hours);   // capped at approval
    }

    public function test_worked_less_than_approved_pays_only_what_was_worked(): void
    {
        $this->employee();
        $this->workDay(self::MONDAY, 1);
        $this->approveOvertime(self::MONDAY, 2);

        $this->assertEquals(1.0, $this->week()->paid_ot_hours);
    }

    public function test_days_are_judged_separately(): void
    {
        $this->employee();
        $this->workDay('2030-01-14', 2);   // approved
        $this->workDay('2030-01-15', 2);   // NOT approved
        $this->approveOvertime('2030-01-14', 2);

        $sheet = $this->week();

        $this->assertEquals(4.0, $sheet->overtime_hours);
        $this->assertEquals(2.0, $sheet->paid_ot_hours);
    }

    public function test_a_rejected_request_pays_nothing(): void
    {
        $this->employee();
        $this->workDay(self::MONDAY, 2);
        $this->approveOvertime(self::MONDAY, 2, 'Rejected');

        $this->assertEquals(0.0, $this->week()->paid_ot_hours);
    }
}
