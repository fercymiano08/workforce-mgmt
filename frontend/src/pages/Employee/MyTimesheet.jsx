import { useMemo, useRef, useState } from 'react';
import {
  CalendarDays, Clock3, Timer, Coffee, Send, BarChart3, ChevronRight, Download, Printer,
} from 'lucide-react';
import { useTimesheets, useTimesheetsLoaded, submitTimesheet, refreshTimesheets } from '../../hooks/useTimesheets';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import KpiCard from '../../components/dashboard/KpiCard';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard, SkeletonTable } from '../../components/ui/LoadingSkeleton';
import useApiData from '../../hooks/useApiData';
import { attendanceService } from '../../services/api';
import { toDateKey } from '../../services/attendanceService';
import { formatDate, formatTime } from '../../utils/helpers';
import { downloadCsv, printElementAsPdf } from '../../utils/export';

const hours = (value) => `${Number(value || 0).toFixed(1)}h`;

const DAY_LABELS = ['M', 'T', 'W', 'TH', 'F', 'S', 'SN'];

const WORKED_STATUSES = ['Present', 'Late', 'Half Day'];

const ATTENDANCE_STATUS_VARIANT = {
  Present: 'success',
  Late: 'warning',
  'Half Day': 'warning',
  'On Leave': 'purple',
  Leave: 'purple',
  Absent: 'danger',
};

