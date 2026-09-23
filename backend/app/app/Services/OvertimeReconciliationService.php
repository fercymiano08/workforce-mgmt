<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\OvertimeRequest;
use App\Models\Timesheet;

class OvertimeReconciliationService
{
    /**
     * The approved overtime request (if any) covering the given employee/date.
     * A date can only carry one approval, so the most recent wins.
     */
    public function approvedRequestFor(string $employeeId, string $date): ?OvertimeRequest
    {
        return OvertimeRequest::where('employee_id', $employeeId)
            ->where('date', $date)
            ->where('status', 'Approved')
            ->orderBy('id', 'desc')
            ->first();
    }

    /**
     * Compare the actual OT clocked on an attendance record against the
     * approved OT request (if any) for the same employee/date.
     *
     * Returns null when no overtime was worked (nothing to reconcile).
     * status: authorized | unauthorized | overrun
     */
    public function forAttendance(Attendance $attendance): ?array
    {
        $actual = (float) ($attendance->overtime ?? 0);
        if ($actual <= 0) {
            return null;
        }

        $request = $this->approvedRequestFor($attendance->employee_id, $attendance->date->toDateString());

        if (! $request) {
            return [
                'status' => 'unauthorized',
                'approvedHours' => 0.0,
                'actualHours' => $actual,
                'requestId' => null,
            ];
        }

        $approved = (float) ($request->approved_hours ?? $request->expected_hours ?? 0);

        return [
            'status' => $actual > $approved ? 'overrun' : 'authorized',
            'approvedHours' => $approved,
            'actualHours' => $actual,
            'requestId' => $request->id,
        ];
    }

    /**
     * Compare what was approved for an overtime request against what was
     * actually clocked on the requested date.
     *
     * status: ok | overrun | underrun
     */
    public function forRequest(OvertimeRequest $request): ?array
    {
        if ($request->status !== 'Approved') {
            return null;
        }

        $approved = (float) ($request->approved_hours ?? $request->expected_hours ?? 0);
        $actual = (float) Attendance::where('employee_id', $request->employee_id)
            ->where('date', $request->date->toDateString())
            ->sum('overtime');

        return [
            'status' => $actual > $approved ? 'overrun' : ($actual < $approved ? 'underrun' : 'ok'),
            'approvedHours' => $approved,
            'actualHours' => $actual,
        ];
    }

    /**
     * Overtime that is actually PAYABLE for a set of attendance rows: for each
     * day, the smaller of the overtime really worked and the overtime approved
     * for that day. So working past 5 PM with no approval earns nothing extra,
     * and an approval that was not used (left on time) is not paid either.
     *
     * @param  \Illuminate\Support\Collection<int, Attendance>  $attendance
     */
    public function payableHoursForAttendance(string $employeeId, $attendance): float
    {
        $total = 0.0;

        foreach ($attendance->groupBy(fn (Attendance $a) => $a->date->toDateString()) as $date => $rows) {
            $worked = (float) $rows->sum('overtime');
            if ($worked <= 0) {
                continue;
            }

            $approved = (float) OvertimeRequest::where('employee_id', $employeeId)
                ->whereDate('date', $date)
                ->where('status', 'Approved')
                ->get()
                ->sum(fn (OvertimeRequest $r) => (float) ($r->approved_hours ?? $r->expected_hours ?? 0));

            $total += min($worked, $approved);
        }

        return round($total, 2);
    }

    /**
     * Sum of authorized (approved) OT hours falling inside a week, used when
     * regenerating a weekly timesheet so it can show approved vs actual OT.
     */
    public function approvedHoursInWeek(string $employeeId, string $weekStart, string $weekEnd): float
    {
        $sum = OvertimeRequest::where('employee_id', $employeeId)
            ->where('status', 'Approved')
            ->whereBetween('date', [$weekStart, $weekEnd])
            ->get()
            ->sum(fn (OvertimeRequest $r) => (float) ($r->approved_hours ?? $r->expected_hours ?? 0));

        return round($sum, 2);
    }
}
