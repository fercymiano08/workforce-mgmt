<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\LeaveBalanceLedger;
use Illuminate\Support\Facades\DB;

/**
 * The single writer for leave_balance_ledger. Current balance for (employee, type) is always
 * SUM(days_delta) - never a stored running total - so every write just needs to read that sum
 * and insert the next row.
 */
class LeaveLedger
{
    public static function currentBalance(string $employeeId, string $leaveTypeCode): float
    {
        return (float) LeaveBalanceLedger::where('employee_id', $employeeId)
            ->where('leave_type_code', $leaveTypeCode)
            ->sum('days_delta');
    }

    public static function write(
        string $employeeId,
        string $leaveTypeCode,
        string $entryType,
        float $daysDelta,
        ?string $referenceId = null,
        ?string $reason = null,
        ?string $performedBy = null,
    ): LeaveBalanceLedger {
        return DB::transaction(function () use ($employeeId, $leaveTypeCode, $entryType, $daysDelta, $referenceId, $reason, $performedBy) {
            // Lock the employee row as the mutex for this balance: a double-click-approve during a
            // live demo is the one scenario that could visibly corrupt a balance in front of a panel.
            Employee::where('id', $employeeId)->lockForUpdate()->first();

            $balanceAfter = self::currentBalance($employeeId, $leaveTypeCode) + $daysDelta;

            return LeaveBalanceLedger::create([
                'employee_id' => $employeeId,
                'leave_type_code' => $leaveTypeCode,
                'entry_type' => $entryType,
                'days_delta' => $daysDelta,
                'balance_after' => $balanceAfter,
                'reference_id' => $referenceId,
                'reason' => $reason,
                'performed_by' => $performedBy,
            ]);
        });
    }
}
