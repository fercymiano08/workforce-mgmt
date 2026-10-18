<?php

namespace App\Console\Commands;

use App\Models\Employee;
use App\Models\LeaveType;
use App\Services\LeaveLedger;
use Illuminate\Console\Command;

/**
 * Balance is never typed in by an admin - it accrues. Once a month, every active employee gets
 * one Accrual ledger entry per active, balance-requiring leave type with a Monthly accrual
 * policy, at that type's configured rate. This is the only place new balance days get created.
 */
class AccrueLeaveBalances extends Command
{
    protected $signature = 'leave:accrue-monthly';

    protected $description = 'Grant this month\'s leave accrual to every active employee, per leave type';

    public function handle(): int
    {
        $types = LeaveType::where('active', true)
            ->where('requires_balance', true)
            ->where('accrual_policy', 'Monthly')
            ->get();

        if ($types->isEmpty()) {
            $this->info('No leave types are configured for monthly accrual.');

            return self::SUCCESS;
        }

        $employeeIds = Employee::where('status', '!=', 'Terminated')->pluck('id');
        $count = 0;

        foreach ($employeeIds as $employeeId) {
            foreach ($types as $type) {
                if ($type->accrual_rate <= 0) {
                    continue;
                }

                LeaveLedger::write($employeeId, $type->code, 'Accrual', (float) $type->accrual_rate, null, null, 'SYSTEM');
                $count++;
            }
        }

        $this->info("Granted {$count} accrual entr(y/ies) across {$employeeIds->count()} employee(s).");

        return self::SUCCESS;
    }
}
