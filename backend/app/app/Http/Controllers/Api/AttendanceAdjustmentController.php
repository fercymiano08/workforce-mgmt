<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Api\Concerns\GeneratesSequentialIds;
use App\Http\Controllers\Controller;
use App\Models\Attendance;
use App\Models\AttendanceAdjustment;
use App\Models\Employee;
use App\Services\AttendanceAdjustmentService;
use App\Services\AuditLogger;
use App\Services\NotificationService;
use App\Services\ShiftHours;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Corrections, inside Time & Attendance.
 *
 * The employee files one in their own words with photo proof; the Workforce Admin decides and, when approving,
 * enters the final time by hand (a manual clock-in, clock-out or shift edit). Nothing reaches payroll without that
 * decision, and every number is derived from the roster, never taken from the request.
 */
class AttendanceAdjustmentController extends Controller
{
    use GeneratesSequentialIds;

    /** Photos per request, and the largest one (after the browser has already shrunk it). */
    private const MAX_PHOTOS = 5;

    private const MAX_PHOTO_BYTES = 3_000_000;

    /** Where a notification about corrections takes each side. */
    private const ADMIN_URL = '/attendance?tab=corrections';

    private const EMPLOYEE_URL = '/my-attendance?tab=corrections';

    public function store(Request $request): JsonResponse
    {
        $actor = $request->user();
        $actorEmployeeId = $this->actorEmployeeId($request);

        $data = $request->validate([
            'employeeId' => 'required|string|max:20',
            'date' => 'required|date',
            'type' => 'required|string|in:'.implode(',', AttendanceAdjustment::TYPES),
            'claimedTime' => 'nullable|string',
            'reason' => 'required|string|min:5|max:1000',
            'proof' => 'required|array|min:1|max:'.self::MAX_PHOTOS,
            'proof.*.dataUrl' => 'required|string',
            'proof.*.name' => 'nullable|string|max:150',
            'proof.*.caption' => 'nullable|string|max:80',
        ], [
            'proof.required' => 'Attach at least one photo as proof.',
            'proof.min' => 'Attach at least one photo as proof.',
            'proof.max' => 'You can attach up to '.self::MAX_PHOTOS.' photos.',
        ]);

        // An employee may only ever correct their own record; an admin may correct anyone's.
        $this->assertMayActFor($request, $data['employeeId']);

        $dateKey = substr($data['date'], 0, 10);
        $employee = Employee::find($data['employeeId']);
        if (! $employee) {
            throw ValidationException::withMessages(['employeeId' => ['That employee does not exist.']]);
        }

        if ($windowError = AttendanceAdjustmentService::assertWithinWindow($dateKey)) {
            throw ValidationException::withMessages(['date' => [$windowError]]);
        }

        // One open request per problem per day: a second is almost always a re-send, and letting both sit would put
        // the admin in the position of choosing between duplicates.
        $alreadyOpen = AttendanceAdjustment::where('employee_id', $data['employeeId'])
            ->whereDate('date', $dateKey)
            ->where('type', $data['type'])
            ->whereIn('status', AttendanceAdjustment::OPEN_STATUSES)
            ->exists();

        if ($alreadyOpen) {
            throw ValidationException::withMessages([
                'type' => ['There is already a request waiting on this day. Please wait for it to be decided.'],
            ]);
        }

        $proof = $this->cleanProof($data['proof']);

        $attendance = Attendance::where('employee_id', $data['employeeId'])->whereDate('date', $dateKey)->first();
        $shift = AttendanceAdjustmentService::shiftFor($data['employeeId'], $dateKey);
        $claimed = isset($data['claimedTime']) ? substr($data['claimedTime'], 0, 5) : null;

        $derived = AttendanceAdjustmentService::derive($data['type'], $dateKey, $claimed, $shift, $attendance, $data['employeeId']);
        if (isset($derived['error'])) {
            throw ValidationException::withMessages(['claimedTime' => [$derived['error']]]);
        }

        $name = trim($employee->first_name.' '.$employee->last_name);
        $adjustment = AttendanceAdjustment::create([
            'id' => $this->nextIdFor(AttendanceAdjustment::class, 'ADJ'),
            'employee_id' => $data['employeeId'],
            'employee_name' => $name,
            'date' => $dateKey,
            'type' => $data['type'],
            'claimed_time' => $claimed,
            'reason' => trim($data['reason']),
            'proof' => $proof,
            'shift_start' => $derived['shift']['start'],
            'shift_end' => $derived['shift']['end'],
            'derived_hours' => $derived['hours'],
            'derived_overtime' => $derived['overtime'],
            // Frozen here, while the punch that judged the claim is still intact. Approving overwrites
            // actual_clock_out, so by the time the admin opens this the evidence would otherwise be gone.
            'corroboration' => $derived['checks'] ?? [],
            'recorded_hours' => 0,
            'status' => AttendanceAdjustment::STATUS_PENDING,
            'requested_date' => now(ShiftHours::timezone())->toDateString(),
        ]);

        AuditLogger::record(
            'attendance', 'adjustment.requested', 'attendance_adjustment', $adjustment->id,
            $actor?->name, $actorEmployeeId, null, $this->summary($adjustment),
            ['ip' => $request->ip(), 'photos' => count($proof)]
        );

        NotificationService::notifyAdmins(
            'attendance_adjustment',
            'Correction requested',
            "{$name} asked for a correction (".$this->label($adjustment->type).') on '.$adjustment->date->format('M d, Y').' with '.count($proof).' photo'.(count($proof) === 1 ? '' : 's').' as proof.',
            'medium',
            self::ADMIN_URL
        );

        return response()->json(['success' => true, 'data' => $this->summary($adjustment->fresh())], 201);
    }

