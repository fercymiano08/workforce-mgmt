import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Calendar, ChevronLeft, ChevronRight, CheckCircle, AlertTriangle, Undo2, Send, Clock, History } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonList } from '../../components/ui/LoadingSkeleton';
import { timesheetService } from '../../services/api';
import { formatDate, formatTime } from '../../utils/helpers';
import { statusVariant } from '../../utils/timesheetWorkflow';
import { HistoryTimeline } from '../../components/timesheets/WorkflowParts';
import { periodByOffset, periodLabel, periodDueAt } from '../../utils/payPeriod';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useApiData from '../../hooks/useApiData';
import { useTimesheets, useTimesheetsLoaded, submitTimesheet, withdrawTimesheet } from '../../hooks/useTimesheets';

const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** What a day actually was, derived from attendance/schedule/leave - never typed in, always computed. */
function dayType(day, todayKey) {
  const a = day.attendance;
  if (a) {
    if (Number(a.regularHolidayHours) > 0) return { label: 'Regular Holiday', tone: 'text-red-700 bg-red-50' };
    if (Number(a.specialHolidayHours) > 0) return { label: 'Special Holiday', tone: 'text-amber-700 bg-amber-50' };
    if (a.isRestDay) return { label: 'Rest Day (worked)', tone: 'text-purple-700 bg-purple-50' };
    if (a.status === 'Absent') return { label: 'Absent', tone: 'text-red-600 bg-red-50' };
    if (a.status === 'Early Leave') return { label: 'Early Leave', tone: 'text-amber-700 bg-amber-50' };
    if (a.status === 'Late') return { label: 'Late', tone: 'text-amber-700 bg-amber-50' };
    return { label: 'Regular', tone: 'text-emerald-700 bg-emerald-50' };
  }
  if (day.leaveType) return { label: `${day.leaveType} Leave`, tone: 'text-indigo-700 bg-indigo-50' };
  if (day.date > todayKey) return { label: day.scheduledStart ? 'Scheduled' : 'Off', tone: 'text-gray-400 bg-gray-50' };
  if (day.scheduledStart) return { label: 'Absent', tone: 'text-red-600 bg-red-50' };
  return { label: 'Off', tone: 'text-gray-400 bg-gray-50' };
}

/** A short reason icon-worthy enough to flag inline - the exact thing a payroll reviewer would ask about. */
function dayException(day) {
  const a = day.attendance;
  if (!a) return null;
  if (a.clockIn && !a.clockOut) return 'Missing clock-out';
  if (Number(a.lateMinutes) > 0) return `${a.lateMinutes} min late`;
  if (Number(a.undertimeMinutes) > 0) return `Left ${a.undertimeMinutes} min early`;
  if (Number(a.overtime) > 0) return `${a.overtime}h overtime`;
  return null;
}

