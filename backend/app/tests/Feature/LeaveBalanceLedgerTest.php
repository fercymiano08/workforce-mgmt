<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Services\LeaveLedger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * The literal answer to "where does the balance come from, who modifies it": every change is an
 * append-only row here, written only through LeaveLedger, never a single editable number.
 */
class LeaveBalanceLedgerTest extends TestCase
{
    use RefreshDatabase;

    private function employee(): Employee
    {
        return Employee::create([
            'id' => 'EMP-OTP', 'first_name' => 'Juan', 'last_name' => 'Dela Cruz',
            'email' => 'juan@example.com', 'status' => 'Active',
        ]);
    }

    public function test_an_employee_cannot_adjust_a_balance(): void
    {
        $this->employee();

        $this->actingAs($this->otpEmployeeUser())
            ->postJson('/api/leave-balance-ledger/adjust', [
                'employeeId' => 'EMP-OTP', 'leaveTypeCode' => 'Vacation', 'daysDelta' => 5, 'reason' => 'Trying to self-grant days',
            ])
            ->assertStatus(403);
    }

    public function test_an_adjustment_requires_a_real_reason(): void
    {
        $this->employee();

        $this->actingAs($this->adminUser())
            ->postJson('/api/leave-balance-ledger/adjust', [
                'employeeId' => 'EMP-OTP', 'leaveTypeCode' => 'Vacation', 'daysDelta' => 5, 'reason' => 'ok',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('reason');
    }

    public function test_an_admin_adjustment_changes_the_employees_balance(): void
    {
        $this->employee();

        $this->actingAs($this->adminUser())
            ->postJson('/api/leave-balance-ledger/adjust', [
                'employeeId' => 'EMP-OTP', 'leaveTypeCode' => 'Vacation', 'daysDelta' => 5,
                'reason' => 'Correcting a migration shortfall',
            ])
            ->assertCreated()
            ->assertJsonPath('data.entryType', 'Adjustment')
            ->assertJsonPath('data.daysDelta', 5);

        $this->assertSame(5.0, LeaveLedger::currentBalance('EMP-OTP', 'Vacation'));

        $balance = collect(Employee::find('EMP-OTP')->leaveBalances())->firstWhere('type', 'Vacation');
        $this->assertEquals(5.0, $balance['remaining']);
    }

    public function test_ledger_history_is_self_or_admin(): void
    {
        $this->employee();
        LeaveLedger::write('EMP-OTP', 'Vacation', 'Adjustment', 3, null, 'Seed for the test', 'SYSTEM');
        $employee = $this->otpEmployeeUser();

        $this->actingAs($employee)
            ->getJson('/api/leave-balance-ledger/EMP-OTP')
            ->assertOk()
            ->assertJsonCount(1, 'data');

        Employee::create(['id' => 'EMP-OTHER', 'first_name' => 'A', 'last_name' => 'B', 'email' => 'ab@x.com', 'status' => 'Active']);
        $this->actingAs($employee)
            ->getJson('/api/leave-balance-ledger/EMP-OTHER')
            ->assertStatus(403);
    }
}
