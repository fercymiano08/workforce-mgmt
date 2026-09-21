<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use App\Services\AuditClient;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class SettingsController extends Controller
{
    // 'profile', 'notifications', and 'security' columns still exist on this
    // table but are intentionally unused - Setting is a single global row,
    // so it can't represent per-user data. Real self-service profile data
    // now lives on the Employee record itself (see EmployeeController's
    // myProfile/updateMyProfile). Nothing reads or writes those three
    // columns anymore; left in place rather than migrated away.
    private const WRITABLE_SECTIONS = ['company', 'system', 'kiosk'];

    public function get(): JsonResponse
    {
        $settings = Setting::query()->firstOrCreate([]);

        return response()->json(['data' => $settings->toApiArray()]);
    }

    public function update(Request $request): JsonResponse
    {
        $settings = Setting::query()->firstOrCreate([]);

        $fill = [];
        foreach (self::WRITABLE_SECTIONS as $section) {
            if ($request->has($section)) {
                $fill[$section] = $request->input($section);
            }
        }

        $before = $settings->toApiArray();
        $settings->update($fill);

        // Company, system and kiosk rules drive pay, lunch, attendance and security: every change is on the record.
        $after = $settings->fresh()->toApiArray();
        $changed = array_keys(array_filter($fill, fn ($value, $section) => ($before[$section] ?? null) != ($after[$section] ?? null), ARRAY_FILTER_USE_BOTH));
        if ($changed) {
            AuditClient::record('settings.updated', 'Setting', (string) $settings->getKey(),
                actor: $request->user()?->name, actorId: $request->user()?->employee_id,
                before: array_intersect_key($before, array_flip($changed)), after: array_intersect_key($after, array_flip($changed)),
                meta: ['sections' => $changed]);
        }

        return response()->json(['data' => $settings->fresh()->toApiArray()]);
    }
}
