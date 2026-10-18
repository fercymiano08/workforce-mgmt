<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * One opening Accrual ledger row per (employee, balance-requiring type), using the CURRENT
 * computed "remaining" value under the old live-recompute model as the opening balance - not an
 * opening-total-plus-replayed-usage-history approach, which would be sensitive to known-dirty
 * historical rows (null `days`, prior leave_type renames via earlier migrations). Computed here
 * directly from raw employees/leaves columns rather than via Employee::leaveBalances(), because
 * that method is being rewritten in this same change to read FROM the ledger this seeds.
 */
return new class extends Migration
{
    private const REASON = 'Opening balance migrated from legacy computed-usage model';

    public function up(): void
    {
        $defaults = [
            'Vacation' => 20, 'Sick' => 10, 'Special' => 5,
            'Bereavement' => 5, 'Maternity' => 105, 'Paternity' => 7, 'Unpaid' => 30,
        ];
        $balanceRequiringTypes = ['Vacation', 'Sick', 'Special'];

        $employees = DB::table('employees')->select('id', 'leave_balances')->get();

        $usedByEmployeeType = DB::table('leaves')
            ->where('status', 'Approved')
            ->whereIn('leave_type', $balanceRequiringTypes)
            ->select('employee_id', 'leave_type', 'days', 'start_date', 'end_date')
            ->get()
            ->groupBy(fn ($row) => $row->employee_id.'|'.$row->leave_type);

        $now = now();
        $rows = [];

        foreach ($employees as $employee) {
            $stored = $employee->leave_balances ? json_decode($employee->leave_balances, true) : null;
            $totals = $defaults;
            if (is_array($stored) && $stored !== [] && ! array_is_list($stored)) {
                $totals = $stored;
            } elseif (is_array($stored) && $stored !== []) {
                // Legacy API-shape fallback: a list of {type,total,...} objects instead of a map.
                $map = [];
                foreach ($stored as $entry) {
                    if (is_array($entry) && isset($entry['type'])) {
                        $map[$entry['type']] = (float) ($entry['total'] ?? 0);
                    }
                }
                if ($map !== []) {
                    $totals = $map;
                }
            }

            foreach ($balanceRequiringTypes as $type) {
                $total = (float) ($totals[$type] ?? $defaults[$type]);
                $usedRows = $usedByEmployeeType->get($employee->id.'|'.$type, collect());
                $used = (float) $usedRows->sum(function ($row) {
                    if ($row->days !== null) {
                        return (float) $row->days;
                    }
                    $start = new \DateTime($row->start_date);
                    $end = new \DateTime($row->end_date);

                    return (float) ($start->diff($end)->days + 1);
                });
                $remaining = max($total - $used, 0.0);

                $rows[] = [
                    'employee_id' => $employee->id,
                    'leave_type_code' => $type,
                    'entry_type' => 'Accrual',
                    'days_delta' => $remaining,
                    'balance_after' => $remaining,
                    'reference_id' => null,
                    'reason' => self::REASON,
                    'performed_by' => 'SYSTEM',
                    'created_at' => $now,
                ];
            }
        }

        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('leave_balance_ledger')->insert($chunk);
        }
    }

    public function down(): void
    {
        DB::table('leave_balance_ledger')->where('performed_by', 'SYSTEM')->where('reason', self::REASON)->delete();
    }
};
