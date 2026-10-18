<?php

namespace App\Console\Commands;

use App\Models\Employee;
use App\Models\LeaveType;
use App\Services\LeaveLedger;
use Illuminate\Console\Command;

/**
 * "Use it or lose it": once a year, any balance above a type's max_carryover_days is dropped via
 * an Expiration ledger entry - without this, max_carryover_days would be a config field nothing
 * ever reads.
 */
class ExpireLeaveCarryover extends Command
{
    protected $signature = 'leave:expire-carryover';

    protected $description = "Expire each employee's balance above their leave type's max_carryover_days";

    public function handle(): int
    {
        $types = LeaveType::where('active', true)
            ->where('requires_balance', true)
            ->whereNotNull('max_carryover_days')
            ->get();

        if ($types->isEmpty()) {
            $this->info('No leave types have a carryover cap configured.');

            return self::SUCCESS;
        }

        $employeeIds = Employee::where('status', '!=', 'Terminated')->pluck('id');
        $count = 0;

        foreach ($employeeIds as $employeeId) {
            foreach ($types as $type) {
                $balance = LeaveLedger::currentBalance($employeeId, $type->code);
                $excess = round($balance - $type->max_carryover_days, 2);

                if ($excess > 0) {
                    LeaveLedger::write($employeeId, $type->code, 'Expiration', -$excess, null,
                        "Carried-over balance above the {$type->max_carryover_days}-day cap for {$type->name}", 'SYSTEM');
                    $count++;
                }
            }
        }

        $this->info("Expired excess carryover for {$count} employee/type combination(s).");

        return self::SUCCESS;
    }
}