    /** The employee's own requests (photos left out; they uploaded them). */
    public function mine(Request $request): JsonResponse
    {
        $employeeId = $this->actorEmployeeId($request);

        $rows = AttendanceAdjustment::where('employee_id', $employeeId)->orderByDesc('created_at')->get();

        return response()->json(['data' => $rows->map(fn (AttendanceAdjustment $a) => $this->summary($a))->all()]);
    }

    /** The admin's list: pending first, then the rest, newest first. */
    public function index(Request $request): JsonResponse
    {
        $query = AttendanceAdjustment::query()->orderByRaw("case status when 'Pending' then 0 else 1 end")->orderByDesc('created_at');

        if ($request->filled('status')) {
            $query->where('status', $request->input('status'));
        }
        if ($request->filled('type')) {
            $query->where('type', $request->input('type'));
        }

        return response()->json(['data' => $query->get()->map(fn (AttendanceAdjustment $a) => $this->summary($a))->all()]);
    }

    /** One request with everything the admin needs to decide: the photos, and the day as it stands right now. */
    public function show(string $id): JsonResponse
    {
        $adjustment = AttendanceAdjustment::find($id);
        if (! $adjustment) {
            return response()->json(['message' => 'Request not found.'], 404);
        }

        $out = $this->summary($adjustment);
        $out['proof'] = $adjustment->proof ?? [];
        $out['currentAttendance'] = Attendance::where('employee_id', $adjustment->employee_id)
            ->whereDate('date', $adjustment->date->toDateString())->first()?->toApiArray();

        return response()->json(['data' => $out]);
    }

    /**
     * What the admin's manual entry would do, before it is made: the paid hours and the overtime for the time typed,
     * or the reason it would be refused.
     */
    public function preview(Request $request, string $id): JsonResponse
    {
        $data = $request->validate(['time' => 'required|date_format:H:i']);

        $adjustment = AttendanceAdjustment::find($id);
        if (! $adjustment) {
            return response()->json(['message' => 'Request not found.'], 404);
        }

        $result = AttendanceAdjustmentService::preview($adjustment, $data['time']);

        return response()->json(['data' => isset($result['error'])
            ? ['ok' => false, 'error' => $result['error'], 'checks' => $result['checks'] ?? []]
            : ['ok' => true, 'hours' => $result['hours'], 'overtime' => $result['overtime'], 'open' => (bool) ($result['open'] ?? false), 'checks' => $result['checks'] ?? []],
        ]);
    }

