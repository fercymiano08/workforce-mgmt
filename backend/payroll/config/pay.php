<?php

/*
|--------------------------------------------------------------------------
| Pay computation policy
|--------------------------------------------------------------------------
| Placeholder statutory policy for self-service pay statements. Swappable by
| the organization without touching code.
|
|   hourly_rate = (monthly_salary * 12) / (52 * 40)
|   weekly pay   = regular_hours * hourly_rate + approved_ot_hours * hourly_rate * ot_premium
|   deductions   = fixed SSS / PhilHealth / Pag-IBIG + tax_rate share of gross
*/

return [
    'default_monthly_salary' => env('DEFAULT_MONTHLY_SALARY', 18000),
    'ot_premium' => (float) env('OT_PREMIUM', 1.25),
    'deductions' => [
        'sss' => (float) env('DEDUCTION_SSS', 150),
        'philhealth' => (float) env('DEDUCTION_PHILHEALTH', 100),
        'pagibig' => (float) env('DEDUCTION_PAGIBIG', 50),
        'tax_rate' => (float) env('DEDUCTION_TAX_RATE', 0.05),
    ],
];