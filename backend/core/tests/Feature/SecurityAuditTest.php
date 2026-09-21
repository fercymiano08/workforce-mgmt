<?php

namespace Tests\Feature;

use App\Models\AuditEvent;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** Sign-ins, failed sign-ins, password changes and the password check before an export all leave an audit record. */
class SecurityAuditTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['email' => 'boss@example.com', 'role' => 'Administrator', 'role_label' => 'Administrator', 'password' => 'Passw0rd!x']);
    }

    public function test_login_success_and_failure_are_recorded(): void
    {
        $this->admin();

        $this->postJson('/api/auth/login', ['email' => 'boss@example.com', 'password' => 'wrong'])->assertStatus(422);
        $this->postJson('/api/auth/login', ['email' => 'boss@example.com', 'password' => 'Passw0rd!x'])->assertOk();

        $this->assertSame(1, AuditEvent::where('event', 'auth.login_failed')->count());
        $this->assertSame(1, AuditEvent::where('event', 'auth.login')->count());
    }

    public function test_confirming_the_password_before_an_export_is_recorded_with_its_purpose(): void
    {
        $user = $this->admin();

        $this->actingAs($user)->postJson('/api/auth/confirm-password', ['password' => 'nope', 'purpose' => 'Export audit log'])
            ->assertStatus(422)->assertJsonValidationErrors('password');
        $this->actingAs($user)->postJson('/api/auth/confirm-password', ['password' => 'Passw0rd!x', 'purpose' => 'Export audit log'])
            ->assertOk();

        $this->assertSame(1, AuditEvent::where('event', 'auth.confirm_failed')->count());
        $event = AuditEvent::where('event', 'auth.export_confirmed')->first();
        $this->assertNotNull($event);
        $this->assertSame('Export audit log', $event->meta['purpose']);
    }

    public function test_changing_the_password_is_recorded(): void
    {
        $user = $this->admin();

        $this->actingAs($user)->postJson('/api/auth/change-password', [
            'current_password' => 'Passw0rd!x', 'new_password' => 'Newpassw0rd!', 'new_password_confirmation' => 'Newpassw0rd!',
        ])->assertOk();

        $this->assertSame(1, AuditEvent::where('event', 'auth.password_changed')->count());
    }
}
