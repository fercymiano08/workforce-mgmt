<?php

namespace App\Services;

use App\Models\Attendance;
use App\Models\Timesheet;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * The life of a weekly timesheet, and the rules that keep it trustworthy.
 *
 *   Draft ──submit──▶ Submitted ──approve──▶ Approved ──export──▶ (sent to payroll)
 *     ▲                  │  └──reject──▶ Rejected ──submit──▶ Submitted
 *     └────reopen────────┴────────────────(admin, with a reason)
 *
 * - Only a FINISHED week can be submitted, approved or rejected.
 * - The employee submits (or the system does, once the deadline passes); the admin approves or rejects.
 * - A rejection needs a reason. Reopening needs a reason too and is refused once sent to payroll.
 * - Once submitted, the hours are frozen: later attendance changes only raise a warning flag.
 * - Every step is written to the timesheet's history.
 */
class TimesheetWorkflow
{
    public const TZ = 'Asia/Manila';

    /** The system submits an unsubmitted timesheet at this hour on the day after the week ends. */
    public const AUTO_SUBMIT_HOUR = 12;

    /** A submitted timesheet nobody has reviewed for this many days triggers a nudge to the admins. */
    public const NUDGE_AFTER_DAYS = 2;

    public function today(): string
    {
        return Carbon::now(self::TZ)->toDateString();
    }

    public function weekFinished(Timesheet $t): bool
    {
        return $this->today() > $t->week_end->toDateString();
    }

    /** The moment the system will submit it for the employee if they have not. */
    public function dueAt(Timesheet $t): Carbon
    {
        return Carbon::parse($t->week_end->toDateString(), self::TZ)->addDay()->setTime(self::AUTO_SUBMIT_HOUR, 0);
    }

    // --- transitions ------------------------------------------------------------------------------

    public function submit(Timesheet $t, string $by, bool $auto = false): Timesheet
    {
        if (! in_array($t->status, ['Draft', 'Rejected'], true)) {
            abort(422, 'Only a draft or a returned timesheet can be submitted.');
        }
        if (! $this->weekFinished($t)) {
            abort(422, 'This week is not over yet. You can submit the timesheet once the week has ended.');
        }
        if ($t->needs_refresh) {
            $t = app(TimesheetGenerationService::class)->refreshFigures($t);
        }

        $t->status = 'Submitted';
        $t->submitted_date = $this->today();
        $t->submitted_at = now();
        $t->submitted_by = $by;
        $t->auto_submitted = $auto;
        $t->approved_by = null;
        $t->reviewed_at = null;

        return $this->save($t, $auto ? 'auto_submitted' : 'submitted', $auto ? 'System' : $by, null);
    }

    public function approve(Timesheet $t, string $by): Timesheet
    {
        $this->requireSubmitted($t, 'approved');

        $t->status = 'Approved';
        $t->approved_by = $by;
        $t->reviewed_at = now();
        $t->status_reason = null;

        return $this->save($t, 'approved', $by, null);
    }

    public function reject(Timesheet $t, string $by, string $reason): Timesheet
    {
        $this->requireSubmitted($t, 'rejected');
        $reason = trim($reason);
        if (mb_strlen($reason) < 5) {
            abort(422, 'Please tell the employee why the timesheet is being rejected (at least a few words).');
        }

        $t->status = 'Rejected';
        $t->approved_by = $by;
        $t->reviewed_at = now();
        $t->status_reason = $reason;

        return $this->save($t, 'rejected', $by, $reason);
    }

    /** Send a submitted or approved timesheet back to the employee for correction. */
    public function reopen(Timesheet $t, string $by, string $reason): Timesheet
    {
        if (! in_array($t->status, ['Submitted', 'Approved'], true)) {
            abort(422, 'Only a submitted or approved timesheet can be reopened.');
        }
        if ($t->exported_at) {
            abort(409, 'This timesheet was already sent to payroll and can no longer be reopened.');
        }
        $reason = trim($reason);
        if (mb_strlen($reason) < 5) {
            abort(422, 'Please give a reason for reopening the timesheet.');
        }

        $t->status = 'Draft';
        $t->submitted_at = null;
        $t->submitted_by = null;
        $t->auto_submitted = false;
        $t->approved_by = null;
        $t->reviewed_at = null;
        $t->status_reason = $reason;
        $t->reminded_at = null;
        $t->nudged_at = null;
        $this->save($t, 'reopened', $by, $reason);

        // Draft again, so the hours can be brought up to date with the latest attendance.
        return app(TimesheetGenerationService::class)->refreshFigures($t->fresh());
    }

    /** @param Collection<int, Timesheet> $sheets */
    public function markExported(Collection $sheets, string $by): void
    {
        foreach ($sheets as $t) {
            $t->exported_at = now();
            $this->save($t, 'exported', $by, null);
        }
    }

    // --- helpers -----------------------------------------------------------------------------------

    private function requireSubmitted(Timesheet $t, string $verb): void
    {
        if ($t->status !== 'Submitted') {
            abort(422, "Only a submitted timesheet can be {$verb}.");
        }
        if (! $this->weekFinished($t)) {
            abort(422, 'This week is not over yet.');
        }
    }

    private function save(Timesheet $t, string $event, ?string $by, ?string $note): Timesheet
    {
        $history = $t->history ?? [];
        $history[] = ['event' => $event, 'by' => $by, 'at' => now()->toIso8601String(), 'note' => $note];
        $t->history = $history;
        $t->save();

        return $t->fresh();
    }

    // --- what the admin should look at before approving -------------------------------------------

    /**
     * Warning codes for each timesheet: zero_hours, unpaid_overtime, missing_clock_out, changed_after_submit.
     *
     * @param  Collection<int, Timesheet>  $sheets
     * @return array<string, list<string>>  keyed by timesheet id
     */
    public function flagsFor(Collection $sheets): array
    {
        if ($sheets->isEmpty()) {
            return [];
        }

        $open = Attendance::whereNotNull('clock_in')->whereNull('clock_out')
            ->whereBetween('date', [$sheets->min(fn ($t) => $t->week_start->toDateString()), $sheets->max(fn ($t) => $t->week_end->toDateString())])
            ->get(['employee_id', 'date'])
            ->groupBy('employee_id');

        $out = [];
        foreach ($sheets as $t) {
            $flags = [];
            if ((float) $t->total_hours <= 0) {
                $flags[] = 'zero_hours';
            }
            if ((float) $t->overtime_hours > (float) $t->paid_ot_hours + 0.004) {
                $flags[] = 'unpaid_overtime';
            }
            $start = $t->week_start->toDateString();
            $end = $t->week_end->toDateString();
            if (($open->get($t->employee_id) ?? collect())->contains(fn ($a) => $a->date->toDateString() >= $start && $a->date->toDateString() <= $end)) {
                $flags[] = 'missing_clock_out';
            }
            if ($t->needs_refresh) {
                $flags[] = 'changed_after_submit';
            }
            $out[$t->id] = $flags;
        }

        return $out;
    }

    /** The API shape: the row plus what the pages need to draw the workflow. */
    public function present(Timesheet $t, array $flags = []): array
    {
        $row = $t->toApiArray();
        $row['history'] ??= [];

        return $row + [
            'weekFinished' => $this->weekFinished($t),
            'dueAt' => $this->dueAt($t)->toIso8601String(),
            'flags' => $flags,
        ];
    }
}
