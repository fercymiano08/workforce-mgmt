<?php

namespace App\Models;

use App\Models\Concerns\ApiSerializable;
use Illuminate\Database\Eloquent\Model;

/**
 * Append-only leave-balance history: accrual, usage, manual adjustment, expiration, carryover.
 * The current balance for (employee, type) is always SUM(days_delta) - balance_after is a
 * display-only snapshot, never read as the source of truth. Mirrors AuditEvent's shape: no
 * updated_at, rows are never rewritten in place. Written only through App\Services\LeaveLedger.
 */
class LeaveBalanceLedger extends Model
{
    use ApiSerializable;

    protected $table = 'leave_balance_ledger';

    public $timestamps = false;

    protected $fillable = [
        'employee_id', 'leave_type_code', 'entry_type', 'days_delta',
        'balance_after', 'reference_id', 'reason', 'performed_by',
    ];

    protected function casts(): array
    {
        return [
            'days_delta' => 'float',
            'balance_after' => 'float',
            'created_at' => 'datetime',
        ];
    }
}
