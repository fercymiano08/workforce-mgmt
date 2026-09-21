<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\CoverageRule;
use App\Models\Holiday;
use App\Models\ScheduleBatch;
use App\Models\ScheduleBatchItem;
use App\Models\ScheduleSetting;
use App\Models\ShiftSchedule;
use App\Models\WorkPattern;
use App\Services\AuditClient;
use App\Services\NotificationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * The rules automatic scheduling follows, all editable by the administrator: whether it runs and when, who
 * works which days, holidays, minimum coverage - plus the history of generation runs (each can be undone).
 */
class ScheduleRulesController extends Controller
{
    public function rules(): JsonResponse
    {
        return response()->json(['data' => [
            'automation' => ScheduleSetting::current()->toApiArray(),
            'patterns' => WorkPattern::orderBy('scope')->orderBy('scope_key')->get()->map->toApiArray()->values(),
            'holidays' => Holiday::orderBy('date')->get()->map->toApiArray()->values(),
            'coverage' => CoverageRule::orderBy('department')->get()->map->toApiArray()->values(),
        ]]);
    }

    public function saveAutomation(Request $request): JsonResponse
    {
        $data = $request->validate([
            'autoEnabled' => 'required|boolean',
            'runDay' => 'required|integer|between:1,7',
            'runHour' => 'required|integer|between:0,23',
            'weeksAhead' => 'required|integer|between:1,4',
            'defaultWorkDays' => 'required|array|min:1',
            'defaultWorkDays.*' => 'integer|between:1,7',
            'shiftId' => 'nullable|string|max:20|exists:shift_definitions,id',
        ]);

        $setting = ScheduleSetting::current();
        $before = $setting->toApiArray();
        $setting->update([
            'auto_enabled' => $data['autoEnabled'], 'run_day' => $data['runDay'], 'run_hour' => $data['runHour'],
            'weeks_ahead' => $data['weeksAhead'], 'default_work_days' => array_values(array_unique($data['defaultWorkDays'])),
            'shift_id' => $data['shiftId'] ?? null,
        ]);
        AuditClient::record('schedule.automation_changed', 'ScheduleSetting', '1', actor: $request->user()?->name, before: $before, after: $setting->fresh()->toApiArray());

        return response()->json(['data' => $setting->fresh()->toApiArray()]);
    }

    public function savePattern(Request $request): JsonResponse
    {
        $data = $request->validate([
            'scope' => 'required|in:department,employee',
            'key' => 'required|string|max:100',
            'workDays' => 'required|array|min:1',
            'workDays.*' => 'integer|between:1,7',
        ]);

        $pattern = WorkPattern::updateOrCreate(
            ['scope' => $data['scope'], 'scope_key' => $data['key']],
            ['work_days' => array_values(array_unique(array_map('intval', $data['workDays'])))]
        );
        AuditClient::record('schedule.pattern_saved', 'WorkPattern', (string) $pattern->id, actor: $request->user()?->name, after: $pattern->toApiArray());

        return response()->json(['data' => $pattern->toApiArray()]);
    }

    public function deletePattern(Request $request, int $id): JsonResponse
    {
        $pattern = WorkPattern::findOrFail($id);
        AuditClient::record('schedule.pattern_removed', 'WorkPattern', (string) $pattern->id, actor: $request->user()?->name, before: $pattern->toApiArray());
        $pattern->delete();

        return response()->json(['success' => true]);
    }

    public function addHoliday(Request $request): JsonResponse
    {
        $data = $request->validate(['date' => 'required|date', 'name' => 'required|string|max:120']);
        $date = Carbon::parse($data['date'])->toDateString();
        if (Holiday::whereDate('date', $date)->exists()) {
            throw ValidationException::withMessages(['date' => ['That day is already a holiday.']]);
        }

        $holiday = Holiday::create(['date' => $date, 'name' => trim($data['name'])]);
        AuditClient::record('schedule.holiday_added', 'Holiday', (string) $holiday->id, actor: $request->user()?->name, after: $holiday->toApiArray());

        return response()->json(['data' => $holiday->toApiArray()], 201);
    }

    public function deleteHoliday(Request $request, int $id): JsonResponse
    {
        $holiday = Holiday::findOrFail($id);
        AuditClient::record('schedule.holiday_removed', 'Holiday', (string) $holiday->id, actor: $request->user()?->name, before: $holiday->toApiArray());
        $holiday->delete();

        return response()->json(['success' => true]);
    }

    /** minStaff 0 removes the rule. */
    public function saveCoverage(Request $request): JsonResponse
    {
        $data = $request->validate(['department' => 'required|string|max:100', 'minStaff' => 'required|integer|min:0|max:500']);

        if ($data['minStaff'] === 0) {
            CoverageRule::where('department', $data['department'])->delete();

            return response()->json(['data' => null]);
        }
        $rule = CoverageRule::updateOrCreate(['department' => $data['department']], ['min_staff' => $data['minStaff']]);
        AuditClient::record('schedule.coverage_saved', 'CoverageRule', (string) $rule->id, actor: $request->user()?->name, after: $rule->toApiArray());

        return response()->json(['data' => $rule->toApiArray()]);
    }

    // --- generation history --------------------------------------------------------------------------

    public function batches(): JsonResponse
    {
        return response()->json(['data' => ScheduleBatch::orderBy('created_at', 'desc')->orderBy('id', 'desc')->limit(30)->get()->map->toApiArray()->values()]);
    }

    /**
     * Take back a generation: removes the shifts it created that have not happened yet (today and later).
     * Shifts on days that already passed stay, because attendance may already rely on them.
     */
    public function undoBatch(Request $request, string $id): JsonResponse
    {
        $batch = ScheduleBatch::find($id);
        if (! $batch) {
            return response()->json(['message' => 'Generation not found'], 404);
        }
        if ($batch->status === 'Undone') {
            return response()->json(['message' => 'This generation was already undone.'], 409);
        }

        $today = Carbon::now('Asia/Manila')->toDateString();
        $schedules = ShiftSchedule::whereIn('id', ScheduleBatchItem::where('batch_id', $batch->id)->pluck('schedule_id'))->get();
        $removable = $schedules->filter(fn ($s) => $s->date->toDateString() >= $today);

        $perEmployee = $removable->groupBy('employee_id')->map->count();
        ShiftSchedule::whereIn('id', $removable->pluck('id'))->delete();
        ScheduleBatchItem::where('batch_id', $batch->id)->whereIn('schedule_id', $removable->pluck('id'))->delete();

        $summary = $batch->summary ?? [];
        $summary['removed'] = $removable->count();
        $summary['kept'] = $schedules->count() - $removable->count();
        $by = $request->user()?->name ?: 'Workforce Admin';
        $batch->update(['status' => 'Undone', 'undone_at' => now(), 'undone_by' => $by, 'summary' => $summary]);

        foreach ($perEmployee as $employeeId => $count) {
            NotificationService::notifyEmployee(
                $employeeId, 'schedule_change', 'Schedule Withdrawn',
                "{$count} generated shift".($count === 1 ? ' was' : 's were').' withdrawn from your schedule.',
                'low', '/my-schedule'
            );
        }
        AuditClient::record('schedule.batch_undone', 'ScheduleBatch', $batch->id, actor: $by, meta: ['removed' => $summary['removed'], 'kept' => $summary['kept']]);

        return response()->json(['data' => $batch->fresh()->toApiArray()]);
    }
}
