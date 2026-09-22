<?php

namespace Database\Seeders;

use App\Models\Notification;
use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;

/**
 * Loads backend/communications/database/demo/communications.json into the
 * communications database as real rows (timestamps anchored to the Monday of
 * the current week in Manila).
 */
class DemoSeeder extends Seeder
{
    public function run(): void
    {
        $demo = $this->demo('communications');

        foreach ($demo['notifications'] ?? [] as $row) {
            Notification::updateOrCreate(
                ['id' => $row['id']],
                [
                    'id' => $row['id'],
                    'type' => $row['type'],
                    'title' => $row['title'],
                    'message' => $row['message'],
                    'timestamp' => $this->dateTimeFor((int) $row['at']['w'], (int) $row['at']['d'], (string) $row['at']['t']),
                    'read' => (bool) ($row['read'] ?? false),
                    'employee_id' => $row['emp'],
                    'priority' => $row['priority'] ?? 'medium',
                    'action_url' => $row['url'] ?? null,
                ],
            );
        }
    }

    private function demo(string $file): array
    {
        $path = database_path('demo/'.$file.'.json');
        if (! file_exists($path)) {
            return [];
        }

        return json_decode(file_get_contents($path), true);
    }

    private function monday(): Carbon
    {
        return Carbon::now('Asia/Manila')->startOfWeek(Carbon::MONDAY);
    }

    private function dateFor(int $w, int $d): string
    {
        return $this->monday()->addDays($w * 7 + $d)->format('Y-m-d');
    }

    private function dateTimeFor(int $w, int $d, string $t): string
    {
        return $this->dateFor($w, $d).' '.$t.':00';
    }
}