function getMonday(today) {
  const day = today.getDay(); // 0 = Sunday
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + offset);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export default function MyTimesheet() {
  const { user } = useAuth();
  const { toast } = useToast();
  const employeeId = user?.id || 'EMP001';
  const printRef = useRef(null);
  const [selectedWeek, setSelectedWeek] = useState(null);
  const data = useTimesheets();
  const loaded = useTimesheetsLoaded();

  const { data: attendance } = useApiData(
    () => attendanceService.getByEmployeeId(employeeId),
    [employeeId]
  );

  const records = useMemo(
    () => data
      .filter((t) => t.employeeId === employeeId)
      .sort((a, b) => b.weekEnd.localeCompare(a.weekEnd)),
    [data, employeeId]
  );

  const latest = records[0];

  // The current calendar week (Mon–Sun) built from this week's attendance, so
  // the page always has a real weekly picture even before a timesheet exists.
  const thisWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = getMonday(today);
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      date.setHours(0, 0, 0, 0);
      return {
        key: toDateKey(date),
        date,
        label: DAY_LABELS[i],
        isWeekend: i >= 5,
        isToday: date.getTime() === today.getTime(),
        isFuture: date.getTime() > today.getTime(),
      };
    });

    const byDate = {};
    (attendance || []).forEach((a) => { byDate[a.date] = a; });

    const workedRecords = days
      .map((d) => byDate[d.key])
      .filter((r) => r && (r.clockIn || WORKED_STATUSES.includes(r.status)));

    return {
      monday,
      sunday: days[6].date,
      days,
      byDate,
      workedRecords,
      workedDays: workedRecords.length,
      regularHours: workedRecords.reduce((sum, r) => sum + (r.regularHours || 0), 0),
      overtimeHours: workedRecords.reduce((sum, r) => sum + (r.overtime || 0), 0),
      breakHours: workedRecords.reduce((sum, r) => sum + (r.breakHours || 0), 0),
      totalHours: workedRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0),
      lateCount: workedRecords.filter((r) => r.status === 'Late').length,
    };
  }, [attendance]);

  // A live, always-available view of the current Mon–Sun week computed from
  // the attendance feed. This is what "This Week" opens, so the popup works
  // automatically even before any timesheet has been saved.
  const liveWeekRecord = useMemo(
    () => ({
      id: null,
      isLive: true,
      employeeId,
      status: 'Auto',
      weekStart: toDateKey(thisWeek.monday),
      weekEnd: toDateKey(thisWeek.sunday),
      regularHours: thisWeek.regularHours,
      overtimeHours: thisWeek.overtimeHours,
      breakHours: thisWeek.breakHours,
      totalHours: thisWeek.totalHours,
      notes: null,
      approvedBy: null,
    }),
    [thisWeek, employeeId]
  );

  // KPIs always render: the latest timesheet once it exists, otherwise this
  // week's live attendance totals so the page never looks empty.
  const kpis = latest
    ? [
        { label: 'Regular Hours', value: hours(latest.regularHours), icon: Clock3, accent: 'blue' },
        { label: 'Overtime', value: hours(latest.overtimeHours), icon: Timer, accent: 'purple' },
        { label: 'Break Hours', value: hours(latest.breakHours), icon: Coffee, accent: 'amber' },
        { label: 'Total Hours', value: hours(latest.totalHours), icon: Clock3, accent: 'emerald' },
      ]
    : [
        { label: 'Regular Hours · This Week', value: hours(thisWeek.regularHours), icon: Clock3, accent: 'blue' },
        { label: 'Overtime · This Week', value: hours(thisWeek.overtimeHours), icon: Timer, accent: 'purple' },
        { label: 'Break Hours · This Week', value: hours(thisWeek.breakHours), icon: Coffee, accent: 'amber' },
        { label: 'Total Hours · This Week', value: hours(thisWeek.totalHours), icon: Clock3, accent: 'emerald' },
      ];

  const handleSubmit = async () => {
    if (!latest || latest.status !== 'Draft') return;
    try {
      await submitTimesheet(latest.id);
      await refreshTimesheets();
      toast.success('Timesheet Submitted', 'Timesheet submitted successfully for HR review.');
    } catch {
      toast.error('Error', 'Failed to submit timesheet.');
    }
  };

  const handleExport = () => {
    if (!records.length) {
      toast.error('Nothing to export', 'You have no saved timesheets yet.');
      return;
    }
    const rows = records.map((t) => ({
      'Week Start': t.weekStart,
      'Week End': t.weekEnd,
      'Regular Hours': t.regularHours || 0,
      'Overtime Hours': t.overtimeHours || 0,
      'Break Hours': t.breakHours || 0,
      'Total Hours': t.totalHours || 0,
      Status: t.status,
      'Submitted': t.submittedDate || '',
      'Approved By': t.approvedBy || '',
    }));
    downloadCsv(`my-timesheets-${employeeId}.csv`, rows);
    toast.success('Export ready', `Exported ${rows.length} timesheets as CSV.`);
  };

  const handlePrint = () => {
    if (!printRef.current) {
      toast.error('Nothing to print', 'No saved timesheets to print.');
      return;
    }
    printElementAsPdf(printRef.current, `Timesheets - ${employeeId}`);
  };

  // The seven day rows of whichever week the modal is showing. Each row maps
  // back to that date's attendance record, so even a saved weekly timesheet
  // shows the actual per-day clock-in/out detail behind its totals.
  const weekRows = useMemo(() => {
    if (!selectedWeek?.weekStart) return [];
    const [y, m, d] = selectedWeek.weekStart.split('-').map(Number);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    return Array.from({ length: 7 }, (_, i) => {
      const date = new Date(y, m - 1, d + i, 0, 0, 0, 0);
      const key = toDateKey(date);
      return {
        key,
        dayLabel: date.toLocaleDateString('en-US', { weekday: 'long' }),
        isToday: key === toDateKey(todayStart),
        rec: thisWeek.byDate[key],
      };
    });
  }, [selectedWeek, thisWeek.byDate]);

  const rowHours = (rec) => (rec?.totalHours ?? rec?.hours ?? 0);

  if (!loaded) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
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
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Timesheet</h1>
          <p className="text-[14px] text-gray-500 mt-1">Review your weekly working hours and timesheet status</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm">
            <CalendarDays className="w-4 h-4 text-gray-400" />
            <span className="font-medium">{formatDate(new Date().toISOString())}</span>
          </div>
          <Button variant="outline" size="md" icon={Download} onClick={handleExport}>Export CSV</Button>
          <Button variant="outline" size="md" icon={Printer} onClick={handlePrint}>Print / PDF</Button>
          <Button variant="outline" size="md" icon={CalendarDays} onClick={() => setSelectedWeek(liveWeekRecord)}>
            This Week
          </Button>
          {latest?.status === 'Draft' && (
            <Button variant="primary" size="md" icon={Send} onClick={handleSubmit}>Submit Timesheet</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} accent={kpi.accent} />
        ))}
      </div>

      {/* Single Summary Card */}
      <div
        onClick={() => setSelectedWeek(latest || liveWeekRecord)}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {latest ? `${formatDate(latest.weekStart)} – ${formatDate(latest.weekEnd)}` : 'This Week'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {latest ? `Regular ${Number(latest.regularHours || 0).toFixed(1)}h · OT ${Number(latest.overtimeHours || 0).toFixed(1)}h · Total ${Number(latest.totalHours || 0).toFixed(1)}h` : 'Automatically computed from your clock-in records'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {latest && (
              <Badge variant={latest.status === 'Approved' ? 'success' : latest.status === 'Submitted' ? 'warning' : 'default'} size="sm">
                {latest.status}
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
          <div className="overflow-hidden rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="py-2.5 px-4 font-semibold">Week</th>
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
                      <Badge
                        variant={t.status === 'Approved' ? 'success' : t.status === 'Submitted' ? 'warning' : 'default'}
                        size="sm"
                      >
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
          </div>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="No timesheets yet"
            description="Your saved timesheets will appear here. Weekly totals are already tracked live in the This Week view."
          />
        )}
      </div>

      <Modal
        isOpen={!!selectedWeek}
        onClose={() => setSelectedWeek(null)}
        title={selectedWeek?.isLive
          ? `This Week · ${formatDate(selectedWeek.weekStart)} – ${formatDate(selectedWeek.weekEnd)}`
          : `Week of ${formatDate(selectedWeek?.weekStart)} – ${formatDate(selectedWeek?.weekEnd)}`}
        size="xl"
      >
        {selectedWeek && (
          <div className="space-y-6">
            {/* Status & Metadata */}
            <div className="flex items-center gap-3 flex-wrap">
              {selectedWeek.isLive ? (
                <>
                  <Badge variant="primary" size="sm">This Week · Auto</Badge>
                  <span className="text-xs text-gray-500">Automatically computed from your clock-in records</span>
                </>
              ) : (
                <>
                  <Badge
                    variant={selectedWeek.status === 'Approved' ? 'success' : selectedWeek.status === 'Submitted' ? 'warning' : 'default'}
                    size="sm"
                  >
                    {selectedWeek.status}
                  </Badge>
                  {selectedWeek.approvedBy && (
                    <span className="text-xs text-gray-500">Approved by {selectedWeek.approvedBy}</span>
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
              <div className="overflow-hidden rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                      <th className="py-2.5 px-4 font-semibold">Date</th>
                      <th className="py-2.5 px-2 font-semibold">Status</th>
                      <th className="py-2.5 px-2 font-semibold">Clock In</th>
                      <th className="py-2.5 px-2 font-semibold">Clock Out</th>
                      <th className="py-2.5 px-2 font-semibold">Break</th>
                      <th className="py-2.5 px-4 font-semibold text-right">Hours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weekRows.map(({ key, dayLabel, isToday, rec }) => {
                      const worked = rec && (rec.clockIn || WORKED_STATUSES.includes(rec.status));
                      return (
                        <tr key={key} className={`border-t border-gray-50 ${isToday ? 'bg-blue-50/60' : ''}`}>
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
                          <td className="py-2.5 px-4 text-right">
                            {worked ? (
                              <span className={`font-bold ${isToday ? 'text-blue-700' : 'text-gray-900'}`}>
                                {Number(rowHours(rec)).toFixed(1)}h
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-100 bg-gray-50/70">
                      <td colSpan={5} className="py-2.5 px-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                        {selectedWeek.isLive ? 'Live week total' : 'Week total'}
                      </td>
                      <td className="py-2.5 px-4 text-right text-base font-bold text-gray-900">
                        {Number(selectedWeek.totalHours || 0).toFixed(1)}h
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

            {/* Notes */}
            {!selectedWeek.isLive && selectedWeek.notes && (
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-1">Notes</p>
                <p className="text-sm text-gray-600">{selectedWeek.notes}</p>
              </div>
            )}

            {/* Submit button */}
            {!selectedWeek.isLive && selectedWeek.status === 'Draft' && (
              <Button
                onClick={async () => {
                  try {
                    await submitTimesheet(selectedWeek.id);
                    await refreshTimesheets();
                    toast.success('Timesheet Submitted', 'Timesheet submitted successfully for HR review.');
                    setSelectedWeek(null);
                  } catch {
                    toast.error('Error', 'Failed to submit timesheet.');
                  }
                }}
              >
                Submit Timesheet
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
                <th>Week Start</th><th>Week End</th><th>Regular (h)</th><th>Overtime (h)</th>
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