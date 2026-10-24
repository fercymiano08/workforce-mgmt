import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, Clock3, Timer, Coffee, Send, BarChart3, ChevronRight, Printer, AlertTriangle, Info, Undo2,
} from 'lucide-react';
import { useTimesheets, useTimesheetsLoaded, submitTimesheet, withdrawTimesheet, refreshTimesheets } from '../../hooks/useTimesheets';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { todayRowClass } from '../../utils/today';
import { kioskService } from '../../services/kioskService';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import TableShell from '../../components/ui/TableShell';
import KpiCard from '../../components/dashboard/KpiCard';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard, SkeletonTable } from '../../components/ui/LoadingSkeleton';
import useApiData from '../../hooks/useApiData';
import { attendanceService } from '../../services/api';
import { toDateKey } from '../../services/attendanceService';
import { formatDate, formatTime } from '../../utils/helpers';
import { printElementAsPdf } from '../../utils/export';
import { StatusSteps, HistoryTimeline } from '../../components/timesheets/WorkflowParts';
import { statusVariant, whenText } from '../../utils/timesheetWorkflow';
import { periodStartOf, periodEndOf, daysInPeriod } from '../../utils/payPeriod';

const hours = (value) => `${Number(value || 0).toFixed(1)}h`;

const WORKED_STATUSES = ['Present', 'Late'];

const ATTENDANCE_STATUS_VARIANT = {
  Present: 'success',
  Late: 'warning',
  'On Leave': 'purple',
  Leave: 'purple',
  Absent: 'danger',
};

// A short, worth-flagging reason for a day - the exact thing a payroll reviewer would ask about.
function dayException(rec) {
  if (!rec) return null;
  if (rec.clockIn && !rec.clockOut) return 'Missing clock-out';
  if (Number(rec.lateMinutes) > 0) return `${rec.lateMinutes} min late`;
  if (Number(rec.undertimeMinutes) > 0) return `Left ${rec.undertimeMinutes} min early`;
  if (Number(rec.overtime) > 0) return `${rec.overtime}h overtime`;
  return null;
}

