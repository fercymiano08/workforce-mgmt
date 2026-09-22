<?php

namespace Database\Seeders;

use App\Models\Notification;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $path = database_path('mock/notifications.json');
        if (! file_exists($path)) {
            return;
        }

        $rows = json_decode(file_get_contents($path), true)['notifications'] ?? [];

        // Shift every demo timestamp forward so the newest notification lands "now".
        $max = null;
        foreach ($rows as $row) {
            $ts = strtotime($row['timestamp']);
            if ($ts && $ts > $max) {
                $max = $ts;
            }
        }
        $shiftSeconds = ($max === null) ? 0 : (time() - $max);

        foreach ($rows as $row) {
            $data = Notification::apiFillable($row);
            if (isset($data['timestamp']) && $data['timestamp']) {
                $data['timestamp'] = date('Y-m-d H:i:s', strtotime($data['timestamp']) + $shiftSeconds);
            } else {
                $data['timestamp'] = now();
            }
            Notification::updateOrCreate(['id' => $data['id']], $data);
        }

        if (filter_var(env('SEED_DEMO', true), FILTER_VALIDATE_BOOLEAN)) {
            $this->call(DemoSeeder::class);
        }
    }
}