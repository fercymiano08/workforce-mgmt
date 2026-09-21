<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\AuditLogger;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AuditTrailTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        return User::factory()->create(['role' => 'Administrator']);
    }

    public function test_an_admin_sees_recorded_events_with_a_timestamp(): void
    {
        AuditLogger::record('timeoff', 'leave.created', 'Leave', 'LVE001', actor: 'Juan', before: null, after: ['status' => 'Pending']);
        Sanctum::actingAs($this->admin());

        $response = $this->getJson('/api/audit')->assertOk();

        $response->assertJsonPath('meta.total', 1)
            ->assertJsonPath('data.0.event', 'leave.created')
            ->assertJsonPath('data.0.actor', 'Juan');
        $this->assertNotEmpty($response->json('data.0.createdAt'), 'the time of the event must be returned');
    }

    public function test_an_employee_cannot_read_the_audit_trail(): void
    {
        Sanctum::actingAs(User::factory()->create(['role' => 'Employee']));

        $this->getJson('/api/audit')->assertForbidden();
    }

    private function eventAt(string $utc, string $entityId): void
    {
        DB::table('audit_events')->insert([
            'service' => 'core', 'event' => 'employee.updated', 'entity_type' => 'Employee',
            'entity_id' => $entityId, 'actor' => 'Admin', 'created_at' => $utc,
        ]);
    }

    private function idsFor(string $query): array
    {
        return collect($this->getJson('/api/audit?'.$query)->assertOk()->json('data'))->pluck('entityId')->sort()->values()->all();
    }

    public function test_the_period_filter_uses_manila_days_not_utc_days(): void
    {
        // 04:27 on 21 Sep in Manila is still 20 Sep in UTC - the "Today" button must include it.
        $this->eventAt('2026-09-20 20:27:00', 'EARLY_MORNING_21');
        // 23:59 on 20 Sep in Manila (15:59 UTC) belongs to the 20th.
        $this->eventAt('2026-09-20 15:59:00', 'LATE_NIGHT_20');
        // 00:00 on 22 Sep in Manila (16:00 UTC on the 21st) belongs to the 22nd.
        $this->eventAt('2026-09-21 16:00:00', 'MIDNIGHT_22');
        Sanctum::actingAs($this->admin());

        $this->assertSame(['EARLY_MORNING_21'], $this->idsFor('from=2026-09-21&to=2026-09-21'));
        $this->assertSame(['LATE_NIGHT_20'], $this->idsFor('from=2026-09-20&to=2026-09-20'));
        $this->assertSame(['EARLY_MORNING_21', 'LATE_NIGHT_20'], $this->idsFor('from=2026-09-20&to=2026-09-21'));
        $this->assertSame(['MIDNIGHT_22'], $this->idsFor('from=2026-09-22'));
        $this->assertCount(3, $this->getJson('/api/audit')->json('data'));
    }

    public function test_a_garbled_date_is_ignored_instead_of_hiding_everything(): void
    {
        $this->eventAt('2026-09-20 20:27:00', 'A');
        Sanctum::actingAs($this->admin());

        $this->assertSame(['A'], $this->idsFor('from=not-a-date'));
    }
}
