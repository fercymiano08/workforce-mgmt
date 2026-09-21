import { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
  FileText, Clock, AlertTriangle, CheckCircle, Calendar, TrendingUp, Timer, Eye, Send, Info,
  X, XCircle, CheckCheck, ChevronLeft, ChevronRight, RefreshCw, ArrowUpDown, ArrowUp, ArrowDown, RotateCcw, Banknote,
} from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import SearchBar from '../../components/ui/SearchBar';
import { Select } from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Table';
import {
  useTimesheets, useTimesheetsLoaded, approveTimesheet, rejectTimesheet, reopenTimesheet, exportTimesheetsForPayroll,
  submitTimesheet, refreshTimesheets,
} from '../../hooks/useTimesheets';
import { StatusSteps, HistoryTimeline } from '../../components/timesheets/WorkflowParts';
import { FLAG_INFO } from '../../utils/timesheetWorkflow';
import { formatDate, formatTime } from '../../utils/helpers';
import { toDateKey } from '../../services/attendanceService';
import { attendanceService } from '../../services/api';
import useApiData from '../../hooks/useApiData';
import KpiCard from '../../components/dashboard/KpiCard';
import { downloadCSV } from '../../utils/export';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { SkeletonPage } from '../../components/ui/LoadingSkeleton';

const statusVariant = {
  Draft: 'default',
  Submitted: 'info',
  Approved: 'success',
  Rejected: 'danger',
};

// ---------------------------------------------------------------------------
// Workforce Admin view - review every employee's weekly timesheet.
// The employee submits (or the system does at the deadline); the admin approves, rejects (with a
// reason) or reopens; approved timesheets are then sent to payroll, once each. Hours cannot be edited:
// they come from attendance and freeze when the timesheet is submitted.
// ---------------------------------------------------------------------------
const WEEK_HOURS = 40;
const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const attendanceVariant = {
  Present: 'success', Late: 'warning', 'Early Leave': 'info', Absent: 'danger', 'On Leave': 'purple',
};
const flagTone = { red: 'bg-red-50 text-red-700 border-red-100', amber: 'bg-amber-50 text-amber-700 border-amber-100', purple: 'bg-purple-50 text-purple-700 border-purple-100' };

const hoursText = (n) => `${Number(n || 0).toFixed(2).replace(/\.?0+$/, '') || '0'}h`;
const addDays = (key, n) => {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + n);
  return toDateKey(d);
};
const mondayOf = (date) => {
  const d = new Date(date);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toDateKey(d);
};
const shortRange = (a, b) => `${formatDate(a)} – ${formatDate(b)}`;

const PERIODS = [
  { id: 'all', label: 'All time' },
  { id: 'this', label: 'This week' },
  { id: 'last', label: 'Last week' },
  { id: '4w', label: 'Last 4 weeks' },
];

const SORTS = {
  week: (a, b) => (a.weekStart || '').localeCompare(b.weekStart || ''),
  employee: (a, b) => (a.employeeName || '').localeCompare(b.employeeName || ''),
  total: (a, b) => (a.totalHours || 0) - (b.totalHours || 0),
  overtime: (a, b) => (a.paidOtHours || 0) - (b.paidOtHours || 0),
  status: (a, b) => (a.status || '').localeCompare(b.status || ''),
};

// One employee's week, day by day, from their attendance records.
function WeekBreakdown({ ts }) {
  const { data: records, loading, error } = useApiData(() => attendanceService.getByEmployeeId(ts.employeeId), [ts.employeeId]);

  const days = useMemo(() => {
    const byDate = new Map((records || []).map((r) => [r.date, r]));
    return DAY_NAMES.map((name, i) => {
      const key = addDays(ts.weekStart, i);
      return { name, key, day: Number(key.slice(8, 10)), record: byDate.get(key) };
    });
  }, [records, ts.weekStart]);

  const tallest = Math.max(10, ...days.map((d) => d.record?.totalHours || 0));

  if (loading) return <p className="text-sm text-gray-400">Loading the daily records...</p>;
  if (error) return <p className="text-sm text-red-500">Could not load the daily records: {error}</p>;

  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      {days.map(({ name, key, day, record }) => (
        <div key={key} className="flex items-center gap-3 px-3 py-2.5 border-b border-gray-50 last:border-0">
          <div className="w-11 shrink-0 text-center">
            <p className="text-[10px] uppercase tracking-wide text-gray-400">{name}</p>
            <p className="text-sm font-semibold text-gray-800 leading-none">{day}</p>
          </div>
          {record ? (
            <>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={attendanceVariant[record.status] || 'default'} size="xs">{record.status}</Badge>
                  <span className="text-xs text-gray-500">
                    {record.clockIn ? formatTime(record.clockIn) : '—'} – {record.clockOut ? formatTime(record.clockOut) : <span className="text-red-500 font-medium">no clock-out</span>}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-gray-100 overflow-hidden flex">
                  <div className="bg-blue-500" style={{ width: `${Math.min(100, ((record.regularHours || 0) / tallest) * 100)}%` }} />
                  <div className="bg-amber-400" style={{ width: `${Math.min(100, ((record.overtime || 0) / tallest) * 100)}%` }} />
                </div>
              </div>
              <div className="text-right shrink-0">
                <p className="text-sm font-semibold text-gray-900">{hoursText(record.totalHours)}</p>
                {record.overtime > 0 && <p className="text-[10px] text-amber-600">{hoursText(record.overtime)} OT</p>}
              </div>
            </>
          ) : (
            <p className="flex-1 text-xs text-gray-300">{name === 'Sat' || name === 'Sun' ? 'Rest day' : 'No record'}</p>
          )}
        </div>
      ))}
    </div>
  );
}

