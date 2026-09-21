<?php

namespace Tests\Feature;

use App\Models\OvertimeRequest;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Deciding, reopening and deleting an overtime request each leave an audit record (who, and what it was before). */
class OvertimeAuditTest extends TestCase
{
    use RefreshDatabase;

    public function test_decisions_and_reopening_are_written_to_the_audit_log(): void
    {
        config(['svc.audit_mode' => 'remote']);
        Http::fake();
        OvertimeRequest::create([
            'id' => 'OT900', 'employee_id' => 'EMP-OTP', 'employee_name' => 'Juan', 'date' => '2030-01-16', 'requested_date' => '2030-01-15',
            'expected_hours' => 2, 'reason' => 'Deadline', 'status' => 'Pending',
        ]);
        $admin = $this->adminUser();

        $this->actingAs($admin)->patchJson('/api/overtime/OT900/status', ['status' => 'Approved', 'approvedHours' => 2])->assertOk();
        $this->actingAs($admin)->patchJson('/api/overtime/OT900/status', ['status' => 'Pending'])->assertOk();   // reopened

        $sent = Http::recorded()->map(fn ($pair) => $pair[0]->data())
            ->filter(fn ($d) => ($d['event'] ?? '') === 'overtime.status_changed')->values();
        $this->assertCount(2, $sent);
        $this->assertSame('Approved', $sent[0]['meta']['status']);
        $this->assertSame('Pending', $sent[0]['meta']['was']);
        $this->assertSame('Pending', $sent[1]['meta']['status']);
        $this->assertSame('Approved', $sent[1]['meta']['was']);    // the reopening records what it was before
    }
}
