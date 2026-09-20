<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AuditLogger;
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
    protected array $ownedTables = ['employees', 'departments', 'roles'];

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
     * Append an audit event reported by a peer service. This is the ONLY way
     * rows reach the audit trail - the frontend and read controllers never
     * write. Validation keeps payloads bounded; before/after/meta are stored
     * verbatim as JSON snapshots for the read-only admin view.
     */
    public function recordAudit(Request $request): JsonResponse
    {
        $this->authorizeService($request);

        $data = $request->validate([
            'service' => 'required|string|max:40',
            'event' => 'required|string|max:120',
            'entityType' => 'required|string|max:40',
            'entityId' => 'nullable|string|max:40',
            'actor' => 'nullable|string|max:150',
            'actorId' => 'nullable|string|max:40',
            'before' => 'nullable|array',
            'after' => 'nullable|array',
            'meta' => 'nullable|array',
        ]);

        $event = AuditLogger::record(
            service: $data['service'],
            event: $data['event'],
            entityType: $data['entityType'],
            entityId: $data['entityId'] ?? '',
            actor: $data['actor'] ?? null,
            actorId: $data['actorId'] ?? null,
            before: $data['before'] ?? null,
            after: $data['after'] ?? null,
            meta: $data['meta'] ?? null,
        );

        return response()->json(['data' => $event->toApiArray()], 201);
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