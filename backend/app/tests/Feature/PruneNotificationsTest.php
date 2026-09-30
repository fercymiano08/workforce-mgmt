<?php

namespace Tests\Feature;

use App\Models\Notification;
use App\Services\NotificationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Tests\TestCase;

/**
 * The bell is a channel for what needs acting on now, not an archive: without a pruner the unread
 * badge counts every resolved weeks-old alert forever. notifications:prune drops whatever is past
 * the retention window - for admins' and employees' bells alike - so the number means something again.
 */
class PruneNotificationsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2030-01-20 10:00:00', 'Asia/Manila'));
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    public function test_rows_older_than_the_retention_window_are_deleted_and_recent_stay(): void
    {
        NotificationService::notifyAdmins('attendance_late', 'Old alert', 'An old resolved alert.', 'low', '/attendance');
        NotificationService::notifyEmployee('EMP-1', 'attendance_clock_in', 'Old punch', 'You clocked in long ago.', 'low', '/my-attendance');
        NotificationService::notifyAdmins('early_clock_out', 'Fresh', 'Just arrived today.', 'medium', '/attendance?view=early');

        Notification::where('title', 'Old alert')->update(['timestamp' => now()->subDays(45)]);
        Notification::where('title', 'Old punch')->update(['timestamp' => now()->subDays(60)]);

        $this->assertSame(3, Notification::count());

        $this->artisan('notifications:prune')->assertSuccessful();

        $this->assertSame(1, Notification::count());
        $this->assertSame('Fresh', Notification::first()->title);

        // The unread badge that was counting the old rows stops counting them.
        $this->actingAs($this->adminUser())->getJson('/api/notifications/unread-count')->assertJsonPath('count', 1);
    }

    public function test_the_retention_window_is_tunable(): void
    {
        NotificationService::notifyAdmins('attendance_late', 'Two weeks old', 'Still worth seeing.', 'low', '/attendance');
        Notification::where('title', 'Two weeks old')->update(['timestamp' => now()->subDays(14)]);

        $this->artisan('notifications:prune', ['--days' => 7])->assertSuccessful();
        $this->assertSame(0, Notification::count());

        // Same age, wider window: kept.
        NotificationService::notifyAdmins('attendance_late', 'Two weeks old', 'Still worth seeing.', 'low', '/attendance');
        Notification::where('title', 'Two weeks old')->update(['timestamp' => now()->subDays(14)]);

        $this->artisan('notifications:prune', ['--days' => 30])->assertSuccessful();
        $this->assertSame(1, Notification::count());
    }
}