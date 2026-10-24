// Daily-level exception flags for a single attendance record.
//
// The timesheet pages already had a period-level flag system (utils/timesheetWorkflow.js:
// zero_hours / unpaid_overtime / missing_clock_out / changed_after_submit). These are the DAILY
// equivalents for the Time & Attendance screens, composed from figures the backend already stores
// and returns on every attendance row (status, late_minutes, undertime_minutes, clock in/out) - so
// no backend change is needed to surface them.

export const ATTENDANCE_FLAG_META = {
    missing_clock_out: { label: 'Missing clock-out', tone: 'amber' },
    late: { label: 'Late', tone: 'red' },
    early: { label: 'Early', tone: 'amber' },
};

/**
 * Daily exception flags for one attendance record, in a stable display order.
 *
 * - missing_clock_out: clocked in but never clocked out (incl. still-in-progress rows).
 * - late: the day is flagged Late; the detail carries the real late figure in minutes.
 * - early: the person left before the shift ended (undertime minutes > 0).
 *
 * Overtime alerts (unauthorized / overrun) are intentionally NOT re-flagged here - the HR admin
 * overtime tab and the employee overtime tab already render those from overtimeReconciliation.
 */
export function attendanceFlagsFor(a) {
    if (!a) return [];

    const flags = [];

    if (a.clockIn && !a.clockOut) {
        const meta = ATTENDANCE_FLAG_META.missing_clock_out;
        flags.push({ key: 'missing_clock_out', tone: meta.tone, label: meta.label });
    }

    if (a.status === 'Late') {
        const meta = ATTENDANCE_FLAG_META.late;
        flags.push({ key: 'late', tone: meta.tone, label: a.lateMinutes > 0 ? 'Late - ' + a.lateMinutes + 'm' : meta.label });
    }

    if (a.undertimeMinutes > 0) {
        const meta = ATTENDANCE_FLAG_META.early;
        flags.push({ key: 'early', tone: meta.tone, label: 'Early - ' + a.undertimeMinutes + 'm' });
    }

    return flags;
}
