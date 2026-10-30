<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;

class SystemHealthController extends Controller
{
    public function health(): JsonResponse
    {
        return response()->json(['status' => 'ok', 'service' => 'workforce-management', 'checkedAt' => now()->toISOString()]);
    }

    public function ready(): JsonResponse
    {
        try {
            DB::select('select 1');
            return response()->json(['status' => 'ready', 'checkedAt' => now()->toISOString()]);
        } catch (\Throwable $e) {
            return response()->json(['status' => 'not_ready', 'checkedAt' => now()->toISOString()], 503);
        }
    }

    /**
     * A single round trip to Postgres, timed. For a dashboard tile that polls this every few
     * seconds to draw a live latency graph - nothing here is cached, on purpose, since a cached
     * number would just be a flat line.
     */
    public function db(): JsonResponse
    {
        $start = microtime(true);

        try {
            DB::select('select 1');

            return response()->json(['data' => [
                'connected' => true,
                'latencyMs' => round((microtime(true) - $start) * 1000, 1),
                'checkedAt' => now()->toISOString(),
            ]]);
        } catch (\Throwable $e) {
            return response()->json(['data' => [
                'connected' => false,
                'latencyMs' => null,
                'checkedAt' => now()->toISOString(),
            ]]);
        }
    }
}
