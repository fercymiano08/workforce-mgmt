<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\Timesheet;

/**
 * Per-week pay computation for employee self-service (My Pay Record).
 *
 * The payroll service owns timesheets and carries a replica of each employee's
 * monthly salary, so pay statements are computed from approved timesheet hours
 * without touching the Attendance or Core databases:
 *
 *   hourly_rate = (monthly salary raised to a year) / (52 weeks * 40 hours)
 *   pay for the week = regular_hours * rate + approved_ot_hours * rate * 1.25
 *
 * Statutory deductions are simplified, fixed amounts + a withholding share -
 * a placeholder policy an organization would replace with its real SSS /
 * PhilHealth / Pag-IBIG / BIR tables. Figures are rounded to 2 decimals.
 */
class PayRecordService
{
    public function payRecordFor(string $employeeId): array
    {
        $employee = Employee::find($employeeId);

        $rate = $this->hourlyRate($employee);
        $statements = [];

        $timesheets = Timesheet::where('employee_id', $employeeId)
            ->orderBy('week_end', 'desc')
            ->get();

        $totals = [
            'regularPay' => 0.0,
            'otPay' => 0.0,
            'gross' => 0.0,
            'deductions' => 0.0,
            'net' => 0.0,
        ];

        foreach ($timesheets as $timesheet) {
            $regularHours = (float) $timesheet->regular_hours;
            $otHours = (float) $timesheet->approved_ot_hours;

            $regularPay = round($regularHours * $rate, 2);
            $otPay = round($otHours * $rate * (float) config('pay.ot_premium', 1.25), 2);
            $gross = round($regularPay + $otPay, 2);

            $deductions = $this->deductions($gross);
            $net = round($gross - $deductions['total'], 2);

            $totals['regularPay'] = round($totals['regularPay'] + $regularPay, 2);
            $totals['otPay'] = round($totals['otPay'] + $otPay, 2);
            $totals['gross'] = round($totals['gross'] + $gross, 2);
            $totals['deductions'] = round($totals['deductions'] + $deductions['total'], 2);
            $totals['net'] = round($totals['net'] + $net, 2);

            $statements[] = [
                'timesheetId' => $timesheet->id,
                'weekStart' => $timesheet->week_start->toDateString(),
                'weekEnd' => $timesheet->week_end->toDateString(),
                'regularHours' => $regularHours,
                'otHours' => $otHours,
                'regularPay' => $regularPay,
                'otPay' => $otPay,
                'gross' => $gross,
                'deductions' => $deductions,
                'net' => $net,
                'status' => $timesheet->status,
                'approvedBy' => $timesheet->approved_by,
                'submittedDate' => $timesheet->submitted_date?->toDateString(),
            ];
        }

        return [
            'employee' => $employee ? [
                'id' => $employee->id,
                'name' => trim($employee->first_name.' '.$employee->last_name),
                'department' => $employee->department,
                'position' => $employee->position,
            ] : null,
            'monthlySalary' => $employee ? round((float) $employee->salary, 2) : 0.0,
            'hourlyRate' => round($rate, 2),
            'otPremium' => (float) config('pay.ot_premium', 1.25),
            'currency' => 'PHP',
            'statements' => $statements,
            'totals' => $totals,
        ];
    }

    private function hourlyRate(?Employee $employee): float
    {
        $monthly = $employee ? (float) $employee->salary : 0.0;
        if ($monthly <= 0) {
            $monthly = (float) config('pay.default_monthly_salary', 18000);
        }

        return ($monthly * 12) / (52 * 40);
    }

    /** @return array<string, float> */
    private function deductions(float $gross): array
    {
        $sss = (float) config('pay.deductions.sss', 150);
        $philhealth = (float) config('pay.deductions.philhealth', 100);
        $pagibig = (float) config('pay.deductions.pagibig', 50);
        $tax = round($gross * (float) config('pay.deductions.tax_rate', 0.05), 2);

        $total = round($sss + $philhealth + $pagibig + $tax, 2);

        return [
            'sss' => $sss,
            'philhealth' => $philhealth,
            'pagibig' => $pagibig,
            'tax' => $tax,
            'total' => $total,
        ];
    }
}