export default function MyTimesheet() {
  const { user } = useAuth();
  const { toast } = useToast();
  const employeeId = user?.id || 'EMP001';
  const printRef = useRef(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const data = useTimesheets();
  const loaded = useTimesheetsLoaded();

  const { data: attendance, setData: setAttendance } = useApiData(
    () => attendanceService.getByEmployeeId(employeeId),
    [employeeId]
  );

  // The ongoing period's hours have to come from actual clock-ins, not a database snapshot that
  // only gets recomputed on certain triggers - polling both attendance and the timesheet record
  // every 30s (silently, via setData rather than useApiData's own refresh(), so there is no
  // loading-skeleton flash) is what makes "Live" here true rather than a label on stale data.
  useEffect(() => {
    let active = true;
    const poll = () => {
      attendanceService.getByEmployeeId(employeeId).then((res) => { if (active) setAttendance(res); }).catch(() => {});
      refreshTimesheets().catch(() => {});
    };
    const id = setInterval(poll, 30000);
    return () => { active = false; clearInterval(id); };
  }, [employeeId, setAttendance]);

  const records = useMemo(
    () => data
      .filter((t) => t.employeeId === employeeId)
      .sort((a, b) => b.weekEnd.localeCompare(a.weekEnd)),
    [data, employeeId]
  );

  const latest = records[0];

  // Finished periods that are waiting for the employee (a returned timesheet always is), oldest first.
  const actionable = useMemo(
    () => records
      .filter((t) => (t.status === 'Draft' && t.weekFinished && (t.totalHours || 0) > 0) || t.status === 'Rejected')
      .sort((a, b) => a.weekEnd.localeCompare(b.weekEnd)),
    [records]
  );
  const waiting = records.filter((t) => t.status === 'Submitted');
  const canSubmit = (t) => !!t && (t.status === 'Draft' || t.status === 'Rejected') && t.weekFinished;

  // The current semi-monthly pay period (1st-15th, or 16th-end of month) built from this period's
  // attendance, so the page always has a real picture even before a timesheet exists.
  const thisPeriod = useMemo(() => {
    const today = kioskService.now();
    today.setHours(0, 0, 0, 0);
    const start = periodStartOf(today);
    const end = periodEndOf(start);
    const days = daysInPeriod(start, end).map((key) => {
      const date = new Date(`${key}T00:00:00`);
      return {
        key,
        date,
        label: date.toLocaleDateString('en-US', { weekday: 'short' }),
        isToday: key === toDateKey(today),
        isFuture: date.getTime() > today.getTime(),
      };
    });

    const byDate = {};
    (attendance || []).forEach((a) => { byDate[a.date] = a; });

    const workedRecords = days
      .map((d) => byDate[d.key])
      .filter((r) => r && (r.clockIn || WORKED_STATUSES.includes(r.status)));

    return {
      start, end, days, byDate,
      workedRecords,
      workedDays: workedRecords.length,
      regularHours: workedRecords.reduce((sum, r) => sum + (r.regularHours || 0), 0),
      overtimeHours: workedRecords.reduce((sum, r) => sum + (r.overtime || 0), 0),
      breakHours: workedRecords.reduce((sum, r) => sum + (r.breakHours || 0), 0),
      totalHours: workedRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0),
      lateCount: workedRecords.filter((r) => r.status === 'Late').length,
    };
  }, [attendance]);

  // A live, always-available view of the current period computed from the attendance feed. This is
  // what "This Period" opens, so the popup works automatically even before any timesheet has been saved.
  const liveWeekRecord = useMemo(
    () => ({
      id: null,
      isLive: true,
      employeeId,
      status: 'Auto',
      weekStart: toDateKey(thisPeriod.start),
      weekEnd: toDateKey(thisPeriod.end),
      regularHours: thisPeriod.regularHours,
      overtimeHours: thisPeriod.overtimeHours,
      breakHours: thisPeriod.breakHours,
      totalHours: thisPeriod.totalHours,
      notes: null,
      approvedBy: null,
    }),
    [thisPeriod, employeeId]
  );

  // The saved Draft row for the current period (once the backend has created one) exists mainly
  // for its workflow state - id, status, due date - not as the hour totals, which only get
  // recomputed on whatever schedule the backend runs. Keeping the real record's identity but
  // swapping in thisPeriod's live totals is what makes it both genuinely live AND still the right
  // id/status to act on.
  const current = useMemo(() => {
    const matchesOngoingPeriod = latest && !latest.weekFinished && latest.weekStart === toDateKey(thisPeriod.start);
    if (matchesOngoingPeriod) {
      return {
        ...latest,
        isLive: true,
        regularHours: thisPeriod.regularHours,
        overtimeHours: thisPeriod.overtimeHours,
        breakHours: thisPeriod.breakHours,
        totalHours: thisPeriod.totalHours,
      };
    }
    // No saved row for the current period yet (most recent one on file is an older, already-
    // finished period) - the live current period, not that old record, is what "ongoing" means.
    return liveWeekRecord;
  }, [latest, liveWeekRecord, thisPeriod]);

  // Always reads off `current` - the live-corrected record - so these never show a stale saved
  // snapshot for a period that is still in progress.
  const kpiSuffix = current.isLive ? ' · Live' : '';
  const kpis = [
    { label: `Regular Hours${kpiSuffix}`, value: hours(current.regularHours), icon: Clock3, accent: 'blue' },
    { label: `Overtime${kpiSuffix}`, value: hours(current.overtimeHours), icon: Timer, accent: 'purple' },
    { label: `Break Hours${kpiSuffix}`, value: hours(current.breakHours), icon: Coffee, accent: 'amber' },
    { label: `Total Hours${kpiSuffix}`, value: hours(current.totalHours), icon: Clock3, accent: 'emerald' },
  ];

  const [busy, setBusy] = useState(false);

  const handleSubmit = async (ts) => {
    if (!canSubmit(ts)) return;
    try {
      await submitTimesheet(ts.id);
      await refreshTimesheets();
      toast.success('Timesheet Submitted', 'Your timesheet was sent to HR for review.');
      setSelectedWeek(null);
    } catch (err) {
      toast.error('Could not submit', err?.response?.data?.message || 'Failed to submit timesheet.');
    }
  };

  const handleWithdraw = async (ts) => {
    setBusy(true);
    try {
      await withdrawTimesheet(ts.id);
      await refreshTimesheets();
      toast.success('Submission Withdrawn', 'Back to draft - you can review it again before the deadline.');
      setSelectedWeek(null);
    } catch (err) {
      toast.error('Could not withdraw', err?.response?.data?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handlePrint = () => {
    if (!printRef.current) {
      toast.error('Nothing to print', 'No saved timesheets to print.');
      return;
    }
    printElementAsPdf(printRef.current, `Timesheets - ${employeeId}`);
  };

  // The day rows of whichever period the modal is showing - up to 16, not a fixed 7. Each row maps
  // back to that date's attendance record, so even a saved timesheet shows the actual per-day
  // clock-in/out detail behind its totals.
  const weekRows = useMemo(() => {
    if (!selectedWeek?.weekStart) return [];
    const end = toDateKey(periodEndOf(new Date(`${selectedWeek.weekStart}T00:00:00`)));
    const todayStart = kioskService.now();
    todayStart.setHours(0, 0, 0, 0);
    return daysInPeriod(new Date(`${selectedWeek.weekStart}T00:00:00`), new Date(`${end}T00:00:00`)).map((key) => {
      const date = new Date(`${key}T00:00:00`);
      return {
        key,
        dayLabel: date.toLocaleDateString('en-US', { weekday: 'long' }),
        isToday: key === toDateKey(todayStart),
        rec: thisPeriod.byDate[key],
      };
    });
  }, [selectedWeek, thisPeriod.byDate]);

  const rowHours = (rec) => (rec?.totalHours ?? rec?.hours ?? 0);

  if (!loaded) {
    return (
      <div className="space-y-6">
        <SkeletonCard lines={2} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </div>
        <SkeletonTable rows={5} cols={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Timesheet</h1>
          <p className="text-[14px] text-gray-500 mt-1">Review your pay-period working hours and timesheet status</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm">
            <CalendarDays className="w-4 h-4 text-gray-400" />
            <span className="font-medium">{formatDate(new Date().toISOString())}</span>
          </div>
          <Button variant="outline" size="md" icon={Printer} onClick={handlePrint}>Print / PDF</Button>
          <Button variant="outline" size="md" icon={CalendarDays} onClick={() => setSelectedWeek(current)}>
            This Period
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} accent={kpi.accent} />
        ))}
      </div>

      {/* What happens next */}
      {actionable.length > 0 ? (
        <div className="space-y-3">
          {actionable.map((t) => (
            <div key={t.id} className={`rounded-2xl border p-5 ${t.status === 'Rejected' ? 'bg-red-50/60 border-red-200' : 'bg-blue-50/60 border-blue-200'}`}>
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-2 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {t.status === 'Rejected' ? 'Sent back to you' : 'Ready to submit'} · {formatDate(t.weekStart)} – {formatDate(t.weekEnd)} · {hours(t.totalHours)}
                  </p>
                  <StatusSteps status={t.status} />
                  {t.status === 'Rejected' ? (
                    <p className="text-sm text-red-700 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" /> HR said: &ldquo;{t.statusReason}&rdquo;. Ask HR to correct the attendance if needed, then submit again.</p>
                  ) : (
                    <p className="text-sm text-gray-600 flex items-start gap-2"><Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-500" /> Please check the days below and submit before {whenText(t.dueAt)}. After that, the system submits it for you.</p>
                  )}
                  {t.statusReason && t.status === 'Draft' && (
                    <p className="text-xs text-amber-700">HR reopened this timesheet: &ldquo;{t.statusReason}&rdquo;</p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="md" onClick={() => setSelectedWeek(t)}>Review days</Button>
                  <Button variant="primary" size="md" icon={Send} onClick={() => handleSubmit(t)}>{t.status === 'Rejected' ? 'Resubmit' : 'Submit'}</Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-gray-100 bg-white p-4 text-sm text-gray-600 flex items-start gap-3">
          <Info className="w-4 h-4 mt-0.5 text-blue-500 shrink-0" />
          <p>
            {waiting.length
              ? `Your timesheet for ${formatDate(waiting[0].weekStart)} – ${formatDate(waiting[0].weekEnd)} is waiting for HR to review.`
              : 'Your timesheet builds itself from your clock-ins. When the pay period ends you will be asked to review and submit it; if you do not, it is submitted for you automatically the next day at noon.'}
          </p>
        </div>
      )}

      {/* Ongoing Timesheet Record - called out by name and a pulsing "Live" dot specifically so it
          never reads as just another row of the history table: this one's numbers move as the
          period goes on, where every other record below is a fixed, finished snapshot. */}
      <div
        onClick={() => setSelectedWeek(current)}
        className={`bg-white rounded-2xl border shadow-sm p-6 cursor-pointer hover:shadow-md transition-all ${
          current.isLive ? 'border-blue-200 hover:border-blue-400' : 'border-gray-100 hover:border-blue-300'
        }`}
      >
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 shadow-lg ${
              current.isLive ? 'bg-gradient-to-br from-emerald-500 to-emerald-600 shadow-emerald-500/25' : 'bg-gradient-to-br from-blue-500 to-blue-600 shadow-blue-500/20'
            }`}>
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-gray-900">
                  {current.isLive ? 'Ongoing Timesheet Record' : `${formatDate(current.weekStart)} – ${formatDate(current.weekEnd)}`}
                </p>
                {current.isLive && (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[11px] font-semibold">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
                  </span>
                )}
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                {current.isLive
                  ? `${formatDate(current.weekStart)} – ${formatDate(current.weekEnd)} · Regular ${Number(current.regularHours || 0).toFixed(1)}h · OT ${Number(current.overtimeHours || 0).toFixed(1)}h · Total ${Number(current.totalHours || 0).toFixed(1)}h`
                  : `Regular ${Number(current.regularHours || 0).toFixed(1)}h · OT ${Number(current.overtimeHours || 0).toFixed(1)}h · Total ${Number(current.totalHours || 0).toFixed(1)}h`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            {current.id && (
              <Badge variant={statusVariant[current.status] || 'default'} size="sm">
                {current.status}
              </Badge>
            )}
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Timesheet History */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3">Timesheet History</h2>
        {records.length ? (
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <TableShell minWidth="min-w-[560px]">
              <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="py-2.5 px-4 font-semibold">Period</th>
                  <th className="py-2.5 px-2 font-semibold">Status</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Regular</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Overtime</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Total</th>
                  <th className="py-2.5 px-4 font-semibold text-right hidden md:table-cell">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {records.map((t) => (
                  <tr
                    key={t.id}
                    onClick={() => setSelectedWeek(t)}
                    className="border-t border-gray-50 cursor-pointer hover:bg-blue-50/40 transition-colors"
                  >
                    <td className="py-2.5 px-4">
                      <div className="flex items-center gap-2">
                        <CalendarDays className="w-4 h-4 text-blue-500" />
                        <p className="font-semibold text-gray-900">{formatDate(t.weekStart)} – {formatDate(t.weekEnd)}</p>
                      </div>
                    </td>
                    <td className="py-2.5 px-2">
                      <Badge variant={statusVariant[t.status] || 'default'} size="sm">
                        {t.status}
                      </Badge>
                    </td>
                    <td className="py-2.5 px-2 text-right text-gray-600">{Number(t.regularHours || 0).toFixed(1)}h</td>
                    <td className="py-2.5 px-2 text-right text-gray-600">{Number(t.overtimeHours || 0).toFixed(1)}h</td>
                    <td className="py-2.5 px-2 text-right font-bold text-gray-900">{Number(t.totalHours || 0).toFixed(1)}h</td>
                    <td className="py-2.5 px-4 text-right text-gray-500 hidden md:table-cell">
                      {t.submittedDate ? formatDate(t.submittedDate) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </TableShell>
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="No timesheets yet"
            description="Your saved timesheets will appear here. Pay-period totals are already tracked live in the This Period view."
          />
        )}
      </div>

      <Modal
        isOpen={!!selectedWeek}
        onClose={() => setSelectedWeek(null)}
        title={selectedWeek?.isLive
          ? `Ongoing Timesheet Record · ${formatDate(selectedWeek.weekStart)} – ${formatDate(selectedWeek.weekEnd)}`
          : `${formatDate(selectedWeek?.weekStart)} – ${formatDate(selectedWeek?.weekEnd)}`}
        size="xl"
      >
        {selectedWeek && (
          <div className="space-y-6">
            {/* Status & Metadata */}
            <div className="flex items-center gap-3 flex-wrap">
              {selectedWeek.isLive && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Live
                </span>
              )}
              {selectedWeek.isLive ? (
                selectedWeek.id ? (
                  <StatusSteps status={selectedWeek.status} />
                ) : (
                  <span className="text-xs text-gray-500">Automatically computed from your clock-in records - updates every 30s</span>
                )
              ) : (
                <>
                  <StatusSteps status={selectedWeek.status} />
                  {selectedWeek.approvedBy && (
                    <span className="text-xs text-gray-500">{selectedWeek.status === 'Rejected' ? 'Reviewed' : 'Approved'} by {selectedWeek.approvedBy}</span>
                  )}
                </>
              )}
            </div>

            {/* KPI Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-[11px] text-blue-600 font-medium uppercase">Regular</p>
                <p className="text-lg font-bold text-blue-700 mt-0.5">{Number(selectedWeek.regularHours || 0).toFixed(1)}h</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-3 text-center">
                <p className="text-[11px] text-purple-600 font-medium uppercase">Overtime</p>
                <p className="text-lg font-bold text-purple-700 mt-0.5">{Number(selectedWeek.overtimeHours || 0).toFixed(1)}h</p>
                {selectedWeek.paidOtHours != null && Number(selectedWeek.overtimeHours || 0) > 0 && (
                  <p className="text-[10px] mt-0.5 text-purple-600">
                    {Number(selectedWeek.paidOtHours).toFixed(1)}h paid
                    {Number(selectedWeek.overtimeHours) > Number(selectedWeek.paidOtHours)
                      ? <span className="text-red-500"> · {(Number(selectedWeek.overtimeHours) - Number(selectedWeek.paidOtHours)).toFixed(1)}h not approved</span>
                      : null}
                  </p>
                )}
              </div>
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <p className="text-[11px] text-amber-600 font-medium uppercase">Break</p>
                <p className="text-lg font-bold text-amber-700 mt-0.5">{Number(selectedWeek.breakHours || 0).toFixed(1)}h</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <p className="text-[11px] text-emerald-600 font-medium uppercase">Total</p>
                <p className="text-lg font-bold text-emerald-700 mt-0.5">{Number(selectedWeek.totalHours || 0).toFixed(1)}h</p>
              </div>
            </div>

            {/* Daily Timesheet List */}
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-3">Daily Timesheet</p>
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <TableShell minWidth="min-w-[620px]">
                    <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                      <th className="py-2.5 px-4 font-semibold">Date</th>
                      <th className="py-2.5 px-2 font-semibold">Status</th>
                      <th className="py-2.5 px-2 font-semibold">Clock In</th>
                      <th className="py-2.5 px-2 font-semibold">Clock Out</th>
                      <th className="py-2.5 px-2 font-semibold">Break</th>
                      <th className="py-2.5 px-2 font-semibold text-right">Hours</th>
                      <th className="py-2.5 px-4 font-semibold w-6"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {weekRows.map(({ key, dayLabel, isToday, rec }) => {
                      const worked = rec && (rec.clockIn || WORKED_STATUSES.includes(rec.status));
                      const exception = dayException(rec);
                      return (
                        <tr key={key} className={`border-t border-gray-50 ${isToday ? todayRowClass(key) : ''}`}>
                          <td className="py-2.5 px-4">
                            <div className="flex items-center gap-2">
                              <p className={`font-semibold ${isToday ? 'text-blue-700' : 'text-gray-900'}`}>{formatDate(key)}</p>
                              <p className="text-xs text-gray-400">{dayLabel}</p>
                              {isToday && <Badge size="xs" variant="primary">Today</Badge>}
                            </div>
                          </td>
                          <td className="py-2.5 px-2">
                            {worked ? (
                              <Badge variant={ATTENDANCE_STATUS_VARIANT[rec.status] || 'default'} size="sm">{rec.status}</Badge>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2">
                            {worked && rec.clockIn ? (
                              <span className="font-medium text-gray-700">{formatTime(rec.clockIn)}</span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-gray-600">
                            {worked && rec.clockOut ? formatTime(rec.clockOut) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="py-2.5 px-2 text-gray-600">
                            {worked && Number(rec.breakHours || 0) > 0
                              ? `${Number(rec.breakHours).toFixed(1)}h`
                              : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="py-2.5 px-2 text-right">
                            {worked ? (
                              <span className={`font-bold ${isToday ? 'text-blue-700' : 'text-gray-900'}`}>
                                {Number(rowHours(rec)).toFixed(1)}h
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                          <td className="py-2.5 px-4">
                            {exception && (
                              <span title={exception}>
                                <AlertTriangle className="w-4 h-4 text-amber-500" />
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-100 bg-gray-50/70">
                      <td colSpan={5} className="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        {selectedWeek.isLive ? 'Live period total' : 'Period total'}
                      </td>
                      <td className="py-2.5 px-2 text-right text-base font-bold text-gray-900">
                        {Number(selectedWeek.totalHours || 0).toFixed(1)}h
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
                </TableShell>
              </div>
            </div>

            {/* Notes */}
            {!selectedWeek.isLive && selectedWeek.notes && (
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-1">Notes</p>
                <p className="text-sm text-gray-600">{selectedWeek.notes}</p>
              </div>
            )}

            {!selectedWeek.isLive && selectedWeek.statusReason && (
              <div className={`rounded-xl px-4 py-3 text-sm ${selectedWeek.status === 'Rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
                <p className="font-semibold">{selectedWeek.status === 'Rejected' ? 'Why it was sent back' : 'Why it was reopened'}</p>
                <p className="mt-0.5">{selectedWeek.statusReason}</p>
              </div>
            )}

            {!selectedWeek.isLive && (
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-3">History</p>
                <HistoryTimeline history={selectedWeek.history} />
              </div>
            )}

            {/* Submit / Withdraw - only once the period is over, or already submitted */}
            {!selectedWeek.isLive && (selectedWeek.status === 'Draft' || selectedWeek.status === 'Rejected') && (
              <div className="space-y-2">
                <Button icon={Send} disabled={!selectedWeek.weekFinished} onClick={() => handleSubmit(selectedWeek)}>
                  {selectedWeek.status === 'Rejected' ? 'Resubmit Timesheet' : 'Submit Timesheet'}
                </Button>
                {!selectedWeek.weekFinished && (
                  <p className="text-xs text-gray-500">You can submit this timesheet once the period ends on {formatDate(selectedWeek.weekEnd)}.</p>
                )}
              </div>
            )}
            {!selectedWeek.isLive && selectedWeek.status === 'Submitted' && (
              <Button variant="secondary" icon={Undo2} loading={busy} onClick={() => handleWithdraw(selectedWeek)}>
                Withdraw Submission
              </Button>
            )}
          </div>
        )}
      </Modal>

      {/* Print/PDF snapshot - hidden on screen, rendered into a print window */}
      <div className="hidden">
        <div ref={printRef}>
          <h1>My Timesheets</h1>
          <p className="print-sub">Employee {employeeId} · Generated {new Date().toLocaleString()}</p>
          <table>
            <thead>
              <tr>
                <th>Period Start</th><th>Period End</th><th>Regular (h)</th><th>Overtime (h)</th>
                <th>Break (h)</th><th>Total (h)</th><th>Status</th><th>Submitted</th>
              </tr>
            </thead>
            <tbody>
              {records.map((t) => (
                <tr key={t.id}>
                  <td>{t.weekStart}</td>
                  <td>{t.weekEnd}</td>
                  <td>{Number(t.regularHours || 0).toFixed(1)}</td>
                  <td>{Number(t.overtimeHours || 0).toFixed(1)}</td>
                  <td>{Number(t.breakHours || 0).toFixed(1)}</td>
                  <td>{Number(t.totalHours || 0).toFixed(1)}</td>
                  <td>{t.status}</td>
                  <td>{t.submittedDate || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
