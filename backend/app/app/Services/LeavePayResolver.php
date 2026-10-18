<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\LeaveType;

/**
 * Resolves whether an approved leave is paid, partly paid, or unpaid - automatically, from the
 * leave type's config. Nobody (not the admin, not the employee) chooses pay_type per request;
 * the only human decision anywhere in this chain is the employee accepting or declining a
 * paid/unpaid split when balance falls short (acceptSplit). Pure calculation, no writes - the
 * actual ledger deduction happens only at approval time (LeaveController::updateStatus()).
 */
class LeavePayResolver
{
    /**
     * @return array{payType: string, paidDays: float, unpaidDays: float, requiresConsent: bool, balanceBefore: ?float, shortfall: float}
     */
    public static function resolve(Employee $employee, LeaveType $type, float $workingDays, bool $acceptSplit): array
    {
        if (! $type->requires_balance) {
            $isUnpaid = $type->pay_type === 'Unpaid';

            return [
                'payType' => $type->pay_type,
                'paidDays' => $isUnpaid ? 0.0 : $workingDays,
                'unpaidDays' => $isUnpaid ? $workingDays : 0.0,
                'requiresConsent' => false,
                'balanceBefore' => null,
                'shortfall' => 0.0,
            ];
        }

        $balanceBefore = LeaveLedger::currentBalance($employee->id, $type->code);

        if ($balanceBefore >= $workingDays) {
            return [
                'payType' => 'PaidWithBalance',
                'paidDays' => $workingDays,
                'unpaidDays' => 0.0,
                'requiresConsent' => false,
                'balanceBefore' => $balanceBefore,
                'shortfall' => 0.0,
            ];
        }

        $shortfall = round($workingDays - max($balanceBefore, 0), 2);

        if (! $acceptSplit) {
            return [
                'payType' => 'PaidWithBalance',
                'paidDays' => 0.0,
                'unpaidDays' => 0.0,
                'requiresConsent' => true,
                'balanceBefore' => $balanceBefore,
                'shortfall' => $shortfall,
            ];
        }

        return [
            'payType' => 'PaidWithBalance',
            'paidDays' => max($balanceBefore, 0),
            'unpaidDays' => $shortfall,
            'requiresConsent' => false,
            'balanceBefore' => $balanceBefore,
            'shortfall' => $shortfall,
        ];
    }
}
