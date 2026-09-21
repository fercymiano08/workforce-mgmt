<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
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
    protected array $ownedTables = ['shift_definitions', 'shift_schedules'];

    public function snapshot(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $snapshot = [];
        foreach ($this->ownedTables as $table) {
            $snapshot[$table] = DB::table($table)->orderBy('id')->get();
        }

        return response()->json(['data' => $snapshot]);
    }

    /** How many working days a range holds for one employee (work pattern minus holidays). */
    public function workingDays(Request $request, \App\Services\WorkingDays $workingDays): JsonResponse
    {
        $this->authorizeService($request);

        $data = $request->validate([
            'employeeId' => 'required|string|max:20',
            'startDate' => 'required|date',
            'endDate' => 'required|date|after_or_equal:startDate',
        ]);

        return response()->json(['data' => $workingDays->count($data['employeeId'], $data['startDate'], $data['endDate'])]);
    }

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

    protected function authorizeService(Request $request): void
    {
        $token = (string) $request->header('X-Service-Token', '');
        $expected = (string) config('svc.token', '');

        if ($expected === '' || ! hash_equals($expected, $token)) {
            abort(403, 'Unauthorized');
        }
    }
}