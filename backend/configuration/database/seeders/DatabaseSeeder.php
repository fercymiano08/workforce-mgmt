<?php

namespace Database\Seeders;

use App\Models\Setting;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $path = database_path('mock/settings.json');
        $data = file_exists($path) ? json_decode(file_get_contents($path), true) : [];
        $settings = $data['settings'] ?? [];

        $fields = [
            'profile' => $settings['profile'] ?? null,
            'appearance' => $settings['appearance'] ?? null,
            'notifications' => $settings['notifications'] ?? null,
            'security' => $settings['security'] ?? null,
            'system' => $settings['system'] ?? null,
        ];

        foreach (['company', 'kiosk', 'ai_resolved_insights'] as $section) {
            if (isset($settings[$section])) {
                $fields[$section] = $settings[$section];
            }
        }

        Setting::updateOrCreate(['id' => 1], $fields);
    }
}