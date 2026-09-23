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

    public function test_notify_employee_creates_a_notification_for_them(): void
    {
        \App\Services\NotificationService::notifyEmployee(
            'EMP20260001',
            'security_alert',
            'Late clock-in',
            'EMP20260001 clocked in late.',
            'high',
            '/attendance'
        );

        $this->assertDatabaseHas('notifications', [
            'employee_id' => 'EMP20260001',
            'type' => 'security_alert',
        ]);
    }
}