<?php

namespace Tests\Feature;

use App\Models\Setting;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** A new install starts with the company name filled in, and never overwrites what an administrator saved. */
class CompanyDefaultsTest extends TestCase
{
    use RefreshDatabase;

    public function test_a_fresh_install_gets_the_company_name_only(): void
    {
        $this->seed(DatabaseSeeder::class);

        $company = Setting::find(1)->company;
        $this->assertSame('Archon Nell Incorporated', $company['name']);
        $this->assertArrayNotHasKey('phone', $company);   // contact details are never guessed
    }

    public function test_reseeding_keeps_a_name_the_administrator_saved(): void
    {
        Setting::updateOrCreate(['id' => 1], ['company' => ['name' => 'Acme Corp', 'phone' => '123']]);

        $this->seed(DatabaseSeeder::class);

        $this->assertSame(['name' => 'Acme Corp', 'phone' => '123'], Setting::find(1)->company);
    }

    public function test_a_settings_change_is_written_to_the_audit_log_with_before_and_after(): void
    {
        config(['svc.audit_mode' => 'remote']);
        Http::fake();
        Setting::updateOrCreate(['id' => 1], ['company' => ['name' => 'Old Name']]);

        $this->actingAs($this->adminUser())->putJson('/api/settings', ['company' => ['name' => 'New Name']])->assertOk();

        $event = Http::recorded()->map(fn ($pair) => $pair[0]->data())->first(fn ($d) => ($d['event'] ?? '') === 'settings.updated');
        $this->assertNotNull($event);
        $this->assertSame(['company'], $event['meta']['sections']);
        $this->assertSame('Old Name', $event['before']['company']['name']);
        $this->assertSame('New Name', $event['after']['company']['name']);
    }
}

