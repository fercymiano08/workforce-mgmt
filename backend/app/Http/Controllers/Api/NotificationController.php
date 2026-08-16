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

    public function index(): JsonResponse
    {
        $records = Notification::orderBy('timestamp', 'desc')->orderBy('id')->get();

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
            ->orderBy('timestamp', 'desc')
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
            'data' => $listQuery->orderBy('timestamp', 'desc')->get()->map->toApiArray()->values(),
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
            $query->whereNull('employee_id');
            return;
        }

        $query->where('employee_id', $user?->employee_id);
    }
}
