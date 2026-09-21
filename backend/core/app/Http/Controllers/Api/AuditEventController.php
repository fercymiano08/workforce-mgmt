<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\AuditLogger;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * Administrator read-only view of the audit trail.
 *
 * Deliberately bare: filtering, search, and pagination only. There is no
 * create/update/delete surface here - those actions belong exclusively to the
 * guarded machine-to-machine endpoint, which the frontend never calls.
 */
class AuditEventController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $query = \App\Models\AuditEvent::query()->orderBy('id', 'desc');

        if ($service = (string) $request->input('service')) {
            $query->where('service', $service);
        }
        if ($event = (string) $request->input('event')) {
            $query->where('event', $event);
        }
        if ($entityType = (string) $request->input('entityType')) {
            $query->where('entity_type', $entityType);
        }
        if ($entityId = (string) $request->input('entityId')) {
            $query->where('entity_id', $entityId);
        }
        if ($actor = (string) $request->input('actor')) {
            $query->where('actor', 'ilike', '%'.$actor.'%');
        }
        // The dates are calendar days as the company sees them (Manila), but events are stored in UTC,
        // so convert the day's start and end to UTC before comparing.
        if ($from = $this->manilaDay((string) $request->input('from'))) {
            $query->where('created_at', '>=', $from->startOfDay()->utc());
        }
        if ($to = $this->manilaDay((string) $request->input('to'))) {
            $query->where('created_at', '<=', $to->endOfDay()->utc());
        }
        if ($search = (string) $request->input('search')) {
            $query->where(function ($q) use ($search): void {
                $q->where('event', 'ilike', '%'.$search.'%')
                    ->orWhere('entity_type', 'ilike', '%'.$search.'%')
                    ->orWhere('entity_id', 'ilike', '%'.$search.'%')
                    ->orWhere('actor', 'ilike', '%'.$search.'%');
            });
        }

        $perPage = min(max((int) $request->input('perPage', 25), 1), 100);
        $page = max((int) $request->input('page', 1), 1);

        $paginator = $query->paginate($perPage, ['*'], 'page', $page);

        // Headline numbers for the page (whole trail, not the current filter). Days follow Manila time.
        $manilaToday = now('Asia/Manila')->startOfDay();
        $stats = [
            'today' => \App\Models\AuditEvent::where('created_at', '>=', $manilaToday->copy()->utc())->count(),
            'week' => \App\Models\AuditEvent::where('created_at', '>=', $manilaToday->copy()->subDays(6)->utc())->count(),
            'people' => \App\Models\AuditEvent::whereNotNull('actor')->distinct()->count('actor'),
        ];

        return response()->json([
            'data' => collect($paginator->items())->map->toApiArray()->values(),
            'meta' => [
                'total' => $paginator->total(),
                'perPage' => $paginator->perPage(),
                'page' => $paginator->currentPage(),
                'lastPage' => $paginator->lastPage(),
                'services' => \App\Models\AuditEvent::query()->distinct()->pluck('service')->values(),
                'stats' => $stats,
                'requestId' => Str::uuid()->toString(),
            ],
        ]);
    }

    private function manilaDay(string $date): ?\Illuminate\Support\Carbon
    {
        if ($date === '') {
            return null;
        }
        try {
            return \Illuminate\Support\Carbon::parse($date, 'Asia/Manila');
        } catch (\Throwable) {
            return null;
        }
    }
}
