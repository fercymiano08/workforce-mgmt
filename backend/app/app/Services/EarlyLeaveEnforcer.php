<?php

namespace App\Services;

use App\Models\EarlyClockOut;
use Illuminate\Support\Carbon;

/**
 * Turns an early clock-out from a self-declared claim into something that is
 * checked. A kiosk cannot know whether "I'm sick" is true, so instead of trusting
 * the reason the system:
 *
 *   1. counts how many early clock-outs the person already has in the rolling
 *      window - once the free allowance is used up, the next one is automatically
 *      UNPAID (unexcused), with no need to wait for HR;
 *   2. requires proof for a SICK claim (a medical certificate) within a deadline,
 *      or the record becomes unexcused automatically;
 *   3. alerts the Workforce Admins about EVERY early clock-out, with how many the
 *      person has had, so a human can follow up the same day;
 *   4. flags a copycat pattern - several people leaving early the same day with
 *      the same reason.
 *
 * The punch itself is never refused (nobody is trapped at the door); only its
 * consequence changes.
 */
class EarlyLeaveEnforcer
{
    public function __construct(private readonly EarlyLeavePolicy $policy)
    {
    }

    /** First day of the rolling window that ends on $date. */
    public function windowStart(string $date): string
    {
        return Carbon::parse($date)->subDays(max($this->policy->windowDays(), 1) - 1)->toDateString();
    }

    /** Early clock-outs the person already has in the window ending on $date (excluding one record). */
    public function priorCount(string $employeeId, string $date, ?string $exceptId = null): int
    {
        return EarlyClockOut::where('employee_id', $employeeId)
            ->whereDate('date', '>=', $this->windowStart($date))
            ->whereDate('date', '<=', $date)
            ->when($exceptId, fn ($q) => $q->where('id', '!=', $exceptId))
            ->count();
    }

    /** What the kiosk shows before the employee picks a reason. */
    public function allowanceFor(string $employeeId, string $date): array
    {
        return [
            'used' => $this->priorCount($employeeId, $date),
            'allowed' => $this->policy->allowedCount(),
            'windowDays' => $this->policy->windowDays(),
            'certificateHours' => $this->policy->certificateHours(),
        ];
    }

    /**
     * Apply the rules to a freshly recorded early clock-out.
     *
     * @return array<string, mixed> summary for the kiosk's success screen
     */
    public function applyAtPunch(EarlyClockOut $record): array
    {
        $date = $record->date->toDateString();
        $prior = $this->priorCount($record->employee_id, $date, $record->id);
        $allowed = $this->policy->allowedCount();
        $windowDays = $this->policy->windowDays();
        $nth = $prior + 1;
        $autoUnpaid = $prior >= $allowed;

        $updates = [];

        if ($autoUnpaid) {
            $updates['classification'] = 'UNPAID';
            $updates['classified_by'] = 'Policy (automatic)';
            $updates['classified_at'] = now();
            $updates['classification_note'] = "Unexcused automatically: this is early clock-out #{$nth} within {$windowDays} days; the free allowance is {$allowed}.";
        }

        $needsProof = $record->reason_code === 'SICK';
        if ($needsProof) {
            $updates['reason_status'] = 'CERTIFICATE_REQUIRED';
            $updates['proof_due_at'] = now()->addHours($this->policy->certificateHours());
        }

        if ($updates !== []) {
            $record->update($updates);
        }

        $this->notifyAdmins($record, $nth, $allowed, $windowDays, $autoUnpaid);
        $this->notifyEmployee($record, $nth, $allowed, $windowDays, $autoUnpaid, $needsProof);
        $this->flagCopycatPattern($record);

        return [
            'classification' => $record->fresh()->classification,
            'autoUnpaid' => $autoUnpaid,
            'position' => $nth,
            'allowed' => $allowed,
            'windowDays' => $windowDays,
            'proofRequired' => $needsProof,
            'proofDueAt' => $record->fresh()->proof_due_at?->toIso8601String(),
            'certificateHours' => $this->policy->certificateHours(),
        ];
    }

