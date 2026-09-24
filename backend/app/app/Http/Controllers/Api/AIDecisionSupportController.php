<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Leave;
use App\Models\OvertimeRequest;
use App\Models\SecurityEvent;
use App\Services\AIDecisionSupportService;
use App\Services\AuditLogger;
use App\Services\SecurityEvents;
use App\Services\SettingsUpdater;
use App\Services\NotificationService;
use App\Services\TimeOffActions;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class AIDecisionSupportController extends Controller
{
    public function insights(Request $request): JsonResponse
    {
        // ?refresh=1 (the Regenerate button) asks Gemini again instead of reusing its recent wording
        return response()->json(['data' => app(AIDecisionSupportService::class)->insights($request->boolean('refresh'))]);
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
            'resolve_all_security' => $this->resolveAllSecurity($request),
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

        if ($status === 'Flagged') {
            SecurityEvents::flagSecurityEvent($id, $request->user()?->name);
            NotificationService::notifyAdmins(
                'security_alert',
                'Kiosk Security Alert',
                'Escalated by '.($request->user()?->name ?? 'HR').": {$event->message}.",
                'high',
                '/ai-decision-support'
            );
        } else {
            SecurityEvents::resolveSecurityEvent($id, $request->user()?->name);
        }
        $this->audit($request, $status === 'Flagged' ? 'security.escalated' : 'security.resolved', 'SecurityEvent', $event->id,
            ['status' => 'Open'], ['status' => $status], ['type' => $event->type, 'employeeId' => $event->employee_id]);

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

        SettingsUpdater::updateAiInsights($key, $resolved);

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

        $before = $record->toApiArray();
        TimeOffActions::resolveLeave($id, $status, $request->user()?->name);
        $this->audit($request, 'leave.status_changed', 'Leave', $record->id, $before, $record->fresh()->toApiArray(),
            ['status' => $status, 'employeeId' => $record->employee_id, 'via' => 'AI Decision Support']);

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

        $before = $record->toApiArray();
        TimeOffActions::resolveOvertime($id, $status, $request->user()?->name);
        $this->audit($request, 'overtime.status_changed', 'OvertimeRequest', $record->id, $before, $record->fresh()->toApiArray(),
            ['status' => $status, 'employeeId' => $record->employee_id, 'was' => 'Pending', 'via' => 'AI Decision Support']);

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

    private function resolveAllSecurity(Request $request): JsonResponse
    {
        $openEvents = SecurityEvent::where('status', 'Open')->get();
        $count = $openEvents->count();

        if ($count === 0) {
            return response()->json(['success' => true, 'resolved' => 0, 'message' => 'No open security events to resolve.']);
        }

        SecurityEvents::resolveAllSecurityEvents($request->user()?->name);
        $this->audit($request, 'security.resolved_all', 'SecurityEvent', 'bulk', null, null, ['count' => $count]);

        return response()->json([
            'success' => true,
            'resolved' => $count,
            'queue' => app(AIDecisionSupportService::class)->approvalQueue(),
        ]);
    }

    /** Same trail the Leave / Overtime / Security screens leave, so a decision made here looks the same in the audit log. */
    private function audit(Request $request, string $event, string $entityType, string $entityId, ?array $before, ?array $after, array $meta): void
    {
        AuditLogger::record('timeoff', $event, $entityType, $entityId,
            actor: $request->user()?->name, actorId: $request->user()?->employee_id,
            before: $before, after: $after, meta: $meta);
    }
}
