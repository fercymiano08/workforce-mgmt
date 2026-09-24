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

    public function test_gemini_writes_the_words_but_the_numbers_and_score_come_from_the_database(): void
    {
        config(['services.gemini.key' => 'test-key']);
        Carbon::setTestNow(Carbon::parse('2026-08-13 12:00:00', 'Asia/Manila'));
        $employee = $this->employee();
        foreach (['2026-08-03', '2026-08-04', '2026-08-05', '2026-08-06'] as $date) {
            Attendance::create(['id' => 'ATT'.str_replace('-', '', $date), 'employee_id' => $employee->id, 'date' => $date, 'clock_in' => '09:00', 'status' => 'Late']);
        }

        Http::fake([
            'generativelanguage.googleapis.com/*' => Http::response(['candidates' => [['content' => ['parts' => [['text' => json_encode([
                'summary' => 'Punctuality needs attention this month.',
                'healthScore' => 99,                                  // ignored: the score is the system's
                'insights' => [
                    ['ref' => 'late-EMP001', 'title' => 'Frequent lateness', 'message' => 'Test EMP001 came in late 4 times in the last 30 days.', 'recommendation' => 'Talk with Test EMP001 about the start time.'],
                    ['ref' => 'healthy-attendance', 'title' => 'Great attendance', 'message' => 'Attendance is at 97%.', 'recommendation' => 'Keep it up.'],   // 97 is invented
                    ['ref' => 'made-up', 'title' => 'Fire half the team', 'message' => 'x', 'recommendation' => 'x'],                                         // not a finding
                ],
            ])]]]]]], 200),
        ]);

        $data = $this->actingAs($this->adminUser())->getJson('/api/analytics/ai/insights')->assertOk()->json('data');
        $byId = array_column($data['insights'], null, 'id');

        $this->assertSame('ai', $data['source']);
        $this->assertSame('ok', $data['aiStatus']);
        $this->assertNotSame(99, $data['healthScore']);
        $this->assertSame('Punctuality needs attention this month.', $data['summary']);
        // Gemini's wording, the system's numbers
        $this->assertSame('Frequent lateness', $byId['late-EMP001']['title']);
        $this->assertSame('4 late · last 30 days', $byId['late-EMP001']['metric']);
        // the sentence with an invented number is replaced by the rule's own
        $this->assertSame('Great attendance', $byId['healthy-attendance']['title']);
        $this->assertStringContainsString('4 of 4 expected work days', $byId['healthy-attendance']['message']);
        // nothing that is not a finding gets in
        $this->assertArrayNotHasKey('made-up', $byId);
    }

    public function test_a_busy_model_falls_through_to_the_next_one(): void
    {
        config(['services.gemini.key' => 'test-key', 'services.gemini.model' => 'model-a', 'services.gemini.fallback_models' => ['model-b']]);
        Carbon::setTestNow(Carbon::parse('2026-08-13 12:00:00', 'Asia/Manila'));
        $this->pendingLeave('LV001', $this->employee()->id);

        Http::fake([
            'generativelanguage.googleapis.com/v1beta/models/model-a:*' => Http::response(['error' => ['message' => 'high demand']], 503),
            'generativelanguage.googleapis.com/v1beta/models/model-b:*' => Http::response(['candidates' => [['content' => ['parts' => [
                ['thought' => true, 'text' => 'thinking about it'],
                ['text' => json_encode(['summary' => 'Approvals are waiting.', 'insights' => [
                    ['ref' => 'pending-approvals', 'title' => 'Requests waiting', 'message' => 'One leave request is waiting for a decision.', 'recommendation' => 'Decide it in the Decision Queue.'],
                ]])],
            ]]]]], 200),
        ]);

        $data = $this->actingAs($this->adminUser())->getJson('/api/analytics/ai/insights')->assertOk()->json('data');

        $this->assertSame('ai', $data['source']);
        $this->assertSame('Approvals are waiting.', $data['summary']);
        $this->assertSame('Requests waiting', array_column($data['insights'], null, 'id')['pending-approvals']['title']);
    }

    public function test_a_model_that_is_out_of_daily_quota_is_not_asked_again_but_a_busy_one_is_retried_by_regenerate(): void
    {
        config(['services.gemini.key' => 'test-key', 'services.gemini.model' => 'model-a', 'services.gemini.fallback_models' => ['model-b', 'model-c']]);
        Carbon::setTestNow(Carbon::parse('2026-08-13 12:00:00', 'Asia/Manila'));
        $this->pendingLeave('LV001', $this->employee()->id);

        $ok = ['candidates' => [['content' => ['parts' => [['text' => json_encode(['summary' => 'Approvals are waiting.', 'insights' => []])]]]]]];
        Http::fake([
            'generativelanguage.googleapis.com/v1beta/models/model-a:*' => Http::response(['error' => ['message' => 'Quota exceeded ... GenerateRequestsPerDayPerProjectPerModel-FreeTier']], 429),
            'generativelanguage.googleapis.com/v1beta/models/model-b:*' => Http::response(['error' => ['message' => 'high demand']], 503),
            'generativelanguage.googleapis.com/v1beta/models/model-c:*' => Http::response($ok, 200),
        ]);
        $admin = $this->adminUser();
        $asked = fn (string $model) => Http::recorded(fn ($request) => str_contains($request->url(), "/{$model}:"))->count();

        $this->actingAs($admin)->getJson('/api/analytics/ai/insights')->assertOk()->assertJsonPath('data.source', 'ai');
        $this->assertSame([1, 1, 1], [$asked('model-a'), $asked('model-b'), $asked('model-c')]);

        // Regenerate: the quota-exhausted model is left alone; the merely busy one gets another chance
        $this->actingAs($admin)->getJson('/api/analytics/ai/insights?refresh=1')->assertOk();
        $this->assertSame([1, 2, 2], [$asked('model-a'), $asked('model-b'), $asked('model-c')]);

        // An ordinary page view with nothing changed costs no request at all
        $this->actingAs($admin)->getJson('/api/analytics/ai/insights')->assertOk()->assertJsonPath('data.source', 'ai');
        $this->assertSame([1, 2, 2], [$asked('model-a'), $asked('model-b'), $asked('model-c')]);
    }

    public function test_the_same_findings_and_score_are_shown_when_gemini_is_down_or_not_set_up(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 12:00:00', 'Asia/Manila'));
        $admin = $this->adminUser();
        $this->pendingLeave('LV001', $this->employee()->id);

        $without = $this->actingAs($admin)->getJson('/api/analytics/ai/insights')->json('data');
        $this->assertSame('not_configured', $without['aiStatus']);

        config(['services.gemini.key' => 'test-key']);
        Http::fake(['generativelanguage.googleapis.com/*' => Http::response(['error' => 'high demand'], 503)]);
        $down = $this->actingAs($admin)->getJson('/api/analytics/ai/insights')->json('data');

        $this->assertSame('rule-based', $down['source']);
        $this->assertSame('unavailable', $down['aiStatus']);
        $this->assertSame('busy', $down['aiReason']);   // the screen says why, not just "unavailable"
        $this->assertNotNull($down['aiRetryAt']);
        $this->assertSame($without['healthScore'], $down['healthScore']);
        $this->assertSame(array_column($without['insights'], 'message'), array_column($down['insights'], 'message'));
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
