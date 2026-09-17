<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Setting;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Machine-to-machine endpoints. Only peers presenting the shared SERVICE_TOKEN
 * (X-Service-Token header) may call these.
 */
class InternalApiController extends Controller
{
    /** @var list<string> Tables this service owns (served to peers on request). */
    protected array $ownedTables = [];

    public function snapshot(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $snapshot = [];
        foreach ($this->ownedTables as $table) {
            $snapshot[$table] = DB::table($table)->orderBy('id')->get();
        }

        return response()->json(['data' => $snapshot]);
    }

    public function storeKiosk(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $data = $request->validate([
            'kiosk' => 'required|array',
        ]);

        $setting = Setting::query()->firstOrCreate([]);
        $setting->update(['kiosk' => $data['kiosk']]);

        return response()->json(['data' => ['kiosk' => $setting->kiosk]]);
    }

    public function updateAiInsights(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $data = $request->validate([
            'key' => 'required|string',
            'resolved' => 'required|boolean',
        ]);

        $setting = Setting::query()->firstOrCreate([]);
        $keys = array_values(array_unique((array) ($setting->ai_resolved_insights ?? [])));

        if ($data['resolved']) {
            if (! in_array($data['key'], $keys, true)) {
                $keys[] = $data['key'];
            }
        } else {
            $keys = array_values(array_diff($keys, [$data['key']]));
        }

        $setting->update(['ai_resolved_insights' => $keys]);

        return response()->json(['data' => ['ai_resolved_insights' => $setting->ai_resolved_insights]]);
    }

    protected function authorizeService(Request $request): void
    {
        $token = (string) $request->header('X-Service-Token', '');
        $expected = (string) config('svc.token', '');

        if ($expected === '' || ! hash_equals($expected, $token)) {
            abort(403, 'Unauthorized');
        }
    }
}