    /** Called on a schedule: SICK records whose proof deadline passed with nothing attached. */
    public function expireOverdueCertificates(): int
    {
        $expired = 0;

        EarlyClockOut::where('reason_status', 'CERTIFICATE_REQUIRED')
            ->whereNotNull('proof_due_at')
            ->where('proof_due_at', '<', now())
            ->where('classification', 'PENDING_REVIEW')
            ->get()
            ->each(function (EarlyClockOut $record) use (&$expired): void {
                if (! empty($record->proof)) {
                    return;
                }

                $record->update([
                    'classification' => 'UNPAID',
                    'classified_by' => 'Policy (automatic)',
                    'classified_at' => now(),
                    'reason_status' => 'CERTIFICATE_OVERDUE',
                    'classification_note' => "Unexcused automatically: no medical certificate was submitted within {$this->policy->certificateHours()} hours.",
                ]);

                NotificationService::notifyEmployee(
                    $record->employee_id,
                    'early_leave_auto_unpaid',
                    'Early Clock-Out Not Excused',
                    'Your SICK early clock-out on '.$record->date->format('M d, Y').' was not excused because no medical certificate was submitted in time.',
                    'high',
                    '/my-attendance'
                );
                NotificationService::notifyAdmins(
                    'early_leave_auto_unpaid',
                    'Sick Early Clock-Out Unexcused',
                    "{$record->employee_name} ({$record->employee_id}) did not submit a medical certificate for the SICK early clock-out on ".$record->date->format('M d, Y').' - it was marked unexcused automatically.',
                    'medium',
                    '/attendance?view=early'
                );

                $expired++;
            });

        return $expired;
    }

    private function notifyAdmins(EarlyClockOut $record, int $nth, int $allowed, int $windowDays, bool $autoUnpaid): void
    {
        $reason = $record->reason_code ? str_replace('_', ' ', $record->reason_code) : 'no reason';
        $free = $autoUnpaid ? 'over the free allowance of '.$allowed : 'within the free allowance of '.$allowed;

        NotificationService::notifyAdmins(
            'early_clock_out',
            'Early Clock Out',
            ($record->employee_name ?? 'An employee').' clocked out early at '.$record->actual_clock_out_time
                .' ('.$reason.'). Early clock-out #'.$nth.' in '.$windowDays.' days, '.$free.'.'
                .($autoUnpaid ? ' Marked unexcused automatically.' : ''),
            $autoUnpaid ? 'high' : 'medium',
            '/attendance?view=early'
        );
    }

    private function notifyEmployee(EarlyClockOut $record, int $nth, int $allowed, int $windowDays, bool $autoUnpaid, bool $needsProof): void
    {
        if ($autoUnpaid) {
            NotificationService::notifyEmployee(
                $record->employee_id,
                'early_leave_auto_unpaid',
                'Early Clock-Out Not Excused',
                "This was early clock-out #{$nth} within {$windowDays} days (free allowance: {$allowed}), so it was recorded as unexcused.",
                'high',
                '/my-attendance'
            );
        }

        if ($needsProof) {
            NotificationService::notifyEmployee(
                $record->employee_id,
                'early_leave_certificate_required',
                'Medical Certificate Required',
                'Please upload a medical certificate for your SICK early clock-out within '.$this->policy->certificateHours()
                    .' hours (My Attendance > Early Clock Outs), or it will not be excused.',
                'high',
                '/my-attendance'
            );
        }
    }

    /** Several people leaving early the same day with the same reason deserves a human look. */
    private function flagCopycatPattern(EarlyClockOut $record): void
    {
        if (! $record->reason_code) {
            return;
        }

        $sameDay = EarlyClockOut::whereDate('date', $record->date->toDateString())
            ->where('reason_code', $record->reason_code)
            ->count();

        if ($sameDay === 3) {
            $reason = str_replace('_', ' ', $record->reason_code);
            NotificationService::notifyAdmins(
                'early_clock_out_pattern',
                'Possible Early-Leave Pattern',
                "3 employees have clocked out early today citing {$reason}. Worth verifying - the same excuse may be spreading.",
                'high',
                '/attendance?view=early'
            );
        }
    }
}
