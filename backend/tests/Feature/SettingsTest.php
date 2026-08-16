<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SettingsTest extends TestCase
{
    use RefreshDatabase;

    private function employeeUser(): User
    {
        return User::factory()->create(['role' => 'Employee', 'role_label' => 'Employee']);
    }

    public function test_settings_require_authentication(): void
    {
        $this->getJson('/api/settings')->assertUnauthorized();
    }

    public function test_settings_default_to_empty_sections(): void
    {
        $user = $this->adminUser();

        $this->actingAs($user)
            ->getJson('/api/settings')
            ->assertOk()
            ->assertJsonStructure(['data' => ['profile', 'appearance', 'notifications', 'security', 'system', 'company', 'kiosk']]);
    }

    public function test_settings_can_be_updated(): void
    {
        $user = $this->adminUser();

        $this->actingAs($user)
            ->putJson('/api/settings', ['company' => ['name' => 'TestMart Corp']])
            ->assertOk()
            ->assertJsonPath('data.company.name', 'TestMart Corp');

        $this->actingAs($user)
            ->getJson('/api/settings')
            ->assertOk()
            ->assertJsonPath('data.company.name', 'TestMart Corp');
    }

    public function test_update_only_touches_provided_sections(): void
    {
        $user = $this->adminUser();

        $this->actingAs($user)->putJson('/api/settings', ['kiosk' => ['autoLockMinutes' => 5]]);

        $data = $this->actingAs($user)->getJson('/api/settings')->json('data');
        $this->assertSame(['autoLockMinutes' => 5], $data['kiosk']);
        $this->assertSame([], $data['company']);
    }

    public function test_employee_can_read_but_not_update_settings(): void
    {
        $user = $this->employeeUser();

        $this->actingAs($user)->getJson('/api/settings')->assertOk();
        $this->actingAs($user)
            ->putJson('/api/settings', ['company' => ['name' => 'Should Not Save']])
            ->assertForbidden();
    }

    public function test_update_ignores_the_now_unused_personal_sections(): void
    {
        $user = $this->adminUser();

        $this->actingAs($user)->putJson('/api/settings', [
            'company' => ['name' => 'TestMart Corp'],
            'profile' => ['name' => 'Should Be Ignored'],
        ]);

        $data = $this->actingAs($user)->getJson('/api/settings')->json('data');
        $this->assertSame('TestMart Corp', $data['company']['name']);
        $this->assertSame([], $data['profile']);
    }
}
