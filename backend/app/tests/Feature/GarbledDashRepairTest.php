<?php

namespace Tests\Feature;

use App\Models\Notification;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GarbledDashRepairTest extends TestCase
{
    use RefreshDatabase;

    public function test_old_notifications_with_garbled_dashes_are_repaired_and_good_ones_left_alone(): void
    {
        $bad = Notification::create(['id' => 'N1', 'type' => 'schedule', 'title' => 'Schedule Published', 'message' => "Sep 28 \u{e2}\u{20ac}\u{201c} Oct 04 \u{c2}\u{b7} done", 'timestamp' => now(), 'read' => false, 'priority' => 'low']);
        $good = Notification::create(['id' => 'N2', 'type' => 'schedule', 'title' => 'Fine', 'message' => "Oct 05 \u{2013} Oct 11", 'timestamp' => now(), 'read' => false, 'priority' => 'low']);

        (require database_path('migrations/2026_10_02_000002_repair_garbled_dashes_in_notifications.php'))->up();

        $this->assertSame("Sep 28 \u{2013} Oct 04 \u{b7} done", $bad->fresh()->message);
        $this->assertSame("Oct 05 \u{2013} Oct 11", $good->fresh()->message);
    }
}
