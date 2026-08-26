<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Leave;
use App\Models\OvertimeRequest;
use App\Models\SecurityEvent;
use App\Services\AIDecisionSupportService;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AIDecisionSupportController extends Controller
{
    public function insights(): JsonResponse
    {
        return response()->json(['data' => app(AIDecisionSupportService::class)->insights()]);
    }

    public function action(Request $request): JsonResponse
    {
        $request->validate([
            'action' => 'required|string|max:60',
            'id' => 'nullable|string|max:30',
            'key' => 'nullable|string|max:160',
        ]);

        return match ($request->input('action')) {
            'approve_leave' => $this->resolveLeave($request, 'Approved'),
            'reject_leave' => $this->resolveLeave($request, 'Rejected'),
            'approve_overtime' => $this->resolveOvertime($request, 'Approved'),
            'reject_overtime' => $this->resolveOvertime($request, 'Rejected'),
            'resolve_security_event' => $this->resolveSecurityEvent($request, 'Resolved'),
            'flag_security_event' => $this->resolveSecurityEvent($request, 'Flagged'),
            'resolve_insight' => $this->toggleInsightResolution($request, true),
            'unresolve_insight' => $this->toggleInsightResolution($request, false),
            'resolve_all_security' => $this->resolveAllSecurity(),
            default => response()->json(['message' => 'Unsupported AI action.'], 422),
        };
    }

    private function resolveSecurityEvent(Request $request, string $status): JsonResponse
    {
        $id = $request->input('id');
        if (! is_string($id) || trim($id) === '') {
            return response()->json(['message' => 'A request id is required.'], 422);
        }

        $event = SecurityEvent::find($id);
        if (! $event || $event->status !== 'Open') {
            return response()->json(['message' => 'Security event not found or already resolved.'], 404);
        }

        $event->update([
            'status' => $status,
            'resolved_at' => now(),
            'resolved_by' => $request->user()?->name,
        ]);

        if ($status === 'Flagged') {
            NotificationService::notifyAdmins(
                'security_alert',
                'Kiosk Security Alert',
                "HR escalated a security event: {$event->message}.",
                'high',
                '/analytics/ai'
            );
        }

        return response()->json([
            'success' => true,
            'action' => $status === 'Resolved' ? 'resolved' : 'flagged',
            'id' => $event->id,
            'queue' => app(AIDecisionSupportService::class)->approvalQueue(),
        ]);
    }

    private function toggleInsightResolution(Request $request, bool $resolved): JsonResponse
    {
        $key = $request->input('key');
        if (! is_string($key) || trim($key) === '') {
            return response()->json(['message' => 'Insight key is required.'], 422);
        }

        app(AIDecisionSupportService::class)->setInsightResolved($key, $resolved);

        return response()->json(['success' => true, 'resolved' => $resolved, 'key' => $key]);
    }

    private function resolveLeave(Request $request, string $status): JsonResponse
    {
        $id = $request->input('id');
        if (! is_string($id) || trim($id) === '') {
            return response()->json(['message' => 'A request id is required.'], 422);
        }

        $record = Leave::find($id);
        if (! $record || $record->status !== 'Pending') {
            return response()->json(['message' => 'Leave request not found or already resolved.'], 404);
        }

        $record->update(['status' => $status, 'approved_by' => $request->user()?->name]);

        if ($status === 'Approved') {
            NotificationService::notifyEmployee(
                $record->employee_id,
                'leave_approved',
                'Leave Approved',
                "Your {$record->leave_type} leave (".$record->start_date->format('M d').' – '.$record->end_date->format('M d').') has been approved.',
                'medium',
                '/leave'
            );
        } else {
            NotificationService::notifyEmployee(
                $record->employee_id,
                'leave_rejected',
                'Leave Rejected',
                "Your {$record->leave_type} leave (".$record->start_date->format('M d').' – '.$record->end_date->format('M d').') has been rejected.',
                'high',
                '/leave'
            );
        }

        return response()->json([
            'success' => true,
            'action' => $status === 'Approved' ? 'approved' : 'rejected',
            'id' => $record->id,
            'queue' => app(AIDecisionSupportService::class)->approvalQueue(),
        ]);
    }

    private function resolveOvertime(Request $request, string $status): JsonResponse
    {
        $id = $request->input('id');
        if (! is_string($id) || trim($id) === '') {
            return response()->json(['message' => 'A request id is required.'], 422);
        }

        $record = OvertimeRequest::find($id);
        if (! $record || $record->status !== 'Pending') {
            return response()->json(['message' => 'Overtime request not found or already resolved.'], 404);
        }

        $record->update([
            'status' => $status,
            'approved_by' => $request->user()?->name,
            'approved_hours' => $status === 'Approved' ? $record->expected_hours : null,
            'approved_at' => $status === 'Approved' ? now() : null,
        ]);

        if ($status === 'Approved') {
            NotificationService::notifyEmployee(
                $record->employee_id,
                'overtime_approved',
                'Overtime Approved',
                'Your overtime request for '.$record->date->format('M d, Y').' has been approved.',
                'medium',
                '/attendance'
            );
        } else {
            NotificationService::notifyEmployee(
                $record->employee_id,
                'overtime_rejected',
                'Overtime Rejected',
                'Your overtime request for '.$record->date->format('M d, Y').' has been rejected.',
                'high',
                '/attendance'
            );
        }

        return response()->json([
            'success' => true,
            'action' => $status === 'Approved' ? 'approved' : 'rejected',
            'id' => $record->id,
            'queue' => app(AIDecisionSupportService::class)->approvalQueue(),
        ]);
    }

    private function resolveAllSecurity(): JsonResponse
    {
        $openEvents = SecurityEvent::where('status', 'Open')->get();
        $count = $openEvents->count();

        if ($count === 0) {
            return response()->json(['success' => true, 'resolved' => 0, 'message' => 'No open security events to resolve.']);
        }

        $openEvents->each(function (SecurityEvent $event) {
            $event->update([
                'status' => 'Resolved',
                'resolved_at' => now(),
                'resolved_by' => 'AI Decision Support (bulk)',
            ]);
        });

        return response()->json([
            'success' => true,
            'resolved' => $count,
            'queue' => app(AIDecisionSupportService::class)->approvalQueue(),
        ]);
    }
}
