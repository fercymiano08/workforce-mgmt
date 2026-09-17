<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Machine-to-machine endpoints for the Communications service. Only peers
 * presenting the shared SERVICE_TOKEN (X-Service-Token header) may call these.
 */
class InternalApiController extends Controller
{
    /** @var list<string> Tables this service owns (served to peers on request). */
    protected array $ownedTables = ['notifications'];

    public function snapshot(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $snapshot = [];
        foreach ($this->ownedTables as $table) {
            $snapshot[$table] = DB::table($table)->orderBy('id')->get();
        }

        return response()->json(['data' => $snapshot]);
    }

    /**
     * Peer services push notifications here over HTTP instead of writing
     * directly to this service's database. employeeId of null means the row
     * targets every Administrator (the admin inbox). Non-null targets that
     * single employee.
     */
    public function storeNotification(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $data = NotificationService::create(Notification::apiFillable($request->validate([
            'type' => 'required|string|max:50',
            'title' => 'required|string|max:150',
            'message' => 'required|string',
            'employeeId' => 'nullable|string|max:20',
            'priority' => 'nullable|string|max:20',
            'actionUrl' => 'nullable|string|max:255',
        ])));

        return response()->json(['data' => $data->toApiArray()], 201);
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