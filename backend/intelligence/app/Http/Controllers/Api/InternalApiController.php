<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Machine-to-machine endpoints for the Intelligence service. Only peers
 * presenting the shared SERVICE_TOKEN (X-Service-Token header) may call
 * these. Intelligence owns no tables any other service depends on, so unlike
 * every other service's InternalApiController there is no snapshot() here -
 * this only receives immediate pushes into its own replica tables.
 */
class InternalApiController extends Controller
{
    public function syncEmployee(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $data = $request->all();
        if (empty($data['id'])) {
            abort(422, 'Missing employee id');
        }

        DB::table('employees')->updateOrInsert(['id' => $data['id']], $data);

        return response()->json(['data' => ['synced' => true]]);
    }

    public function syncShiftSchedules(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $rows = $request->input('rows', []);
        if (! is_array($rows) || $rows === []) {
            return response()->json(['data' => ['synced' => 0]]);
        }

        foreach ($rows as $row) {
            if (empty($row['id'])) {
                continue;
            }
            DB::table('shift_schedules')->updateOrInsert(['id' => $row['id']], $row);
        }

        return response()->json(['data' => ['synced' => count($rows)]]);
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