export default function MyTimesheet() {
  const { user } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const employeeId = user?.id;

  const [offset, setOffset] = useState(0);
  const { start, end } = useMemo(() => periodByOffset(offset), [offset]);
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  const todayKey = toDateKey(new Date());
  const periodOver = todayKey > endKey;

  const allSheets = useTimesheets();
  const sheetsLoaded = useTimesheetsLoaded();
  const sheet = useMemo(
    () => (allSheets || []).find((t) => t.employeeId === employeeId && t.weekStart === startKey),
    [allSheets, employeeId, startKey]
  );

  const { data: days, loading: daysLoading, error: daysError } = useApiData(
    () => (employeeId ? timesheetService.getDays(employeeId, startKey, endKey) : Promise.resolve([])),
    [employeeId, startKey, endKey]
  );

  const totals = useMemo(() => {
    if (sheet) {
      return {
        regular: sheet.regularHours, holiday: sheet.regularHolidayHours + sheet.specialHolidayHours,
        overtime: sheet.overtimeHours, break: sheet.breakHours, total: sheet.totalHours,
        late: sheet.lateMinutes, undertime: sheet.undertimeMinutes,
      };
    }
    const rows = (days || []).map((d) => d.attendance).filter(Boolean);
    return {
      regular: round1(sum(rows, 'regularHours')),
      holiday: round1(sum(rows, 'regularHolidayHours') + sum(rows, 'specialHolidayHours')),
      overtime: round1(sum(rows, 'overtime')),
      break: round1(sum(rows, 'breakHours')),
      total: round1(sum(rows, 'totalHours')),
      late: sum(rows, 'lateMinutes'),
      undertime: sum(rows, 'undertimeMinutes'),
    };
  }, [sheet, days]);

  const [busy, setBusy] = useState(false);
  const handleSubmit = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      await submitTimesheet(sheet.id);
      toast.success('Timesheet Submitted', 'Sent for review.');
    } catch (e) {
      toast.error('Could not submit', e?.response?.data?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };
  const handleWithdraw = async () => {
    if (!sheet) return;
    setBusy(true);
    try {
      await withdrawTimesheet(sheet.id);
      toast.success('Submission Withdrawn', 'Back to draft - you can review it again before the deadline.');
    } catch (e) {
      toast.error('Could not withdraw', e?.response?.data?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const status = sheet?.status || (periodOver ? 'Draft' : 'Open');
  const dueAt = sheet ? new Date(sheet.dueAt) : periodDueAt(end);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Timesheet</h1>
          <p className="text-[14px] text-gray-500 mt-1">Your pay period, built from your actual attendance</p>
        </div>
      </div>

      {/* 1. Period header */}
      <Card>
        {sheet?.status === 'Rejected' && sheet.statusReason && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3">
            <p className="text-sm font-semibold text-red-800">Sent back for correction</p>
            <p className="text-sm text-red-700 mt-0.5">&ldquo;{sheet.statusReason}&rdquo;</p>
          </div>
        )}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <button onClick={() => setOffset((o) => o - 1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div>
              <p className="text-lg font-bold text-gray-900">{periodLabel(start, end)}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {periodOver ? (sheet?.status === 'Draft' || !sheet ? `Due ${dueAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}, ${dueAt.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : 'Period closed')
                  : 'Still in progress - totals update live'}
              </p>
            </div>
            <button onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <Badge variant={statusVariant[status] || 'default'} dot>{status === 'Open' ? 'In Progress' : status}</Badge>
        </div>
      </Card>

      {/* Totals */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Regular', value: `${totals.regular}h` },
          { label: 'Holiday', value: `${totals.holiday}h` },
          { label: 'Overtime', value: `${totals.overtime}h` },
          { label: 'Total', value: `${totals.total}h` },
        ].map((s) => (
          <Card key={s.label} className="text-center">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{s.label}</p>
            <p className="text-xl font-bold text-gray-900 mt-1">{s.value}</p>
          </Card>
        ))}
      </div>

      {/* 2 & 3. Day grid with inline exception flags */}
      <Card padding={false}>
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Daily Breakdown</h2>
        </div>
        {daysLoading ? (
          <div className="p-4"><SkeletonList rows={6} /></div>
        ) : daysError ? (
          <div className="p-8 text-center text-sm text-red-500">{daysError}</div>
        ) : (
          <div className="divide-y divide-gray-50 max-h-[520px] overflow-y-auto">
            {(days || []).map((d) => {
              const type = dayType(d, todayKey);
              const exception = dayException(d);
              const a = d.attendance;
              const dow = DAY_LABEL[new Date(`${d.date}T00:00:00`).getDay()];
              return (
                <div key={d.date} className={`flex items-center gap-3 px-5 py-3 ${d.date === todayKey ? 'bg-blue-50/40' : ''}`}>
                  <div className="w-16 shrink-0">
                    <p className="text-sm font-semibold text-gray-900">{formatDate(d.date).split(',')[0]}</p>
                    <p className="text-[11px] text-gray-400">{dow}</p>
                  </div>
                  <div className="w-24 shrink-0 text-xs text-gray-500">
                    {d.scheduledStart ? `${formatTime(d.scheduledStart)}–${formatTime(d.scheduledEnd)}` : '—'}
                  </div>
                  <div className="flex-1 min-w-0 text-xs text-gray-700">
                    {a ? `${a.clockIn ? formatTime(a.clockIn) : '—'} – ${a.clockOut ? formatTime(a.clockOut) : '—'}${a.breakHours ? ` · ${a.breakHours}h break` : ''}` : '—'}
                  </div>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full shrink-0 ${type.tone}`}>{type.label}</span>
                  <div className="w-14 text-right shrink-0 text-sm font-semibold text-gray-900">
                    {a ? `${a.totalHours}h` : ''}
                  </div>
                  <div className="w-6 shrink-0 flex justify-center">
                    {exception && (
                      <button
                        type="button"
                        title={`${exception} — click to request a correction`}
                        onClick={() => navigate(`/my-attendance?tab=corrections&date=${d.date}`)}
                        className="text-amber-500 hover:text-amber-700"
                      >
                        <AlertTriangle className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {(!days || days.length === 0) && (
              <EmptyState icon={Calendar} title="No days yet" description="This period hasn't started." />
            )}
          </div>
        )}
      </Card>

      {/* 4. Actions */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            <Clock className="w-3.5 h-3.5" />
            {sheet ? `Last updated from attendance automatically.` : 'Totals are calculated live from your attendance.'}
          </div>
          <div className="flex gap-3">
            {sheet?.status === 'Submitted' && (
              <Button variant="secondary" icon={Undo2} loading={busy} onClick={handleWithdraw}>Withdraw</Button>
            )}
            {(!sheet || sheet.status === 'Draft' || sheet.status === 'Rejected') && (
              <Button
                icon={Send}
                loading={busy}
                disabled={!sheet || !periodOver || Number(totals.total) <= 0}
                onClick={handleSubmit}
                title={!periodOver ? 'You can submit once the period ends' : undefined}
              >
                {sheet?.status === 'Rejected' ? 'Resubmit' : 'Submit'}
              </Button>
            )}
            {sheet?.status === 'Approved' && (
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700">
                <CheckCircle className="w-4 h-4" /> Approved{sheet.approvedBy ? ` by ${sheet.approvedBy}` : ''}
              </span>
            )}
          </div>
        </div>
      </Card>

      {/* Collapsed history */}
      {sheet && (sheet.history || []).length > 0 && (
        <details className="group">
          <summary className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none">
            <History className="w-3.5 h-3.5" /> History
          </summary>
          <Card className="mt-2"><HistoryTimeline history={sheet.history} /></Card>
        </details>
      )}

      {!sheetsLoaded && <div className="hidden" />}
    </div>
  );
}

function sum(rows, key) {
  return rows.reduce((s, r) => s + (Number(r[key]) || 0), 0);
}
function round1(n) {
  return Math.round(n * 100) / 100;
}
