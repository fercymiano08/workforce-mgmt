<?php

namespace App\Services;

use App\Models\Employee;
use App\Models\LeaveType;

/**
 * Whether an employee may file a given leave type at all - gender, tenure, type active/inactive.
 * Returns human-readable reasons rather than throwing, so the same check serves both the hard
 * gate in LeaveController::store() and the "why is this option disabled" annotation the
 * employee-facing eligible-types endpoint returns.
 */
class LeaveEligibility
{
    /** @return list<string> empty when eligible */
    public static function ineligibilityReasons(Employee $employee, LeaveType $type): array
    {
        if (! $type->active) {
            return ["{$type->name} is not currently offered."];
        }

        $reasons = [];

        if ($type->applicable_gender !== 'Any' && $employee->gender !== $type->applicable_gender) {
            $reasons[] = "{$type->name} is only available to {$type->applicable_gender} employees.";
        }

        if ($type->min_tenure_months > 0) {
            $tenureMonths = $employee->hire_date
                ? $employee->hire_date->copy()->startOfDay()->diffInMonths(now()->startOfDay())
                : 0;
            if ($tenureMonths < $type->min_tenure_months) {
                $eligibleOn = $employee->hire_date?->copy()->addMonths($type->min_tenure_months)->toDateString();
                $reasons[] = "{$type->name} requires at least {$type->min_tenure_months} month(s) of tenure"
                    .($eligibleOn ? " (eligible on {$eligibleOn})." : '.');
            }
        }

        return $reasons;
    }
}
