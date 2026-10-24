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
        flags.push({ key: 'missing_clock_out', tone: 'amber', label: 'Missing clock-out' });
    }

    if (a.status === 'Late') {
        flags.push({ key: 'late', tone: 'red', label: a.lateMinutes > 0 ? 'Late - ' + a.lateMinutes + 'm' : 'Late' });
    }

    if (a.undertimeMinutes > 0) {
        flags.push({ key: 'early', tone: 'amber', label: 'Early - ' + a.undertimeMinutes + 'm' });
    }

    return flags;
}