    /**
     * The decision - the Workforce Admin's alone. Approving is the manual entry: the admin confirms (or corrects) the
     * time, and it is written to the attendance record by the same rules a live punch follows.
     */
    public function decide(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'decision' => 'required|in:Approved,Rejected',
            'note' => 'nullable|string|max:1000|required_if:decision,Rejected',
            'time' => 'nullable|date_format:H:i',
        ], ['note.required_if' => 'Tell the employee why the request is not approved.']);

        $adjustment = AttendanceAdjustment::find($id);
        if (! $adjustment) {
            return response()->json(['message' => 'Request not found.'], 404);
        }
        if (! $adjustment->isOpen()) {
            throw ValidationException::withMessages([
                'decision' => ['This request has already been decided ('.$adjustment->status.').'],
            ]);
        }

        $actorName = $request->user()?->name ?? 'Workforce Admin';

        if ($data['decision'] === 'Rejected') {
            $adjustment->update([
                'status' => AttendanceAdjustment::STATUS_REJECTED,
                'decided_by' => $actorName, 'decided_at' => now(), 'decision_note' => $data['note'],
            ]);
            $this->audit($request, $adjustment, 'rejected');
            $this->notifyEmployee($adjustment, false);

            return response()->json(['success' => true, 'data' => $this->summary($adjustment->fresh())]);
        }

        // The time that will be written: the one the admin typed, else the employee's claim. It is derived again from the
        // day as it stands now, so an entry that makes no sense is refused here rather than saved.
        $time = $data['time'] ?? substr((string) $adjustment->claimed_time, 0, 5);
        $check = AttendanceAdjustmentService::preview($adjustment, $time);
        if (isset($check['error'])) {
            throw ValidationException::withMessages(['time' => [$check['error']]]);
        }

        $before = Attendance::where('employee_id', $adjustment->employee_id)
            ->whereDate('date', $adjustment->date->toDateString())->first()?->toApiArray();

        $adjustment->update([
            'final_time' => $time, 'decided_by' => $actorName, 'decided_at' => now(), 'decision_note' => $data['note'] ?? null,
            'derived_hours' => $check['hours'], 'derived_overtime' => $check['overtime'],
        ]);

        $result = AttendanceAdjustmentService::apply($adjustment->fresh());

        $adjustment->update(['status' => AttendanceAdjustment::STATUS_APPROVED, 'recorded_hours' => $result['hours']]);

        $this->audit($request, $adjustment, 'approved', $before, ['finalTime' => $time, 'claimedTime' => substr((string) $adjustment->claimed_time, 0, 5)]);
        $this->notifyEmployee($adjustment, true);

        return response()->json(['success' => true, 'data' => $this->summary($adjustment->fresh())]);
    }

    /** Withdraw a request that has not been decided yet. Once decided, it is part of the record. */
    public function cancel(Request $request, string $id): JsonResponse
    {
        $adjustment = AttendanceAdjustment::find($id);
        if (! $adjustment) {
            return response()->json(['message' => 'Request not found.'], 404);
        }

        $this->assertMayActFor($request, $adjustment->employee_id);

        if (! $adjustment->isOpen()) {
            throw ValidationException::withMessages([
                'decision' => ['This request has already been decided and can no longer be withdrawn.'],
            ]);
        }

        $adjustment->update([
            'status' => AttendanceAdjustment::STATUS_CANCELLED,
            'decided_by' => $this->actorEmployeeId($request) ?? 'Employee',
            'decided_at' => now(),
        ]);
        $this->audit($request, $adjustment, 'cancelled');

        return response()->json(['success' => true, 'data' => $this->summary($adjustment->fresh())]);
    }

    // --- helpers -------------------------------------------------------------

    /** The request as the lists show it: everything except the photos themselves (they are heavy; show() has them). */
    private function summary(AttendanceAdjustment $a): array
    {
        $out = $a->toApiArray();
        $photos = $a->proof ?? [];
        unset($out['proof']);
        $out['proofCount'] = count($photos);
        $out['proofCaptions'] = array_values(array_map(fn ($p) => $p['caption'] ?? '', $photos));
        $out['recentClaimCount'] = AttendanceAdjustmentService::recentClaimCount($a->employee_id);
        $out['isPattern'] = AttendanceAdjustmentService::isPattern($a);
        // What the machine records said when the claim was filed, so a stored request is judged on
        // evidence that still exists rather than on state the approval has since changed.
        $out['checks'] = $a->corroboration ?? [];

        return $out;
    }

    /**
     * Checks every photo is a real, reasonably small image before it is kept, and keeps only what is needed. The
     * browser shrinks photos first; this is the server not taking the browser's word for it.
     *
     * @param  list<array{dataUrl: string, name?: ?string, caption?: ?string}>  $photos
     * @return list<array{name: string, mime: string, caption: string, size: int, dataUrl: string}>
     */
    private function cleanProof(array $photos): array
    {
        $clean = [];
        foreach ($photos as $i => $photo) {
            $field = 'proof.'.$i.'.dataUrl';
            if (! preg_match('#^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$#', $photo['dataUrl'], $m)) {
                throw ValidationException::withMessages([$field => ['Photo '.($i + 1).' is not a JPEG, PNG or WebP image.']]);
            }
            $bytes = base64_decode(preg_replace('/\s+/', '', $m[2]), true);
            if ($bytes === false || $bytes === '') {
                throw ValidationException::withMessages([$field => ['Photo '.($i + 1).' could not be read.']]);
            }
            if (strlen($bytes) > self::MAX_PHOTO_BYTES) {
                throw ValidationException::withMessages([$field => ['Photo '.($i + 1).' is too large. The limit is 3 MB.']]);
            }
            $info = @getimagesizefromstring($bytes);
            if ($info === false || ! in_array($info['mime'], ['image/jpeg', 'image/png', 'image/webp'], true)) {
                throw ValidationException::withMessages([$field => ['Photo '.($i + 1).' is not a real image.']]);
            }

            $clean[] = [
                'name' => trim((string) ($photo['name'] ?? '')) ?: 'photo-'.($i + 1),
                'mime' => $info['mime'],
                'caption' => trim((string) ($photo['caption'] ?? '')),
                'size' => strlen($bytes),
                'dataUrl' => 'data:'.$info['mime'].';base64,'.base64_encode($bytes),
            ];
        }

        return $clean;
    }

    private function label(string $type): string
    {
        return [
            AttendanceAdjustment::TYPE_WORKED_PAST_SHIFT => 'worked past shift',
            AttendanceAdjustment::TYPE_KIOSK_CLOCK_IN => 'kiosk failed to clock in',
            AttendanceAdjustment::TYPE_KIOSK_CLOCK_OUT => 'kiosk failed to clock out',
        ][$type] ?? $type;
    }

    private function audit(Request $request, AttendanceAdjustment $adjustment, string $event, ?array $before = null, array $meta = []): void
    {
        AuditLogger::record(
            'attendance', 'adjustment.'.$event, 'attendance_adjustment', $adjustment->id,
            $request->user()?->name, $this->actorEmployeeId($request), $before, $this->summary($adjustment->fresh()),
            ['ip' => $request->ip()] + $meta
        );
    }

    private function notifyEmployee(AttendanceAdjustment $adjustment, bool $approved): void
    {
        $when = $adjustment->date->format('M d, Y');
        $note = $adjustment->decision_note ? ' Note from HR: '.$adjustment->decision_note : '';

        NotificationService::notifyEmployee(
            $adjustment->employee_id,
            'attendance_adjustment',
            $approved ? 'Correction approved' : 'Correction not approved',
            $approved
                ? "Your correction for {$when} was approved and your attendance was updated.".$note
                : "Your correction for {$when} was not approved.".$note,
            'medium',
            self::EMPLOYEE_URL
        );
    }

    /** The employee a user record maps to; admins may act for anyone, employees only for themselves. */
    private function actorEmployeeId(Request $request): ?string
    {
        $user = $request->user();
        if (! $user || $user->role === 'Administrator') {
            return null;
        }

        return $user->employee_id
            ?? Employee::where('email', $user->email)->value('id')
            ?? (string) $user->id;
    }

    private function assertMayActFor(Request $request, string $employeeId): void
    {
        if ($request->user()?->role === 'Administrator') {
            return;
        }

        if ($this->actorEmployeeId($request) !== $employeeId) {
            throw ValidationException::withMessages([
                'employeeId' => ['You can only correct your own attendance.'],
            ]);
        }
    }
}
