<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\AuthorizesEmployeeScope;
use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Http\Controllers\Controller;
use App\Models\Notification;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class NotificationController extends Controller
{
    use AuthorizesEmployeeScope, GeneratesSequentialIds;

    /**
     * A notification with an employee_id was sent TO that employee, so they see all of it: outcomes,
     * reminders, shift changes, clock-in/out confirmations, certificate deadlines. What is meant for the
     * admins has no employee_id and is never returned to an employee. (This used to be a short allow-list
     * of eight types, which silently hid every newer employee notification.) Legacy 'employee_added'
     * rows are hidden everywhere: account creation is no longer announced.
     */
    private const RETIRED_TYPES = ['employee_added'];

    // The bell is polled every 30s by every open tab, so only the newest are sent.
    private const LIST_LIMIT = 200;

    public function index(): JsonResponse
    {
        $records = Notification::whereNull('employee_id')
            ->whereNotIn('type', self::RETIRED_TYPES)
            ->orderBy('timestamp', 'desc')
            ->orderBy('id')
            ->limit(self::LIST_LIMIT)
            ->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = Notification::apiFillable($request->validate([
            'type' => 'required|string|max:50',
            'title' => 'required|string|max:150',
            'message' => 'required|string',
            'employeeId' => 'nullable|string|max:20',
            'priority' => 'nullable|string|max:20',
            'actionUrl' => 'nullable|string|max:255',
        ]));

        $record = NotificationService::create($data);

        return response()->json(['data' => $record->toApiArray()], 201);
    }

    public function destroy(Request $request, string $id): JsonResponse
    {
        $record = Notification::find($id);
        if (! $record) {
            return response()->json(['message' => 'Notification not found'], 404);
        }

        $this->assertNotificationOwner($request, $record);
        $record->delete();

        return response()->json(['success' => true]);
    }

    public function show(Request $request, string $id): JsonResponse
    {
        $record = Notification::find($id);
        if (! $record) {
            return response()->json(['message' => 'Notification not found'], 404);
        }

        $this->assertNotificationOwner($request, $record);

        return response()->json(['data' => $record->toApiArray()]);
    }

    public function byEmployee(Request $request, string $employeeId): JsonResponse
    {
        $this->assertSelfOrAdmin($request, $employeeId);

        $records = Notification::where('employee_id', $employeeId)
            ->whereNotIn('type', self::RETIRED_TYPES)
            ->orderBy('timestamp', 'desc')
            ->limit(self::LIST_LIMIT)
            ->get();

        return response()->json(['data' => $records->map->toApiArray()->values()]);
    }

    public function markAsRead(Request $request, string $id): JsonResponse
    {
        $record = Notification::find($id);
        if (! $record) {
            return response()->json(['message' => 'Notification not found'], 404);
        }

        $this->assertNotificationOwner($request, $record);
        $record->update(['read' => true]);

        return response()->json(['data' => $record->fresh()->toApiArray()]);
    }

    public function markAllAsRead(Request $request): JsonResponse
    {
        $query = Notification::where('read', false);
        $this->scopeToCaller($request, $query);
        $query->update(['read' => true]);

        $listQuery = Notification::query();
        $this->scopeToCaller($request, $listQuery);

        return response()->json([
            'data' => $listQuery->orderBy('timestamp', 'desc')->limit(self::LIST_LIMIT)->get()->map->toApiArray()->values(),
        ]);
    }

    public function unreadCount(Request $request): JsonResponse
    {
        $query = Notification::where('read', false);
        $this->scopeToCaller($request, $query);

        return response()->json(['count' => $query->count()]);
    }

    /**
     * Admin-targeted notifications have a null employee_id (fanned out to
     * every Administrator equally); employee-targeted ones carry that
     * employee's id. Abort unless the caller may see this particular row.
     */
    private function assertNotificationOwner(Request $request, Notification $record): void
    {
        $user = $request->user();
        $isAdmin = $user?->role === 'Administrator';

        if ($record->employee_id === null) {
            if (! $isAdmin) {
                abort(403, 'You are not authorized to access this resource.');
            }
            return;
        }

        if (! $isAdmin && $record->employee_id !== $user?->employee_id) {
            abort(403, 'You are not authorized to access this resource.');
        }
    }

    private function scopeToCaller(Request $request, $query): void
    {
        $user = $request->user();
        if ($user?->role === 'Administrator') {
            $query->whereNull('employee_id')
                ->whereNotIn('type', self::RETIRED_TYPES);
            return;
        }

        $query->where('employee_id', $user?->employee_id)
            ->whereNotIn('type', self::RETIRED_TYPES);
    }
}
