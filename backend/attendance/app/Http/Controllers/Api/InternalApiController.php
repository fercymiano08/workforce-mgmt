<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\SecurityEvent;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Machine-to-machine endpoints for the Attendance service. Only peers
 * presenting the shared SERVICE_TOKEN (X-Service-Token header) may call these.
 * resolveSecurityEvent exists so the AI (intelligence) service can clear a
 * flagged security event over HTTP without DB access here.
 */
class InternalApiController extends Controller
{
    /** @var list<string> Tables this service owns (served to peers on request). */
    protected array $ownedTables = ['attendance', 'security_events'];

    public function snapshot(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $snapshot = [];
        foreach ($this->ownedTables as $table) {
            $snapshot[$table] = DB::table($table)->orderBy('id')->get();
        }

        return response()->json(['data' => $snapshot]);
    }

    public function resolveSecurityEvent(Request $request, string $id): JsonResponse
    {
        $this->authorizeService($request);

        $event = SecurityEvent::findOrFail($id);
        $data = $request->validate([
            'resolvedBy' => 'nullable|string|max:100',
        ]);

        $event->status = 'Resolved';
        $event->resolved_at = now();
        $event->resolved_by = $data['resolvedBy'] ?? 'Workforce AI';
        $event->save();

        return response()->json(['data' => $event->toApiArray()]);
    }

    public function flagSecurityEvent(Request $request, string $id): JsonResponse
    {
        $this->authorizeService($request);

        $event = SecurityEvent::findOrFail($id);
        $data = $request->validate([
            'resolvedBy' => 'nullable|string|max:100',
        ]);

        $event->status = 'Flagged';
        $event->resolved_at = now();
        $event->resolved_by = $data['resolvedBy'] ?? 'Workforce AI';
        $event->save();

        return response()->json(['data' => $event->toApiArray()]);
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

    public function resolveAllSecurityEvents(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $data = $request->validate([
            'resolvedBy' => 'nullable|string|max:100',
        ]);

        $count = SecurityEvent::where('status', 'Open')
            ->orWhere('status', 'Flagged')
            ->get()
            ->each(function (SecurityEvent $event) use ($data): void {
                $event->status = 'Resolved';
                $event->resolved_at = now();
                $event->resolved_by = $data['resolvedBy'] ?? 'Workforce AI';
                $event->save();
            })->count();

        return response()->json(['data' => ['resolved' => $count]]);
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