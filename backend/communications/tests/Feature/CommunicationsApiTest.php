<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class CommunicationsApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_inbox_requires_authentication(): void
    {
        $this->getJson('/api/notifications')->assertUnauthorized();
    }

    public function test_admin_can_list_inbox_and_mark_all_as_read(): void
    {
        $admin = $this->adminUser();
        $this->actingAs($admin)
            ->getJson('/api/notifications')
            ->assertOk()
            ->assertJsonStructure(['data']);

        $this->actingAs($admin)
            ->postJson('/api/notifications/read-all')
            ->assertOk();
    }

    public function test_peer_cannot_write_to_inbox_without_service_token(): void
    {
        $this->postJson('/api/internal/notifications', [
            'type' => 'system',
            'title' => 'Nope',
            'message' => 'Should fail',
        ])->assertForbidden();
    }

    public function test_peer_can_push_notification_with_service_token(): void
    {
        $token = config('svc.token');
        $response = $this->withHeader('X-Service-Token', $token)
            ->postJson('/api/internal/notifications', [
                'type' => 'security_alert',
                'title' => 'Late clock-in',
                'message' => 'EMP20260001 clocked in late.',
                'employeeId' => 'EMP20260001',
                'priority' => 'high',
                'actionUrl' => '/attendance',
            ]);
        $response->assertCreated();
    }
}