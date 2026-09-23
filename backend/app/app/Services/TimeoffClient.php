<?php

namespace App\Services;

use App\Models\Leave;
use App\Models\OvertimeRequest;

/**
 * Leave/overtime actions triggered from outside their own controllers
 * (the early clock-out auto-draft, and AI Decision Support's resolve actions).
 */
class TimeoffClient
{
    public static function resolveLeave(string $id, string $status, ?string $approvedBy): void
    {
        $record = Leave::find($id);
        if ($record) {
            $record->update(['status' => $status, 'approved_by' => $approvedBy]);
        }
    }

    public static function resolveOvertime(string $id, string $status, ?string $approvedBy): void
    {
        $record = OvertimeRequest::find($id);
        if ($record) {
            $record->update([
                'status' => $status,
                'approved_by' => $approvedBy,
                'approved_hours' => $status === 'Approved' ? $record->expected_hours : null,
                'approved_at' => $status === 'Approved' ? now() : null,
            ]);
        }
    }

    public static function autoDraftSickLeave(
        string $employeeId,
        string $employeeName,
        string $date,
        ?int $minutesEarly = null,
        ?string $earlyOutId = null,
    ): ?array {
        $existing = Leave::where('employee_id', $employeeId)
            ->where('leave_type', 'Sick')
            ->where('start_date', $date)
            ->where('status', 'Pending')
            ->where('reason', 'like', '[Auto-generated from early clock-out]%')
            ->first();

        if ($existing) {
            return $existing->toApiArray();
        }

        $max = Leave::where('id', 'like', 'LVE%')->max('id');
        $num = $max ? ((int) substr($max, 3)) + 1 : 1;

        $minutes = (int) ($minutesEarly ?? 0);
        $note = (string) ($earlyOutId ?? '');

        $leave = Leave::create([
            'id' => 'LVE'.str_pad((string) $num, 3, '0', STR_PAD_LEFT),
            'employee_id' => $employeeId,
            'employee_name' => $employeeName,
            'leave_type' => 'Sick',
            'start_date' => $date,
            'end_date' => $date,
            'status' => 'Pending',
            'applied_date' => now()->toDateString(),
            'approved_by' => null,
            'comments' => null,
            'documents' => [],
            'reason' => '[Auto-generated from early clock-out] '.($minutes > 0 ? "Clock-out {$minutes} min early on {$date}." : "Early clock-out on {$date}.")
                .($note !== '' ? " Early clock-out record: {$note}." : ''),
        ]);

        return $leave->toApiArray();
    }
}