function TimesheetPanel({ ts, position, onClose, onPrev, onNext, onDecide, busy }) {
  // which form is open at the bottom: null | 'reject' | 'reopen'
  const [mode, setMode] = useState(null);
  const [reason, setReason] = useState('');
  const paid = ts.paidOtHours ?? 0;
  const notPaid = Math.max(0, (ts.overtimeHours || 0) - paid);
  const filled = Math.min(100, ((ts.totalHours || 0) / WEEK_HOURS) * 100);
  const flags = ts.flags || [];
  const canReopen = (ts.status === 'Submitted' || ts.status === 'Approved') && !ts.exportedAt;
  const reasonOk = reason.trim().length >= 5;

  const closeForm = () => { setMode(null); setReason(''); };
  const send = async (action) => { await onDecide(ts, action, reason.trim()); closeForm(); };

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={onClose}>
      <aside className="w-full max-w-lg h-full bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-gray-100">
          <div className="flex items-center gap-1">
            <button type="button" onClick={onPrev} disabled={!onPrev} aria-label="Previous timesheet" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button type="button" onClick={onNext} disabled={!onNext} aria-label="Next timesheet" className="p-1.5 rounded-lg text-gray-500 hover:bg-gray-100 disabled:opacity-30 disabled:hover:bg-transparent">
              <ChevronRight className="w-5 h-5" />
            </button>
            <span className="text-xs text-gray-400 ml-1">{position}</span>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="flex items-center gap-4">
            <Avatar firstName={(ts.employeeName || '').split(' ')[0]} lastName={(ts.employeeName || '').split(' ').slice(1).join(' ')} size="xl" />
            <div className="min-w-0">
              <h3 className="text-xl font-bold text-gray-900 truncate">{ts.employeeName}</h3>
              <p className="text-sm text-gray-500">{ts.employeeId}</p>
              <div className="flex gap-2 mt-1.5 flex-wrap">
                <Badge variant="primary" size="xs">{ts.department}</Badge>
                <Badge variant={statusVariant[ts.status]} dot size="xs">{ts.status}</Badge>
                {ts.autoSubmitted && <Badge variant="info" size="xs">Auto-submitted</Badge>}
                {ts.exportedAt && <Badge variant="purple" size="xs">Sent to payroll</Badge>}
              </div>
            </div>
          </div>

          <StatusSteps status={ts.status} />

          <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 rounded-xl text-sm text-gray-700">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="font-medium">{shortRange(ts.weekStart, ts.weekEnd)}</span>
            {!ts.weekFinished && <span className="ml-auto text-xs font-semibold text-blue-600">Week still in progress</span>}
          </div>

          {flags.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 flex items-center gap-1.5"><AlertTriangle className="w-3.5 h-3.5" /> Check before approving</p>
              <ul className="space-y-1 text-sm text-gray-700">
                {flags.map((f) => <li key={f}>• {FLAG_INFO[f]?.label || f}{f === 'changed_after_submit' ? ' - reopen it so the hours are brought up to date' : ''}</li>)}
              </ul>
            </div>
          )}

          {ts.statusReason && (ts.status === 'Rejected' || ts.status === 'Draft') && (
            <div className={`rounded-xl px-4 py-3 text-sm ${ts.status === 'Rejected' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'}`}>
              <p className="font-semibold">{ts.status === 'Rejected' ? 'Rejected because' : 'Reopened because'}</p>
              <p className="mt-0.5">{ts.statusReason}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-emerald-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-emerald-600">Total counted</p>
              <p className="text-2xl font-bold text-emerald-700 mt-1">{hoursText(ts.totalHours)}</p>
              <div className="mt-2 h-1.5 rounded-full bg-emerald-100 overflow-hidden"><div className="h-full bg-emerald-500" style={{ width: `${filled}%` }} /></div>
              <p className="text-[11px] text-emerald-600 mt-1">{Math.round(filled)}% of a {WEEK_HOURS}h week</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-blue-600">Regular</p>
              <p className="text-2xl font-bold text-blue-700 mt-1">{hoursText(ts.regularHours)}</p>
              <p className="text-[11px] text-blue-600 mt-3">Break: {hoursText(ts.breakHours)}</p>
            </div>
            <div className="rounded-xl bg-amber-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-600">Overtime</p>
              <p className="text-2xl font-bold text-amber-700 mt-1">{hoursText(ts.overtimeHours)}</p>
              <p className="text-[11px] text-amber-600 mt-1">{ts.approvedOtHours > 0 ? `${hoursText(ts.approvedOtHours)} approved` : 'None approved'}</p>
            </div>
            <div className="rounded-xl bg-purple-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-purple-600">Payable overtime</p>
              <p className="text-2xl font-bold text-purple-700 mt-1">{hoursText(paid)}</p>
              <p className="text-[11px] text-purple-600 mt-1">{notPaid > 0 ? `${hoursText(notPaid)} not paid` : 'All overtime paid'}</p>
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Day by day</p>
            <WeekBreakdown ts={ts} />
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">History</p>
            <HistoryTimeline history={ts.history} />
          </div>

          {ts.notes && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Notes</p>
              <p className="text-sm text-gray-700">{ts.notes}</p>
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-gray-100 bg-white space-y-3">
          {mode ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold text-gray-800">{mode === 'reject' ? 'Why is this timesheet being rejected?' : 'Why is it being reopened?'}</p>
              <textarea
                autoFocus
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder={mode === 'reject' ? 'e.g. Tuesday has no clock-out. The employee sees this.' : 'e.g. Attendance was corrected after submission.'}
                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30"
              />
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs text-gray-400">{reasonOk ? 'The employee will be told.' : 'A few words are needed.'}</span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={closeForm}>Cancel</Button>
                  <Button variant={mode === 'reject' ? 'danger' : 'primary'} size="sm" loading={busy} disabled={!reasonOk} onClick={() => send(mode)}>
                    {mode === 'reject' ? 'Reject timesheet' : 'Reopen timesheet'}
                  </Button>
                </div>
              </div>
            </div>
          ) : ts.status === 'Submitted' ? (
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <button type="button" onClick={() => setMode('reopen')} className="text-xs font-semibold text-gray-500 hover:text-gray-800">Reopen instead</button>
              <div className="flex gap-3">
                <Button variant="danger" icon={XCircle} onClick={() => setMode('reject')}>Reject</Button>
                <Button variant="success" icon={CheckCircle} loading={busy} onClick={() => send('approve')}>Approve</Button>
              </div>
            </div>
          ) : canReopen ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-gray-500 flex items-center gap-2"><Info className="w-4 h-4 text-gray-400" /> Approved. It can still be reopened until it is sent to payroll.</p>
              <Button variant="outline" size="sm" icon={RotateCcw} onClick={() => setMode('reopen')}>Reopen</Button>
            </div>
          ) : (
            <p className="text-sm text-gray-500 flex items-center gap-2">
              <Info className="w-4 h-4 text-gray-400" />
              {ts.exportedAt ? 'Sent to payroll. It is now closed.' : ts.status === 'Rejected' ? 'Waiting for the employee to fix it and submit again.' : 'Waiting for the employee to submit it.'}
            </p>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
}

function AdminTimesheetsView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const reviewer = user ? `${user.firstName} ${user.lastName}` : 'HR Admin';

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('Submitted');
  const [deptFilter, setDeptFilter] = useState('All');
  const [period, setPeriod] = useState('all');
  const [flag, setFlag] = useState('');
  const [sort, setSort] = useState({ key: 'week', dir: 'desc' });
  const [pageSize, setPageSize] = useState(10);
  const [currentPage, setCurrentPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [checked, setChecked] = useState(() => new Set());
  const [busy, setBusy] = useState(false);
  const [confirmPayroll, setConfirmPayroll] = useState(false);

  const data = useTimesheets();
  const timesheetsLoaded = useTimesheetsLoaded();

  const departments = useMemo(() => ['All', ...new Set(data.map((t) => t.department).filter(Boolean))], [data]);
  const thisMonday = mondayOf(new Date());
  const flagsOf = (t) => t.flags || [];

  // Everything except the status filter, so the status pills can show honest counts.
  const base = useMemo(() => data.filter((t) => {
    if (search && !(t.employeeName || '').toLowerCase().includes(search.toLowerCase()) && !(t.employeeId || '').toLowerCase().includes(search.toLowerCase())) return false;
    if (deptFilter !== 'All' && t.department !== deptFilter) return false;
    if (period === 'this' && t.weekStart !== thisMonday) return false;
    if (period === 'last' && t.weekStart !== addDays(thisMonday, -7)) return false;
    if (period === '4w' && (t.weekStart || '') < addDays(thisMonday, -21)) return false;
    if (flag && !(flag === 'payroll' ? t.status === 'Approved' && !t.exportedAt : (t.flags || []).includes(flag))) return false;
    return true;
  }), [data, search, deptFilter, period, flag, thisMonday]);

  const rows = useMemo(() => {
    const list = base.filter((t) => statusFilter === 'All' || t.status === statusFilter);
    const cmp = SORTS[sort.key] || SORTS.week;
    return [...list].sort((a, b) => (sort.dir === 'asc' ? cmp(a, b) : cmp(b, a)));
  }, [base, statusFilter, sort]);

  const count = (status) => base.filter((t) => t.status === status).length;
  const submitted = base.filter((t) => t.status === 'Submitted');
  const totalHours = base.reduce((s, t) => s + (t.totalHours || 0), 0);
  const regularHours = base.reduce((s, t) => s + (t.regularHours || 0), 0);
  const overtimeHours = base.reduce((s, t) => s + (t.overtimeHours || 0), 0);
  const paidOt = base.reduce((s, t) => s + (t.paidOtHours || 0), 0);

  // How well the process is running (all timesheets that were submitted).
  const compliance = useMemo(() => {
    const sent = data.filter((t) => t.submittedAt);
    const onTime = sent.filter((t) => !t.autoSubmitted && new Date(t.submittedAt) <= new Date(t.dueAt)).length;
    const reviewed = data.filter((t) => t.submittedAt && t.reviewedAt);
    const avgHours = reviewed.length ? reviewed.reduce((s, t) => s + (new Date(t.reviewedAt) - new Date(t.submittedAt)) / 3600000, 0) / reviewed.length : null;
    return {
      onTimePct: sent.length ? Math.round((onTime / sent.length) * 100) : null,
      onTime, sent: sent.length,
      auto: sent.filter((t) => t.autoSubmitted).length,
      avgHours,
    };
  }, [data]);
  const avgApproval = compliance.avgHours == null ? '—' : compliance.avgHours < 1 ? '< 1 h' : compliance.avgHours < 48 ? `${Math.round(compliance.avgHours)} h` : `${(compliance.avgHours / 24).toFixed(1)} days`;

  const readyForPayroll = data.filter((t) => t.status === 'Approved' && !t.exportedAt);
  const attention = [
    { id: 'pending', label: 'Waiting for review', n: data.filter((t) => t.status === 'Submitted').length, icon: Clock, tone: 'amber', apply: () => { setFlag(''); setStatusFilter('Submitted'); } },
    { id: 'payroll', label: 'Ready for payroll', n: readyForPayroll.length, icon: Banknote, tone: 'purple', apply: () => { setStatusFilter('Approved'); setFlag('payroll'); } },
    { id: 'changed', label: 'Attendance changed after submit', n: data.filter((t) => flagsOf(t).includes('changed_after_submit')).length, icon: AlertTriangle, tone: 'red', apply: () => { setStatusFilter('All'); setFlag('changed_after_submit'); } },
    { id: 'clockout', label: 'Missing clock-out', n: data.filter((t) => flagsOf(t).includes('missing_clock_out')).length, icon: AlertTriangle, tone: 'amber', apply: () => { setStatusFilter('All'); setFlag('missing_clock_out'); } },
    { id: 'rejected', label: 'Rejected', n: data.filter((t) => t.status === 'Rejected').length, icon: XCircle, tone: 'red', apply: () => { setFlag(''); setStatusFilter('Rejected'); } },
  ];

  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const pageRows = rows.slice((page - 1) * pageSize, page * pageSize);
  const reviewable = pageRows.filter((t) => t.status === 'Submitted');
  const allChecked = reviewable.length > 0 && reviewable.every((t) => checked.has(t.id));
  const openIndex = rows.findIndex((t) => t.id === openId);
  const openTs = openIndex >= 0 ? rows[openIndex] : null;

  const resetPage = () => setCurrentPage(1);
  const clearAll = () => { setSearch(''); setStatusFilter('All'); setDeptFilter('All'); setPeriod('all'); setFlag(''); resetPage(); };
  const filtersOn = search || statusFilter !== 'All' || deptFilter !== 'All' || period !== 'all' || flag;

  const toggleSort = (key) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'employee' ? 'asc' : 'desc' }));
  const sortIcon = (key) => (sort.key !== key ? <ArrowUpDown className="w-3 h-3 text-gray-300" /> : sort.dir === 'asc' ? <ArrowUp className="w-3 h-3 text-blue-600" /> : <ArrowDown className="w-3 h-3 text-blue-600" />);

  const toggleCheck = (id) => setChecked((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const togglePage = () => setChecked((prev) => { const next = new Set(prev); reviewable.forEach((t) => (allChecked ? next.delete(t.id) : next.add(t.id))); return next; });

  // action: 'approve' | 'reject' | 'reopen' (reject and reopen need a reason)
  const decide = async (list, action, reason = '') => {
    setBusy(true);
    let done = 0;
    let lastError = '';
    for (const ts of list) {
      try {
        if (action === 'approve') await approveTimesheet(ts.id, reviewer);
        else if (action === 'reject') await rejectTimesheet(ts.id, reason);
        else await reopenTimesheet(ts.id, reason);
        done += 1;
      } catch (err) { lastError = err?.response?.data?.message || ''; }
    }
    await refreshTimesheets();
    setBusy(false);
    setChecked(new Set());
    const verb = { approve: 'approved', reject: 'rejected', reopen: 'reopened' }[action];
    if (done === list.length) toast.success(`Timesheet${list.length === 1 ? '' : 's'} ${verb}`, list.length === 1 ? `${list[0].employeeName}'s timesheet was ${verb}.` : `${done} timesheets were ${verb}.`);
    else toast.error(`Could not ${action} all`, lastError || `${done} of ${list.length} timesheets were ${verb}.`);
  };

  // Bulk approve only takes the clean ones; anything with a warning has to be opened and looked at.
  const bulkApprove = () => {
    const chosen = data.filter((t) => checked.has(t.id));
    const clean = chosen.filter((t) => flagsOf(t).length === 0);
    if (clean.length < chosen.length) toast.warning('Some skipped', `${chosen.length - clean.length} timesheet(s) have warnings and were left for you to open.`);
    if (clean.length === 0) { toast.error('Nothing approved', 'Every selected timesheet has a warning. Open them one by one.'); return; }
    decide(clean, 'approve');
  };

  const csvRows = (list) => list.map((t) => ({
    Employee: t.employeeName,
    'Employee ID': t.employeeId,
    Department: t.department,
    'Week start': t.weekStart,
    'Week end': t.weekEnd,
    'Regular hours': t.regularHours,
    'Break hours': t.breakHours,
    'Overtime worked': t.overtimeHours,
    'Overtime approved': t.approvedOtHours ?? 0,
    'Overtime paid': t.paidOtHours ?? 0,
    'Total hours': t.totalHours,
    Status: t.status,
    'Reviewed by': t.approvedBy || '',
    'Submitted by': t.submittedBy || '',
    'Auto-submitted': t.autoSubmitted ? 'Yes' : 'No',
  }));

  // Sends every approved timesheet not yet sent to payroll, marks them sent, and downloads the payroll file.
  const sendToPayroll = async () => {
    setBusy(true);
    try {
      const sent = await exportTimesheetsForPayroll({});
      await refreshTimesheets();
      downloadCSV(`payroll-timesheets-${toDateKey(new Date())}.csv`, csvRows(sent));
      toast.success('Sent to payroll', `${sent.length} approved timesheet${sent.length === 1 ? '' : 's'} sent and downloaded.`);
    } catch (err) {
      toast.error('Nothing sent', err?.response?.data?.message || 'Could not send to payroll.');
    }
    setBusy(false);
    setConfirmPayroll(false);
  };

  if (!timesheetsLoaded) return <SkeletonPage kpiCount={4} />;

  const pill = (active) => clsx(
    'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap',
    active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700',
  );
  const readyHours = readyForPayroll.reduce((s, t) => s + (t.totalHours || 0), 0);

  return (
    <div className="space-y-6 animate-fadeIn pb-20">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-blue-600" /></div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
            <p className="text-[14px] text-gray-500 mt-0.5">Employees submit their week; you approve it, then send it to payroll.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" icon={RefreshCw} size="md" onClick={() => refreshTimesheets()}>Refresh</Button>
          <Button variant="primary" icon={Banknote} size="md" disabled={readyForPayroll.length === 0} onClick={() => setConfirmPayroll(true)}>
            Send to payroll{readyForPayroll.length > 0 ? ` (${readyForPayroll.length})` : ''}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Waiting for review" value={submitted.length} icon={Clock} accent="amber" noBar subtext={`${hoursText(submitted.reduce((s, t) => s + (t.totalHours || 0), 0))} to approve`} />
        <KpiCard label="Approved" value={count('Approved')} icon={CheckCircle} accent="emerald" noBar subtext={`of ${base.length} timesheet${base.length === 1 ? '' : 's'}`} />
        <KpiCard label="Hours counted" value={hoursText(totalHours)} icon={Timer} accent="blue" noBar subtext={`${hoursText(regularHours)} regular · ${hoursText(overtimeHours)} overtime`} />
        <KpiCard label="Overtime paid" value={hoursText(paidOt)} icon={TrendingUp} accent="purple" noBar subtext={`${base.filter((t) => (t.paidOtHours || 0) > 0).length} employee-week(s)`} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">On-time submissions</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{compliance.onTimePct == null ? '—' : `${compliance.onTimePct}%`}</p>
          <p className="text-xs text-gray-400 mt-1">{compliance.onTime} of {compliance.sent} submitted by the employee before the deadline</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Average time to review</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{avgApproval}</p>
          <p className="text-xs text-gray-400 mt-1">From submitted to approved or rejected</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Submitted automatically</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{compliance.auto}</p>
          <p className="text-xs text-gray-400 mt-1">The employee missed the deadline</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {attention.filter((a) => a.n > 0).map((a) => (
          <button key={a.id} type="button" onClick={a.apply} className={clsx('inline-flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-semibold hover:shadow-sm transition-shadow', flagTone[a.tone])}>
            <a.icon className="w-3.5 h-3.5" /> {a.label}
            <span className="px-1.5 py-0.5 rounded-md bg-white/70 text-[11px]">{a.n}</span>
          </button>
        ))}
      </div>

      <Card padding={false}>
        <div className="p-4 space-y-3 border-b border-gray-100">
          <div className="flex flex-col lg:flex-row gap-3">
            <SearchBar value={search} onChange={(v) => { setSearch(v); resetPage(); }} placeholder="Search by employee name or ID..." className="flex-1 min-w-[220px]" />
            <Select value={deptFilter} onChange={(e) => { setDeptFilter(e.target.value); resetPage(); }} containerClass="w-full lg:w-52">
              {departments.map((d) => <option key={d} value={d}>{d === 'All' ? 'All departments' : d}</option>)}
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mr-1">Status</span>
              {['All', 'Draft', 'Submitted', 'Approved', 'Rejected'].map((s) => (
                <button key={s} type="button" className={pill(statusFilter === s)} onClick={() => { setStatusFilter(s); resetPage(); }}>
                  {s === 'Draft' ? 'In progress' : s}{s !== 'All' && <span className="ml-1.5 opacity-70">{count(s)}</span>}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mr-1">Week</span>
              {PERIODS.map((p) => <button key={p.id} type="button" className={pill(period === p.id)} onClick={() => { setPeriod(p.id); resetPage(); }}>{p.label}</button>)}
            </div>
            {filtersOn && <button type="button" onClick={clearAll} className="ml-auto text-xs font-semibold text-blue-600 hover:text-blue-700">Show everything</button>}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/60">
                <th className="pl-4 pr-1 py-3 w-8">
                  <input type="checkbox" checked={allChecked} onChange={togglePage} disabled={reviewable.length === 0} aria-label="Select all submitted timesheets on this page" className="rounded border-gray-300" />
                </th>
                {[['employee', 'Employee'], ['week', 'Week'], [null, 'Hours'], ['overtime', 'Overtime paid'], ['total', 'Total'], ['status', 'Status']].map(([key, label]) => (
                  <th key={label} className="px-3 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap">
                    {key ? <button type="button" onClick={() => toggleSort(key)} className="inline-flex items-center gap-1 hover:text-gray-800">{label} {sortIcon(key)}</button> : label}
                  </th>
                ))}
                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {pageRows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-14 text-center text-sm text-gray-400">
                  {statusFilter === 'Submitted' && !flag && !search && deptFilter === 'All' && period === 'all'
                    ? 'Nothing is waiting for your review. You are all caught up.'
                    : filtersOn ? 'No timesheets match these filters.' : 'No timesheets yet. They appear once employees clock out.'}
                </td></tr>
              ) : pageRows.map((ts) => {
                const regularPct = Math.min(100, ((ts.regularHours || 0) / WEEK_HOURS) * 100);
                const otPct = Math.min(100 - regularPct, ((ts.overtimeHours || 0) / WEEK_HOURS) * 100);
                const notPaid = Math.max(0, (ts.overtimeHours || 0) - (ts.paidOtHours ?? 0));
                const isThisWeek = ts.weekStart === thisMonday;
                const flags = flagsOf(ts);
                return (
                  <tr key={ts.id} onClick={() => setOpenId(ts.id)} className="hover:bg-blue-50/40 transition-colors cursor-pointer">
                    <td className="pl-4 pr-1 py-3" onClick={(e) => e.stopPropagation()}>
                      {ts.status === 'Submitted' && <input type="checkbox" checked={checked.has(ts.id)} onChange={() => toggleCheck(ts.id)} aria-label={`Select ${ts.employeeName}`} className="rounded border-gray-300" />}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar firstName={(ts.employeeName || '').split(' ')[0]} lastName={(ts.employeeName || '').split(' ').slice(1).join(' ')} size="sm" />
                        <div className="min-w-0">
                          <p className="font-semibold text-sm text-gray-900 truncate">{ts.employeeName}</p>
                          <p className="text-xs text-gray-400 truncate">{ts.employeeId} · {ts.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <p className="text-sm text-gray-800">{shortRange(ts.weekStart, ts.weekEnd)}</p>
                      {isThisWeek && <span className="text-[10px] font-semibold text-blue-600">This week</span>}
                    </td>
                    <td className="px-3 py-3 min-w-[150px]">
                      <div className="flex h-2 rounded-full bg-gray-100 overflow-hidden">
                        <div className="bg-blue-500" style={{ width: `${regularPct}%` }} />
                        <div className="bg-amber-400" style={{ width: `${otPct}%` }} />
                      </div>
                      <p className="text-[11px] text-gray-500 mt-1">{hoursText(ts.regularHours)} regular{ts.overtimeHours > 0 ? ` + ${hoursText(ts.overtimeHours)} OT` : ''}</p>
                    </td>
                    <td className="px-3 py-3 text-sm whitespace-nowrap">
                      {(ts.paidOtHours || 0) > 0 ? <span className="font-semibold text-purple-700">{hoursText(ts.paidOtHours)}</span> : <span className="text-gray-300">—</span>}
                      {notPaid > 0 && <p className="text-[11px] text-red-500">{hoursText(notPaid)} not paid</p>}
                    </td>
                    <td className="px-3 py-3 text-sm font-bold text-gray-900 whitespace-nowrap">{hoursText(ts.totalHours)}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge variant={statusVariant[ts.status]} dot size="xs">{ts.status === 'Draft' && !ts.weekFinished ? 'In progress' : ts.status}</Badge>
                        {ts.autoSubmitted && <span className="text-[10px] font-semibold text-blue-600" title="The employee missed the deadline, so the system submitted it">auto</span>}
                        {ts.exportedAt && <Banknote className="w-3.5 h-3.5 text-purple-500" title="Sent to payroll" />}
                      </div>
                      {flags.length > 0 && (
                        <p className="text-[11px] text-amber-600 mt-0.5 flex items-center gap-1" title={flags.map((f) => FLAG_INFO[f]?.label || f).join(', ')}>
                          <AlertTriangle className="w-3 h-3" /> {FLAG_INFO[flags[0]]?.label}{flags.length > 1 ? ` +${flags.length - 1}` : ''}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1">
                        {ts.status === 'Submitted' && flags.length === 0 && (
                          <button type="button" title="Approve" aria-label={`Approve ${ts.employeeName}'s timesheet`} disabled={busy} onClick={() => decide([ts], 'approve')} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-50 disabled:opacity-40">
                            <CheckCircle className="w-[18px] h-[18px]" />
                          </button>
                        )}
                        <button type="button" title={ts.status === 'Submitted' && flags.length > 0 ? 'Has warnings - open to review' : 'View details'} aria-label={`View ${ts.employeeName}'s timesheet`} onClick={() => setOpenId(ts.id)} className={clsx('p-1.5 rounded-lg hover:bg-gray-100 hover:text-blue-600', ts.status === 'Submitted' && flags.length > 0 ? 'text-amber-500' : 'text-gray-400')}>
                          <Eye className="w-[18px] h-[18px]" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between gap-3 flex-wrap px-4 py-3 border-t border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-3">
            <p className="text-xs text-gray-500">{rows.length} timesheet{rows.length === 1 ? '' : 's'}</p>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); resetPage(); }} className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none">
              {[10, 25, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
            </select>
          </div>
          {totalPages > 1 && <Pagination currentPage={page} totalPages={totalPages} onPageChange={setCurrentPage} />}
        </div>
      </Card>

      {openTs && (
        <TimesheetPanel
          key={openTs.id}
          ts={openTs}
          position={`${openIndex + 1} of ${rows.length}`}
          busy={busy}
          onClose={() => setOpenId(null)}
          onPrev={openIndex > 0 ? () => setOpenId(rows[openIndex - 1].id) : null}
          onNext={openIndex < rows.length - 1 ? () => setOpenId(rows[openIndex + 1].id) : null}
          onDecide={async (t, action, reason) => { await decide([t], action, reason); }}
        />
      )}

      <Modal isOpen={confirmPayroll} onClose={() => setConfirmPayroll(false)} title="Send approved timesheets to payroll" size="md">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            <span className="font-semibold">{readyForPayroll.length}</span> approved timesheet{readyForPayroll.length === 1 ? '' : 's'} ({hoursText(readyHours)} in total) will be marked as sent and downloaded as a file for payroll.
          </p>
          <p className="text-sm text-gray-500 flex items-start gap-2"><Info className="w-4 h-4 mt-0.5 shrink-0 text-gray-400" /> Each week is sent only once, so it can never be paid twice. After this, those timesheets can no longer be reopened.</p>
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={() => setConfirmPayroll(false)}>Cancel</Button>
            <Button variant="primary" icon={Banknote} loading={busy} onClick={sendToPayroll}>Send and download</Button>
          </div>
        </div>
      </Modal>

      {checked.size > 0 && createPortal(
        <div className="fixed bottom-6 left-1/2 lg:left-[calc(50%+130px)] -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-900 text-white rounded-2xl shadow-2xl px-5 py-3">
          <span className="text-sm font-medium">{checked.size} selected</span>
          <div className="w-px h-5 bg-gray-700" />
          <Button variant="success" size="sm" icon={CheckCheck} loading={busy} onClick={bulkApprove}>Approve clean ones</Button>
          <button type="button" onClick={() => setChecked(new Set())} className="ml-1 text-gray-400 hover:text-white text-xs">Clear</button>
        </div>,
        document.body,
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Employee self-service view — only the logged-in employee's timesheets.
// Employees can view details and submit draft timesheets only. They cannot
// approve, reject, or modify timesheets.
// ---------------------------------------------------------------------------
function EmployeeTimesheetsView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const employeeId = user?.id || 'EMP001';
  const [statusFilter, setStatusFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTimesheet, setSelectedTimesheet] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  const data = useTimesheets();
  const timesheetsLoaded = useTimesheetsLoaded();

  const records = useMemo(
    () => data.filter((t) => t.employeeId === employeeId),
    [data, employeeId]
  );

  const statuses = ['All', 'Draft', 'Submitted', 'Approved', 'Rejected'];

  const latest = useMemo(() => {
    return [...records].sort((a, b) => b.weekEnd.localeCompare(a.weekEnd))[0];
  }, [records]);

  const stats = useMemo(() => ({
    totalHoursThisWeek: latest?.totalHours || 0,
    overtimeHours: latest?.overtimeHours || 0,
    approved: records.filter(t => t.status === 'Approved').length,
    pendingSubmission: records.filter(t => t.status === 'Draft').length,
  }), [records, latest]);

  const statCards = [
    { label: 'Total Hours This Week', value: `${stats.totalHoursThisWeek}h`, icon: Timer, color: 'blue' },
    { label: 'Overtime Hours', value: `${stats.overtimeHours}h`, icon: TrendingUp, color: 'amber' },
    { label: 'Approved Timesheets', value: stats.approved, icon: CheckCircle, color: 'emerald' },
    { label: 'Pending Submission', value: stats.pendingSubmission, icon: Clock, color: 'purple' },
  ];

  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    purple: 'bg-purple-50 text-purple-600',
  };
  const barMap = {
    blue: 'bg-blue-500',
    emerald: 'bg-emerald-500',
    amber: 'bg-amber-500',
    purple: 'bg-purple-500',
  };

  const filtered = useMemo(() => {
    return records.filter(t => statusFilter === 'All' || t.status === statusFilter);
  }, [records, statusFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const paginated = filtered.slice((currentPage - 1) * 10, currentPage * 10);

  const openDetail = (ts) => { setSelectedTimesheet(ts); setIsDetailOpen(true); };

  const handleSubmit = async (ts) => {
    try {
      const updated = await submitTimesheet(ts.id);
      await refreshTimesheets();
      setSelectedTimesheet(updated || { ...ts, status: 'Submitted', submittedDate: new Date().toISOString().slice(0, 10) });
      toast.success('Timesheet Submitted', 'Timesheet submitted successfully for HR review.');
    } catch {
      toast.error('Error', 'Failed to submit timesheet.');
    }
  };

  if (!timesheetsLoaded) {
    return <SkeletonPage kpiCount={4} />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Timesheets</h1>
          <p className="text-[14px] text-gray-500 mt-1">Review, submit, and track your weekly timesheets</p>
        </div>
      </div>

      {/* Auto-generated note */}
      <div className="flex items-center gap-2 px-4 py-3 bg-sky-50 border border-sky-200 rounded-xl">
        <Info className="w-4 h-4 text-sky-600 flex-shrink-0" />
        <p className="text-sm text-sky-700">
          Timesheets are automatically generated based on your recorded attendance and working hours.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(s => (
          <Card key={s.label} className="overflow-hidden">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{s.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${colorMap[s.color]}`}>
                <s.icon className="w-6 h-6" />
              </div>
            </div>
            <div className={`h-1 rounded-full mt-4 ${barMap[s.color]}`} />
          </Card>
        ))}
      </div>

      {/* Timesheet list */}
      <Card padding={false}>
        <div className="p-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <Select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
            containerClass="w-44"
          >
            {statuses.map(s => (
              <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
            ))}
          </Select>
          <p className="text-sm text-gray-500">{records.length} timesheet{records.length === 1 ? '' : 's'}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Period', 'Regular Hours', 'Overtime', 'Total Hours', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-sm text-gray-400">
                    No timesheets found.
                  </td>
                </tr>
              ) : (
                paginated.map(ts => (
                  <tr key={ts.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-sm text-gray-700">
                        <Calendar className="w-3.5 h-3.5 text-gray-400" />
                        {formatDate(ts.weekStart)} &ndash; {formatDate(ts.weekEnd)}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700 font-medium">{ts.regularHours}h</td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">
                      {ts.overtimeHours > 0 ? (
                        <div className="flex items-center gap-1.5">
                          <span className="text-amber-600 font-medium">{ts.overtimeHours}h</span>
                          {ts.approvedOtHours > 0 && (
                            <span className="text-xs text-gray-400">· {ts.approvedOtHours}h approved</span>
                          )}
                          {(ts.approvedOtHours == null || ts.approvedOtHours === 0) && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" title={`Unauthorized overtime - ${ts.overtimeHours}h clocked with no approved request this week`} />
                          )}
                          {ts.approvedOtHours > 0 && ts.overtimeHours > ts.approvedOtHours && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" title={`Overtime overrun - ${ts.approvedOtHours}h approved, ${ts.overtimeHours}h clocked this week`} />
                          )}
                          {ts.overtimeHours > (ts.paidOtHours ?? 0) && (
                            <span className="text-xs font-medium text-red-500" title="Overtime that was not approved for that day is recorded but not paid">· {(ts.overtimeHours - (ts.paidOtHours ?? 0)).toFixed(1)}h not paid</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-900 font-semibold">{ts.totalHours}h</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <Badge variant={statusVariant[ts.status]} dot size="xs">{ts.status}</Badge>
                        {ts.regularHours === 0 && (
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => openDetail(ts)}
                          className="p-1.5 pointer-coarse:p-2.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {ts.status === 'Draft' && (
                          <Button variant="primary" size="xs" icon={Send} onClick={() => handleSubmit(ts)}>Submit</Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-4 border-t border-gray-100">
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </div>
        )}
      </Card>

      {/* View Detail Modal — view only; employees can submit drafts */}
      <Modal isOpen={isDetailOpen} onClose={() => setIsDetailOpen(false)} title="Timesheet Details" size="lg">
        {selectedTimesheet && (
          <div className="space-y-6">
            {/* Employee Info */}
            <div className="flex items-center gap-4">
              <Avatar
                firstName={(selectedTimesheet.employeeName || '').split(' ')[0]}
                lastName={(selectedTimesheet.employeeName || '').split(' ').slice(1).join(' ')}
                size="xl"
              />
              <div>
                <h3 className="text-xl font-bold text-gray-900">{selectedTimesheet.employeeName}</h3>
                <p className="text-gray-500">{selectedTimesheet.employeeId}</p>
                <div className="flex gap-2 mt-2">
                  <Badge variant={statusVariant[selectedTimesheet.status]} dot>{selectedTimesheet.status}</Badge>
                </div>
              </div>
            </div>

            {/* Week Period */}
            <div className="flex items-center gap-2 px-4 py-3 bg-gray-50 rounded-xl">
              <Calendar className="w-4 h-4 text-gray-500" />
              <span className="text-sm font-medium text-gray-700">
                {formatDate(selectedTimesheet.weekStart)} &ndash; {formatDate(selectedTimesheet.weekEnd)}
              </span>
            </div>

            {/* Hours Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-xl p-4 text-center">
                <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Regular</p>
                <p className="text-2xl font-bold text-blue-700 mt-1">{selectedTimesheet.regularHours}h</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 text-center">
                <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Break</p>
                <p className="text-2xl font-bold text-amber-700 mt-1">{selectedTimesheet.breakHours}h</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-4 text-center">
                <p className="text-xs font-medium text-purple-600 uppercase tracking-wide">Overtime</p>
                <p className="text-2xl font-bold text-purple-700 mt-1">{selectedTimesheet.overtimeHours}h</p>
                {selectedTimesheet.overtimeHours > 0 && (
                  <>
                    <p className="text-[11px] text-purple-500 mt-1">
                      {selectedTimesheet.approvedOtHours > 0 ? `${selectedTimesheet.approvedOtHours}h approved` : 'No approval on file'}
                    </p>
                    {selectedTimesheet.approvedOtHours > 0 && selectedTimesheet.overtimeHours > selectedTimesheet.approvedOtHours && (
                      <p className="text-[11px] text-amber-600 font-medium flex items-center justify-center gap-1 mt-0.5">
                        <AlertTriangle className="w-3 h-3" /> Overrun by {(selectedTimesheet.overtimeHours - selectedTimesheet.approvedOtHours).toFixed(1)}h
                      </p>
                    )}
                    <p className="text-[11px] mt-0.5 font-medium text-purple-700">{Number(selectedTimesheet.paidOtHours ?? 0).toFixed(1)}h paid{selectedTimesheet.overtimeHours > (selectedTimesheet.paidOtHours ?? 0) ? <span className="text-red-500"> · {(selectedTimesheet.overtimeHours - (selectedTimesheet.paidOtHours ?? 0)).toFixed(1)}h not paid</span> : null}</p>
                  </>
                )}
              </div>
              <div className="bg-emerald-50 rounded-xl p-4 text-center">
                <p className="text-xs font-medium text-emerald-600 uppercase tracking-wide">Total</p>
                <p className="text-2xl font-bold text-emerald-700 mt-1">{selectedTimesheet.totalHours}h</p>
              </div>
            </div>

            {/* Meta Info */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <p className="text-sm"><span className="text-gray-500">Submitted:</span> <span className="font-medium text-gray-900">{selectedTimesheet.submittedDate ? formatDate(selectedTimesheet.submittedDate) : 'Not submitted'}</span></p>
                <p className="text-sm"><span className="text-gray-500">Approved By:</span> <span className="font-medium text-gray-900">{selectedTimesheet.approvedBy || 'N/A'}</span></p>
              </div>
              <div>
                {selectedTimesheet.notes && (
                  <div className="bg-gray-50 rounded-xl p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Notes</p>
                    <p className="text-sm text-gray-700">{selectedTimesheet.notes}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Actions — employees may only submit draft timesheets */}
            {selectedTimesheet.status === 'Draft' && (
              <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                <Button variant="primary" icon={Send} onClick={() => handleSubmit(selectedTimesheet)}>Submit Timesheet</Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function Timesheets() {
  const { isAdmin } = useAuth();
  return isAdmin ? <AdminTimesheetsView /> : <EmployeeTimesheetsView />;
}
