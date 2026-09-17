<?php

namespace Tests\Feature;

use App\Models\Attendance;
use App\Models\Employee;
use App\Models\Leave;
use App\Models\OvertimeRequest;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class AIDecisionSupportTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function employee(string $id = 'EMP001'): Employee
    {
        return Employee::create([
            'id' => $id,
            'first_name' => 'Test',
            'last_name' => $id,
            'email' => "{$id}@example.com",
            'department' => 'IT & Systems',
            'position' => 'Software Developer',
        ]);
    }

    private function insightIds($response): array
    {
        return array_column($response->json('data.insights'), 'id');
    }

    private function pendingLeave(string $id, string $employeeId): Leave
    {
        return Leave::create([
            'id' => $id,
            'employee_id' => $employeeId,
            'employee_name' => 'Test '.$employeeId,
            'leave_type' => 'Vacation',
            'start_date' => '2026-08-20',
            'end_date' => '2026-08-21',
            'reason' => 'Family trip',
            'status' => 'Pending',
            'applied_date' => '2026-08-12',
        ]);
    }

    private function pendingOvertime(string $id, string $employeeId): OvertimeRequest
    {
        return OvertimeRequest::create([
            'id' => $id,
            'employee_id' => $employeeId,
            'employee_name' => 'Test '.$employeeId,
            'date' => '2026-08-20',
            'reason' => 'Project deadline',
            'status' => 'Pending',
            'requested_date' => '2026-08-12',
        ]);
    }

    public function test_requires_an_admin(): void
    {
        $employee = $this->employee();
        $user = User::factory()->create([
            'employee_id' => $employee->id,
            'role' => 'Employee',
            'role_label' => 'Employee',
        ]);

        $this->actingAs($user)->getJson('/api/analytics/ai/insights')->assertForbidden();
        $this->actingAs($user)->postJson('/api/analytics/ai/actions', ['action' => 'approve_leave', 'id' => 'LV001'])->assertForbidden();
    }

    public function test_returns_a_well_shaped_response_even_with_no_data(): void
    {
        $admin = $this->adminUser();

        $response = $this->actingAs($admin)->getJson('/api/analytics/ai/insights')->assertOk();

        $response->assertJsonStructure([
            'data' => [
                'source', 'generatedAt', 'healthScore', 'summary', 'insights',
                'queue' => ['leave', 'overtime', 'security'],
            ],
        ]);
        $this->assertSame('rule-based', $response->json('data.source'));
        $this->assertContains('not-enough-data', $this->insightIds($response));
        $this->assertSame([], $response->json('data.queue.leave'));
        $this->assertSame([], $response->json('data.queue.overtime'));
        $this->assertSame([], $response->json('data.queue.security'));
        $this->assertSame(100, $response->json('data.healthScore'));
    }

    public function test_flags_repeated_lateness(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 12:00:00')); // a Thursday
        $admin = $this->adminUser();
        $employee = $this->employee();

        foreach (['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'] as $date) {
            Attendance::create([
                'id' => 'ATT'.str_replace('-', '', $date),
                'employee_id' => $employee->id,
                'date' => $date,
                'clock_in' => '09:00',
                'status' => 'Late',
            ]);
        }

        $response = $this->actingAs($admin)->getJson('/api/analytics/ai/insights')->assertOk();

        $this->assertContains('late-'.$employee->id, $this->insightIds($response));
        $this->assertLessThan(100, $response->json('data.healthScore'));
    }

    public function test_flags_pending_approvals(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 12:00:00'));
        $admin = $this->adminUser();
        $employee = $this->employee();
        $this->pendingLeave('LV001', $employee->id);

        $response = $this->actingAs($admin)->getJson('/api/analytics/ai/insights')->assertOk();

        $this->assertContains('pending-approvals', $this->insightIds($response));
        $this->assertSame('LV001', $response->json('data.queue.leave.0.id'));
        $this->assertSame('Vacation', $response->json('data.queue.leave.0.type'));
        $this->assertSame(2, $response->json('data.queue.leave.0.days'));
        $this->assertSame([], $response->json('data.queue.overtime'));
        $this->assertLessThan(100, $response->json('data.healthScore'));
    }

    public function test_reports_healthy_attendance_as_a_success(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 12:00:00'));
        $admin = $this->adminUser();
        $employee = $this->employee();

        foreach (['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06', '2026-08-07'] as $date) {
            Attendance::create([
                'id' => 'ATT'.str_replace('-', '', $date),
                'employee_id' => $employee->id,
                'date' => $date,
                'clock_in' => '07:55',
                'status' => 'Present',
            ]);
        }

        $response = $this->actingAs($admin)->getJson('/api/analytics/ai/insights')->assertOk();

        $this->assertContains('healthy-attendance', $this->insightIds($response));
        $this->assertGreaterThanOrEqual(90, $response->json('data.healthScore'));
    }

    public function test_uses_gemini_when_a_key_is_configured(): void
    {
        config(['services.gemini.key' => 'test-key']);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response([
                'candidates' => [
                    ['content' => ['parts' => [['text' => json_encode([
                        'summary' => 'The AI verdict from Gemini.',
                        'healthScore' => 87,
                        'insights' => [
                            ['severity' => 'warning', 'category' => 'Punctuality', 'title' => 'AI Flag', 'message' => 'Late arrivals are up this period.', 'recommendation' => 'Run a team reminder about start times.', 'metric' => '4 late'],
                        ],
                    ])]]]],
                ],
            ], 200),
        ]);

        $admin = $this->adminUser();
        $response = $this->actingAs($admin)->getJson('/api/analytics/ai/insights')->assertOk();

        $this->assertSame('ai', $response->json('data.source'));
        $this->assertSame(87, $response->json('data.healthScore'));
        $this->assertSame('The AI verdict from Gemini.', $response->json('data.summary'));
        $this->assertSame('AI Flag', $response->json('data.insights.0.title'));
    }

    public function test_falls_back_to_rules_when_gemini_fails(): void
    {
        config(['services.gemini.key' => 'test-key']);

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response(['error' => 'boom'], 429),
        ]);

        $admin = $this->adminUser();
        $response = $this->actingAs($admin)->getJson('/api/analytics/ai/insights')->assertOk();

        $this->assertSame('rule-based', $response->json('data.source'));
    }

    public function test_approves_and_rejects_individual_requests(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 12:00:00'));
        $admin = $this->adminUser();
        $employee = $this->employee();
        $this->pendingLeave('LV001', $employee->id);
        $this->pendingLeave('LV002', $employee->id);
        $this->pendingOvertime('OT001', $employee->id);

        $approve = $this->actingAs($admin)
            ->postJson('/api/analytics/ai/actions', ['action' => 'approve_leave', 'id' => 'LV001'])
            ->assertOk()
            ->assertJson(['success' => true, 'action' => 'approved', 'id' => 'LV001']);

        $this->assertSame('Approved', Leave::find('LV001')?->status);
        $this->assertSame('John Delgado', Leave::find('LV001')?->approved_by);
        $this->assertSame(['LV002'], array_column($approve->json('queue.leave'), 'id'));
        $this->assertDatabaseHas('notifications', [
            'employee_id' => $employee->id,
            'type' => 'leave_approved',
        ]);

        $reject = $this->actingAs($admin)
            ->postJson('/api/analytics/ai/actions', ['action' => 'reject_leave', 'id' => 'LV002'])
            ->assertOk()
            ->assertJson(['success' => true, 'action' => 'rejected', 'id' => 'LV002']);

        $this->assertSame('Rejected', Leave::find('LV002')?->status);
        $this->assertDatabaseHas('notifications', [
            'employee_id' => $employee->id,
            'type' => 'leave_rejected',
        ]);
        $this->assertSame([], $reject->json('queue.leave'));

        $overtime = $this->actingAs($admin)
            ->postJson('/api/analytics/ai/actions', ['action' => 'approve_overtime', 'id' => 'OT001'])
            ->assertOk()
            ->assertJson(['success' => true, 'action' => 'approved', 'id' => 'OT001']);

        $this->assertSame('Approved', OvertimeRequest::find('OT001')?->status);
        $this->assertSame([], $overtime->json('queue.overtime'));
    }

    public function test_cannot_resolve_an_already_resolved_request(): void
    {
        $admin = $this->adminUser();
        $employee = $this->employee();
        $this->pendingLeave('LV001', $employee->id);

        $this->actingAs($admin)
            ->postJson('/api/analytics/ai/actions', ['action' => 'approve_leave', 'id' => 'LV001'])
            ->assertOk();

        $this->actingAs($admin)
            ->postJson('/api/analytics/ai/actions', ['action' => 'approve_leave', 'id' => 'LV001'])
            ->assertStatus(404);
    }

    public function test_rejects_unknown_actions_and_missing_ids(): void
    {
        $admin = $this->adminUser();

        $this->actingAs($admin)
            ->postJson('/api/analytics/ai/actions', ['action' => 'fire_everyone', 'id' => 'LV001'])
            ->assertStatus(422);

        $this->actingAs($admin)
            ->postJson('/api/analytics/ai/actions', ['action' => 'approve_leave'])
            ->assertStatus(422);
    }
}
