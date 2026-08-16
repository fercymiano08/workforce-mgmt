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
