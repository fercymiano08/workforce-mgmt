<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SystemHealthTest extends TestCase
{
    use RefreshDatabase;

    public function test_requires_an_admin(): void
    {
        $user = User::factory()->create(['role' => 'Employee']);

        $this->actingAs($user)->getJson('/api/system/db-health')->assertForbidden();
    }

    public function test_reports_a_live_latency_reading(): void
    {
        $admin = User::factory()->create(['role' => 'Administrator']);

        $response = $this->actingAs($admin)->getJson('/api/system/db-health')->assertOk();

        $response->assertJsonStructure(['data' => ['connected', 'latencyMs', 'checkedAt']]);
        $this->assertTrue($response->json('data.connected'));
        $this->assertIsFloat($response->json('data.latencyMs'));
    }
}
