<?php

namespace Tests\Feature;

use App\Models\Employee;
use App\Models\SecurityEvent;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

class AIDecisionSupportSecurityTest extends TestCase
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

    private function openEvent(string $id, string $type, string $message, ?string $employeeId = null): SecurityEvent
    {
        return SecurityEvent::create([
            'id' => $id,
            'type' => $type,
            'message' => $message,
            'employee_id' => $employeeId,
            'detail' => $employeeId ? ['employee_id' => $employeeId] : null,
            'status' => 'Open',
        ]);
    }

    public function test_kiosk_security_log_persists_a_face_mismatch_event(): void
    {
        $employee = $this->employee();

        $this->postJson('/api/kiosk/log', [
            'type' => 'security',
            'message' => "Face mismatch - person does not match Test {$employee->id} ({$employee->id})",
            'employeeId' => $employee->id,
        ])->assertCreated();

        $this->assertDatabaseHas('security_events', [
            'type' => 'face_mismatch',
            'status' => 'Open',
            'employee_id' => $employee->id,
        ]);

        $this->postJson('/api/kiosk/log', [
            'type' => 'security',
            'message' => 'Failed attempt to unlock the kiosk (incorrect PIN)',
        ])->assertCreated();

        $this->assertDatabaseHas('security_events', [
            'type' => 'pin_failed',
            'status' => 'Open',
        ]);
    }

    public function test_benign_security_logs_are_not_persisted(): void
    {
        $this->postJson('/api/kiosk/log', [
            'type' => 'security',
            'message' => 'Kiosk terminal unlocked with access PIN',
        ])->assertCreated();

        $this->assertSame(0, SecurityEvent::count());
    }

    public function test_open_security_events_appear_in_the_queue_and_insights(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 12:00:00'));
        $admin = $this->adminUser();
        $employee = $this->employee();
        $this->openEvent('SEV001', 'face_mismatch', "Face mismatch - person does not match Test {$employee->id} ({$employee->id})", $employee->id);

        $response = $this->actingAs($admin)->getJson('/api/analytics/ai/insights')->assertOk();

        $this->assertSame('SEV001', $response->json('data.queue.security.0.id'));
        $this->assertSame('face_mismatch', $response->json('data.queue.security.0.type'));
        $this->assertSame('Test '.$employee->id, $response->json('data.queue.security.0.employee'));
        $this->assertContains('security-intruder-alert', array_column($response->json('data.insights'), 'id'));
        $this->assertLessThan(100, $response->json('data.healthScore'));
    }

    public function test_resolves_and_escalates_security_events(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 12:00:00'));
        $admin = $this->adminUser();
        $this->openEvent('SEV001', 'pin_failed', 'Failed attempt to unlock the kiosk (incorrect PIN)');

        $resolved = $this->actingAs($admin)
            ->postJson('/api/analytics/ai/actions', ['action' => 'resolve_security_event', 'id' => 'SEV001'])
            ->assertOk()
            ->assertJson(['success' => true, 'action' => 'resolved', 'id' => 'SEV001']);

        $this->assertSame('Resolved', SecurityEvent::find('SEV001')?->status);
        $this->assertSame([], $resolved->json('queue.security'));

        $this->openEvent('SEV002', 'face_mismatch', 'Face mismatch - person does not match Test EMP001 (EMP001)');

        $this->actingAs($admin)
            ->postJson('/api/analytics/ai/actions', ['action' => 'flag_security_event', 'id' => 'SEV002'])
            ->assertOk()
            ->assertJson(['success' => true, 'action' => 'flagged', 'id' => 'SEV002']);

        $this->assertSame('Flagged', SecurityEvent::find('SEV002')?->status);
        $this->assertDatabaseHas('notifications', [
            'type' => 'security_alert',
            'title' => 'Kiosk Security Alert',
        ]);
    }

    public function test_cannot_touch_an_already_resolved_event(): void
    {
        $admin = $this->adminUser();
        $this->openEvent('SEV001', 'pin_failed', 'Failed attempt to unlock the kiosk (incorrect PIN)');

        $this->actingAs($admin)
            ->postJson('/api/analytics/ai/actions', ['action' => 'resolve_security_event', 'id' => 'SEV001'])
            ->assertOk();

        $this->actingAs($admin)
            ->postJson('/api/analytics/ai/actions', ['action' => 'resolve_security_event', 'id' => 'SEV001'])
            ->assertStatus(404);
    }

    public function test_insight_resolution_persists_and_can_be_undone(): void
    {
        Carbon::setTestNow(Carbon::parse('2026-08-13 12:00:00'));
        $admin = $this->adminUser();

        $first = $this->actingAs($admin)->getJson('/api/analytics/ai/insights')->assertOk();
        $key = $first->json('data.insights.0.resolveKey');
        $this->assertIsString($key);
        $this->assertFalse($first->json('data.insights.0.resolved'));

        $this->actingAs($admin)
            ->postJson('/api/analytics/ai/actions', ['action' => 'resolve_insight', 'key' => $key])
            ->assertOk()
            ->assertJson(['success' => true, 'resolved' => true, 'key' => $key]);

        $second = $this->actingAs($admin)->getJson('/api/analytics/ai/insights')->assertOk();
        $this->assertTrue($second->json('data.insights.0.resolved'));

        $this->actingAs($admin)
            ->postJson('/api/analytics/ai/actions', ['action' => 'unresolve_insight', 'key' => $key])
            ->assertOk()
            ->assertJson(['success' => true, 'resolved' => false]);

        $third = $this->actingAs($admin)->getJson('/api/analytics/ai/insights')->assertOk();
        $this->assertFalse($third->json('data.insights.0.resolved'));
    }

    public function test_insight_resolution_requires_a_key(): void
    {
        $admin = $this->adminUser();

        $this->actingAs($admin)
            ->postJson('/api/analytics/ai/actions', ['action' => 'resolve_insight'])
            ->assertStatus(422);
    }
}
