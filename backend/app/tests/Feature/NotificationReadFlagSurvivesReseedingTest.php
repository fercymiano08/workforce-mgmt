<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Models\User;
use Database\Seeders\DatabaseSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * db:seed runs on EVERY deploy (see docker/backend-entrypoint.sh).
 *
 * It used to write the notification fixture's "read": false back over whatever the reader had
 * actually done, because the fixture's whole row was upserted by id. So the notification badge was
 * reset to its highest number on every deploy and no amount of reading would clear it - which reads
 * exactly like a broken mark-as-read button.
 *
 * The read flag belongs to the person using the system, not to the fixture, so re-seeding has to
 * leave it alone while still refreshing the rest of the row.
 */
class NotificationReadFlagSurvivesReseedingTest extends TestCase
{
    use RefreshDatabase;

    public function test_reseeding_does_not_put_read_notifications_back_in_the_unread_column(): void
    {
        $this->seed(DatabaseSeeder::class);

        $this->assertGreaterThan(
            0,
            Notification::where('read', false)->count(),
            'The fixture should ship some unread notifications, or this proves nothing.'
        );

        // The reader clears their inbox.
        Notification::query()->update(['read' => true]);
        $this->assertSame(0, Notification::where('read', false)->count());

        // A deploy happens.
        $this->seed(DatabaseSeeder::class);

        $this->assertSame(
            0,
            Notification::where('read', false)->count(),
            'Reseeding must not resurrect a notification the reader already read.'
        );
        $this->assertSame(
            Notification::count(),
            Notification::where('read', true)->count(),
            'Every notification should still be exactly where the reader left it.'
        );
    }

    public function test_a_deploy_does_not_disturb_a_partly_read_inbox(): void
    {
        $this->seed(DatabaseSeeder::class);

        // Reading some of it is what actually happens, not clearing it wholesale.
        $keep = Notification::where('read', false)->limit(2)->pluck('id');
        $this->assertNotEmpty($keep);
        Notification::query()->whereNotIn('id', $keep)->update(['read' => true]);

        $this->seed(DatabaseSeeder::class);

        foreach ($keep as $id) {
            $this->assertFalse(Notification::find($id)->read, "{$id} was left unread and must stay unread.");
        }
        $this->assertSame(
            $keep->count(),
            Notification::where('read', false)->count(),
            'Only the ones deliberately left unread should remain unread.'
        );
    }

    public function test_reseeding_still_refreshes_the_rest_of_the_row(): void
    {
        $this->seed(DatabaseSeeder::class);

        $row = Notification::first();
        Notification::where('id', $row->id)->update(['read' => true, 'title' => 'edited in the database']);

        $this->seed(DatabaseSeeder::class);

        // Preserving the read flag must not turn the seeder into a no-op for the fixture's content:
        // a corrected fixture still has to reach everyone.
        $this->assertSame($row->title, Notification::find($row->id)->title);
        $this->assertTrue(Notification::find($row->id)->read, 'while the reader is still respected.');
    }

    public function test_the_badge_count_the_api_reports_survives_a_reseed(): void
    {
        $this->seed(DatabaseSeeder::class);

        // The administrator the seeder itself created, rather than a factory-made one, because the
        // reseed below would then collide on the admin's email.
        $admin = User::where('email', 'admin@workforcepro.com')->firstOrFail();
        $this->assertSame('Administrator', $admin->role);

        // The fixture addresses every row to a named employee, so an admin sees none of them - the
        // admin badge is fed by rows with no employee on them. Aim a few at the admins, which is the
        // shape an alert actually has, so the badge under test has something to count.
        Notification::query()->limit(3)->update(['employee_id' => null, 'read' => false]);

        $before = $this->actingAs($admin)->getJson('/api/notifications/unread-count')->json('count');
        $this->assertSame(3, $before);

        // Read everything, the way the "mark all read" button does.
        $this->actingAs($admin)->postJson('/api/notifications/read-all')->assertOk();
        $this->assertSame(
            0,
            $this->actingAs($admin)->getJson('/api/notifications/unread-count')->json('count')
        );

        // A deploy runs the seeder again. The badge has to stay at zero.
        $this->seed(DatabaseSeeder::class);

        $this->assertSame(
            0,
            $this->actingAs($admin)->getJson('/api/notifications/unread-count')->json('count'),
            'The badge reset to '.$before.' after a deploy. This is the bug.'
        );
    }
}
