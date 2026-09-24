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
use App\Services\AuditLogger;
use App\Services\NotificationService;
use App\Services\ScheduleGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Validation\ValidationException;

/**
 * Automated shift scheduling, as the administrator drives it: the settings (switch, window, shift), the rules
 * it follows (who works which days, holidays, minimum coverage), "Run now", and the history of runs (each
 * can be undone). See ScheduleGenerator for the flow itself.
 */
class ScheduleRulesController extends Controller
{
    public function rules(ScheduleGenerator $generator): JsonResponse
    {
        return response()->json(['data' => [
            'automation' => $this->automation($generator),
            'patterns' => WorkPattern::orderBy('scope')->orderBy('scope_key')->get()->map->toApiArray()->values(),
            'holidays' => Holiday::orderBy('date')->get()->map->toApiArray()->values(),
            'coverage' => CoverageRule::orderBy('department')->get()->map->toApiArray()->values(),
        ]]);
    }

    /** The settings, the window's dates, and where each week of it stands (past / scheduled / not yet...). */
    private function automation(ScheduleGenerator $generator): array
    {
        $setting = ScheduleSetting::current();
        $window = $generator->window();

        return [
            'autoEnabled' => (bool) $setting->auto_enabled,
            'window' => $window['mode'],
            'range' => ['from' => $window['from'], 'to' => $window['to']],
            'firstOpenDay' => $generator->firstOpenDay(),
            'defaultWorkDays' => $setting->usualDays(),
            'shiftId' => $generator->defaultShiftId(),
            'weeks' => $generator->windowStatus(),
        ];
    }

    public function saveAutomation(Request $request, ScheduleGenerator $generator): JsonResponse
    {
        $data = $request->validate([
            'autoEnabled' => 'required|boolean',
            'window' => 'required|string|in:'.implode(',', array_keys(ScheduleGenerator::WINDOWS)),
            'defaultWorkDays' => 'required|array|min:1',
            'defaultWorkDays.*' => 'integer|between:1,7',
            'shiftId' => 'nullable|string|max:20|exists:shift_definitions,id',
        ]);

        $setting = ScheduleSetting::current();
        $before = $setting->toApiArray();
        $setting->update([
            'auto_enabled' => $data['autoEnabled'], 'window' => $data['window'],
            'default_work_days' => array_values(array_unique($data['defaultWorkDays'])),
            'shift_id' => $data['shiftId'] ?? null,
        ]);
        AuditLogger::record('scheduling', 'schedule.automation_changed', 'ScheduleSetting', '1', actor: $request->user()?->name, before: $before, after: $setting->fresh()->toApiArray());

        return response()->json(['data' => $this->automation($generator)]);
    }

    /**
     * "Run now": the same run the automatic switch performs, for every week of the window, filling any gaps.
     * With preview=true it only reports what would happen.
     */
    public function runNow(Request $request, ScheduleGenerator $generator): JsonResponse
    {
        $request->validate(['preview' => 'nullable|boolean']);
        if (! $generator->defaultShiftId()) {
            return response()->json(['message' => 'Create a shift first: there is no shift to schedule.'], 422);
        }

        return response()->json(['data' => $generator->run($request->boolean('preview'), 'run-now', $request->user()?->name ?: 'Workforce Admin')]);
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
        AuditLogger::record('scheduling', 'schedule.pattern_saved', 'WorkPattern', (string) $pattern->id, actor: $request->user()?->name, after: $pattern->toApiArray());

        return response()->json(['data' => $pattern->toApiArray()]);
    }

    public function deletePattern(Request $request, int $id): JsonResponse
    {
        $pattern = WorkPattern::findOrFail($id);
        AuditLogger::record('scheduling', 'schedule.pattern_removed', 'WorkPattern', (string) $pattern->id, actor: $request->user()?->name, before: $pattern->toApiArray());
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

        // Creating it clears the shifts already published for that day (see ScheduleCleanup), so say how many.
        $scheduledBefore = ShiftSchedule::whereDate('date', $date)->count();
        $holiday = Holiday::create(['date' => $date, 'name' => trim($data['name'])]);
        AuditLogger::record('scheduling', 'schedule.holiday_added', 'Holiday', (string) $holiday->id, actor: $request->user()?->name, after: $holiday->toApiArray());

        return response()->json(['data' => $holiday->toApiArray() + ['removedShifts' => $scheduledBefore - ShiftSchedule::whereDate('date', $date)->count()]], 201);
    }

    public function deleteHoliday(Request $request, int $id): JsonResponse
    {
        $holiday = Holiday::findOrFail($id);
        AuditLogger::record('scheduling', 'schedule.holiday_removed', 'Holiday', (string) $holiday->id, actor: $request->user()?->name, before: $holiday->toApiArray());
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
        AuditLogger::record('scheduling', 'schedule.coverage_saved', 'CoverageRule', (string) $rule->id, actor: $request->user()?->name, after: $rule->toApiArray());

        return response()->json(['data' => $rule->toApiArray()]);
    }

    // --- generation history --------------------------------------------------------------------------

    public function batches(): JsonResponse
    {
        return response()->json(['data' => ScheduleBatch::orderBy('created_at', 'desc')->orderBy('id', 'desc')->limit(30)->get()->map->toApiArray()->values()]);
    }

    /**
     * Take back a week: removes the shifts it created from tomorrow on. Today and earlier stay - people may
     * already be at work, and attendance relies on those shifts (the same "today is never touched" rule the
     * scheduling window follows).
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
        $removable = $schedules->filter(fn ($s) => $s->date->toDateString() > $today);

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
        AuditLogger::record('scheduling', 'schedule.batch_undone', 'ScheduleBatch', $batch->id, actor: $by, meta: ['removed' => $summary['removed'], 'kept' => $summary['kept']]);

        return response()->json(['data' => $batch->fresh()->toApiArray()]);
    }
}
