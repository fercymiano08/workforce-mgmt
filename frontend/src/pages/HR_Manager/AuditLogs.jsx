import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import {
  ShieldCheck, Search, RefreshCw, Download, ChevronLeft, ChevronRight, ScrollText, X,
  Plus, Pencil, Trash2, CheckCircle2, XCircle, ScanFace, Activity, CalendarDays, Users, ListChecks, Lock,
} from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import KpiCard from '../../components/dashboard/KpiCard';
import { SkeletonTable } from '../../components/ui/LoadingSkeleton';
import useApiData from '../../hooks/useApiData';
import { auditService } from '../../services/api';
import { useConfirmPassword } from '../../hooks/useConfirmPassword';
import { downloadCsv } from '../../utils/export';
import { formatDate, formatTime } from '../../utils/helpers';
import { toDateKey } from '../../services/attendanceService';

const SERVICE_COLORS = {
  attendance: 'blue',
  timeoff: 'emerald',
  payroll: 'purple',
  core: 'amber',
  configuration: 'cyan',
  scheduling: 'indigo',
};

// Plain-language names, so nobody has to know what a "service" or an event code is.
const AREA_NAMES = {
  core: 'Employees & Accounts',
  attendance: 'Attendance',
  timeoff: 'Leave & Overtime',
  payroll: 'Timesheets',
  scheduling: 'Shifts',
  configuration: 'Settings',
  communications: 'Notifications',
  intelligence: 'Analytics',
};

const EVENT_NAMES = {
  'employee.created': 'Employee added',
  'employee.updated': 'Employee details changed',
  'employee.deleted': 'Employee removed',
  'employee.face_registered': 'Face registered for kiosk',
  'leave.created': 'Leave request submitted',
  'leave.updated': 'Leave request edited',
  'leave.status_changed': 'Leave request decision',
  'leave.deleted': 'Leave request deleted',
  'timesheet.created': 'Timesheet created',
  'timesheet.updated': 'Timesheet edited',
  'timesheet.status_changed': 'Timesheet status changed',
  'timesheet.deleted': 'Timesheet deleted',
  'attendance.punch_corrected': 'Attendance record corrected',
  'attendance.deleted': 'Attendance record deleted',
  'overtime.requested': 'Overtime requested',
  'overtime.status_changed': 'Overtime decision',
  'overtime.withdrawn': 'Overtime request withdrawn',
  'overtime.deleted': 'Overtime request deleted',
  'settings.updated': 'System settings changed',
  'auth.login': 'Signed in',
  'auth.login_failed': 'Failed sign-in',
  'auth.login_locked': 'Sign-in locked (too many attempts)',
  'auth.logout': 'Signed out',
  'auth.password_changed': 'Password changed',
  'auth.password_reset_requested': 'Password reset code requested',
  'auth.password_reset': 'Password reset',
  'auth.export_confirmed': 'Password confirmed for an export',
  'auth.confirm_failed': 'Wrong password when confirming an export',
};

const RANGES = [
  { id: 'all', label: 'All time' },
  { id: 'today', label: 'Today' },
  { id: '7', label: 'Last 7 days' },
  { id: '30', label: 'Last 30 days' },
];

const capitalize = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);
const words = (key) => capitalize(String(key).replace(/([A-Z])/g, ' $1').replace(/_/g, ' ').trim().toLowerCase());
const areaName = (service) => AREA_NAMES[service] || capitalize(service);
// "leave.status_changed" -> "Leave status changed" when there is no hand-written name
const eventName = (event) => EVENT_NAMES[event] || capitalize(String(event || '').replace(/[._]/g, ' '));

// Fields that are big, private or meaningless to read as text.
const HIDDEN_FIELDS = new Set(['id', 'avatar', 'faceImage', 'faceDescriptor', 'faceRegisteredAt', 'documents', 'leaveBalances', 'skills', 'education', 'createdAt', 'updatedAt']);
const isSimple = (v) => v === null || ['string', 'number', 'boolean'].includes(typeof v);
const showValue = (v) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return formatDate(v);
  return String(v);
};

// [{ field, before, after }] for the simple fields that really changed
const changesOf = (before, after) => {
  const b = before || {};
  const a = after || {};
  return [...new Set([...Object.keys(b), ...Object.keys(a)])]
    .filter((k) => !HIDDEN_FIELDS.has(k) && isSimple(b[k] ?? null) && isSimple(a[k] ?? null))
    .filter((k) => JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null))
    .map((k) => ({ field: words(k), before: showValue(b[k]), after: showValue(a[k]) }));
};

const detailsOf = (e) => e.after || e.before || {};
const personOf = (e) => {
  const d = detailsOf(e);
  return d.employeeName || [d.firstName, d.lastName].filter(Boolean).join(' ') || '';
};

// Which person / record this is about, in words
const subjectOf = (e) => {
  const d = detailsOf(e);
  const name = personOf(e);
  const kind = d.leaveType ? `${d.leaveType} leave` : capitalize(String(e.entityType || 'record').toLowerCase());
  return name ? `${name} · ${kind}` : kind;
};

// What kind of action this was, for the icon and colour
const kindOf = (e) => {
  const ev = e.event || '';
  if (ev.endsWith('.created')) return 'created';
  if (ev.endsWith('.deleted')) return 'deleted';
  if (ev.includes('face')) return 'face';
  if (e.meta?.status === 'Approved') return 'approved';
  if (e.meta?.status === 'Rejected' || e.meta?.status === 'Cancelled') return 'rejected';
  return 'updated';
};

const KIND_STYLE = {
  created: { icon: Plus, box: 'bg-emerald-50 text-emerald-600' },
  updated: { icon: Pencil, box: 'bg-blue-50 text-blue-600' },
  deleted: { icon: Trash2, box: 'bg-red-50 text-red-600' },
  approved: { icon: CheckCircle2, box: 'bg-emerald-50 text-emerald-600' },
  rejected: { icon: XCircle, box: 'bg-rose-50 text-rose-600' },
  face: { icon: ScanFace, box: 'bg-purple-50 text-purple-600' },
};

// The whole event as one sentence: "Fercy Miano submitted a Special leave request"
const sentenceOf = (e) => {
  const d = detailsOf(e);
  const person = personOf(e);
  const leave = d.leaveType ? `${d.leaveType} leave request` : 'leave request';
  const decision = { Approved: 'approved', Rejected: 'rejected', Cancelled: 'cancelled', Pending: 'reopened' }[e.meta?.status] || 'reviewed';
  switch (e.event) {
    case 'employee.created': return `added employee ${person || e.entityId}`;
    case 'employee.updated': return `changed the details of ${person || e.entityId}`;
    case 'employee.deleted': return `removed employee ${person || e.entityId}`;
    case 'employee.face_registered': return `registered ${person || 'an employee'}'s face for the kiosk`;
    case 'leave.created': return `submitted a ${leave}`;
    case 'leave.updated': return `edited ${person ? `${person}'s` : 'a'} ${leave}`;
    case 'leave.status_changed': return `${decision} ${person ? `${person}'s` : 'a'} ${leave}`;
    case 'leave.deleted': return `deleted ${person ? `${person}'s` : 'a'} ${leave}`;
    case 'timesheet.created': return `created a timesheet${person ? ` for ${person}` : ''}`;
    case 'timesheet.updated': return `edited ${person ? `${person}'s` : 'a'} timesheet`;
    case 'timesheet.status_changed': return `${e.meta?.status ? e.meta.status.toLowerCase() : 'changed'} ${person ? `${person}'s` : 'a'} timesheet`;
    case 'timesheet.deleted': return `deleted ${person ? `${person}'s` : 'a'} timesheet`;
    case 'attendance.punch_corrected': return `corrected ${person ? `${person}'s` : 'an'} attendance record`;
    case 'attendance.deleted': return `deleted ${person ? `${person}'s` : 'an'} attendance record`;
    case 'overtime.requested': return `requested overtime${person ? ` (${person})` : ''}`;
    case 'overtime.status_changed': return `${decision} ${person ? `${person}'s` : 'an'} overtime request`;
    case 'overtime.withdrawn': return `withdrew ${person ? `${person}'s` : 'an'} overtime request`;
    case 'overtime.deleted': return `deleted ${person ? `${person}'s` : 'an'} overtime request`;
    case 'settings.updated': return `changed the ${(e.meta?.sections || []).join(' and ') || 'system'} settings`;
    case 'auth.login': return 'signed in';
    case 'auth.login_failed': return `failed to sign in as ${e.meta?.email || 'an unknown account'}`;
    case 'auth.login_locked': return `was locked out after too many sign-in attempts (${e.meta?.email || 'unknown account'})`;
    case 'auth.logout': return 'signed out';
    case 'auth.password_changed': return 'changed their password';
    case 'auth.password_reset_requested': return 'asked for a password reset code';
    case 'auth.password_reset': return 'reset their password with an emailed code';
    case 'auth.export_confirmed': return `confirmed their password to: ${e.meta?.purpose || 'export data'}`;
    case 'auth.confirm_failed': return `typed a wrong password when trying to: ${e.meta?.purpose || 'export data'}`;
    default: return `${eventName(e.event).toLowerCase()}${person ? ` (${person})` : ''}`;
  }
};

// One short line under the sentence
const summaryOf = (e) => {
  if (e.event?.endsWith('.created')) return 'New record';
  if (e.event?.endsWith('.deleted')) return 'Record removed';
  if (e.meta?.status) return `Decision: ${e.meta.status}`;
  const list = changesOf(e.before, e.after);
  if (!list.length) return '';
  const shown = list.slice(0, 2).map((c) => `${c.field}: ${c.before} → ${c.after}`).join('  ·  ');
  return list.length > 2 ? `${shown}  ·  +${list.length - 2} more` : shown;
};

const initialsOf = (name) => (name || 'System').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase();

const dayLabel = (d) => {
  const key = toDateKey(d);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (key === toDateKey(today)) return 'Today';
  if (key === toDateKey(yesterday)) return 'Yesterday';
  return formatDate(key);
};

const timeOf = (d) => formatTime(d.toTimeString().slice(0, 8));

export default function AuditLogs() {
  const { toast } = useToast();

  const [filters, setFilters] = useState({
    search: '',
    service: '',
    from: '',
    to: '',
    perPage: 25,
    page: 1,
  });
  const [range, setRange] = useState('all');
  const [showDetail, setShowDetail] = useState(null);

  const params = useMemo(() => {
    const p = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) p[k] = v;
    });
    return p;
  }, [filters]);

  // useApiData returns { data, loading, error, refresh }; `data` here is the server reply { data: [...events], meta }
  const { data: res, error, refresh } = useApiData(() => auditService.getLogs(params), [params]);
  const logs = useMemo(() => res?.data || [], [res]);
  const meta = useMemo(() => res?.meta || {}, [res]);
  const stats = meta.stats || {};

  const setField = (key, value) => setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  const jumpTo = (page) => setFilters((f) => ({ ...f, page }));

  const pickRange = (id) => {
    setRange(id);
    const to = toDateKey(new Date());
    let from = '';
    if (id === 'today') from = to;
    if (id === '7' || id === '30') {
      const d = new Date();
      d.setDate(d.getDate() - (Number(id) - 1));
      from = toDateKey(d);
    }
    setFilters((f) => ({ ...f, from, to: id === 'all' ? '' : to, page: 1 }));
  };

  const setCustomDate = (key, value) => {
    setRange('custom');
    setField(key, value);
  };

  const hasFilters = filters.search || filters.service || filters.from || filters.to;
  const clearFilters = () => {
    setRange('all');
    setFilters((f) => ({ ...f, search: '', service: '', from: '', to: '', page: 1 }));
  };

  // The server sends an exact moment (UTC); show it in the viewer's own time zone.
  const formatWhen = (iso) => {
    const d = iso ? new Date(iso) : null;
    if (!d || Number.isNaN(d.getTime())) return '—';
    return `${formatDate(toDateKey(d))} ${timeOf(d)}`;
  };

  const { askPassword, passwordModal } = useConfirmPassword();
  const requestExport = () => {
    if (!logs.length) {
      toast.error('Nothing to export', 'No matching audit events.');
      return;
    }
    askPassword('Export audit log', handleExport);
  };

  const handleExport = () => {
    if (!logs.length) {
      toast.error('Nothing to export', 'No matching audit events.');
      return;
    }
    const rows = logs.map((e) => ({
      When: formatWhen(e.createdAt),
      'Done by': e.actor || 'System',
      Area: areaName(e.service),
      'What happened': eventName(e.event),
      About: subjectOf(e),
      'Record ID': e.entityId,
      Changes: summaryOf(e),
    }));
    downloadCsv(`audit-log-export-${toDateKey(new Date())}.csv`, rows);
    toast.success('Export ready', `Exported ${rows.length} audit events as CSV.`);
  };

  // Group the page's events by day, newest first (the server already sorts them)
  const groups = useMemo(() => {
    const out = [];
    logs.forEach((e) => {
      const d = e.createdAt ? new Date(e.createdAt) : null;
      const valid = d && !Number.isNaN(d.getTime());
      const label = valid ? dayLabel(d) : 'Unknown date';
      let g = out[out.length - 1];
      if (!g || g.label !== label) {
        g = { label, items: [] };
        out.push(g);
      }
      g.items.push({ e, d: valid ? d : null });
    });
    return out;
  }, [logs]);

  const pill = (active) => clsx(
    'px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors whitespace-nowrap',
    active ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-200 hover:border-blue-300 hover:text-blue-700',
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
            <ShieldCheck className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
            <p className="text-[14px] text-gray-500 mt-0.5">A permanent record of who did what, and when.</p>
          </div>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" size="md" icon={RefreshCw} onClick={refresh}>Refresh</Button>
          <Button variant="outline" size="md" icon={Download} onClick={requestExport}>Export CSV</Button>
        </div>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total events" value={meta.total ?? '—'} icon={ListChecks} accent="blue" noBar subtext="With the filters below" />
        <KpiCard label="Today" value={stats.today ?? '—'} icon={Activity} accent="emerald" noBar subtext="Recorded today" />
        <KpiCard label="Last 7 days" value={stats.week ?? '—'} icon={CalendarDays} accent="purple" noBar subtext="Including today" />
        <KpiCard label="People involved" value={stats.people ?? '—'} icon={Users} accent="amber" noBar subtext="Who have taken recorded actions" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={filters.search}
              onChange={(e) => setField('search', e.target.value)}
              placeholder="Search by person, action or record number..."
              className="w-full pl-10 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={filters.from}
              onChange={(e) => setCustomDate('from', e.target.value)}
              title="From date"
              className="px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
            <span className="text-gray-400 text-sm">to</span>
            <input
              type="date"
              value={filters.to}
              onChange={(e) => setCustomDate('to', e.target.value)}
              title="To date"
              className="px-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mr-1">Area</span>
            <button type="button" className={pill(!filters.service)} onClick={() => setField('service', '')}>All</button>
            {(meta.services || []).map((s) => (
              <button key={s} type="button" className={pill(filters.service === s)} onClick={() => setField('service', s)}>
                {areaName(s)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400 mr-1">Period</span>
            {RANGES.map((r) => (
              <button key={r.id} type="button" className={pill(range === r.id)} onClick={() => pickRange(r.id)}>{r.label}</button>
            ))}
          </div>
          {hasFilters && (
            <button type="button" onClick={clearFilters} className="ml-auto text-xs font-semibold text-blue-600 hover:text-blue-700">
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Timeline */}
      {error ? (
        <EmptyState icon={ScrollText} title="Could not load the audit log" description={error} />
      ) : !res ? (
        <SkeletonTable rows={8} cols={6} />
      ) : logs.length ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          {groups.map((g) => (
            <section key={g.label}>
              <div className="px-5 py-2 bg-gray-50 border-y border-gray-100 first:border-t-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                {g.label} <span className="text-gray-400 font-medium normal-case tracking-normal">· {g.items.length} {g.items.length === 1 ? 'event' : 'events'}</span>
              </div>
              <ul className="divide-y divide-gray-50">
                {g.items.map(({ e, d }) => {
                  const style = KIND_STYLE[kindOf(e)] || KIND_STYLE.updated;
                  const Icon = style.icon;
                  const summary = summaryOf(e);
                  return (
                    <li key={e.id}>
                      <button
                        type="button"
                        onClick={() => setShowDetail(e)}
                        className="w-full flex items-center gap-4 px-5 py-3.5 text-left hover:bg-blue-50/40 transition-colors"
                      >
                        <span className={clsx('w-10 h-10 rounded-xl flex items-center justify-center shrink-0', style.box)}>
                          <Icon className="w-[18px] h-[18px]" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm text-gray-800">
                            <span className="font-semibold text-gray-900">{e.actor || 'System'}</span> {sentenceOf(e)}
                          </span>
                          <span className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge variant={SERVICE_COLORS[e.service] || 'default'} size="xs">{areaName(e.service)}</Badge>
                            {summary && <span className="text-xs text-gray-500 truncate max-w-full">{summary}</span>}
                          </span>
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap shrink-0">{d ? timeOf(d) : '—'}</span>
                        <ChevronRight className="w-4 h-4 text-gray-300 shrink-0" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}

          <div className="flex items-center justify-between gap-3 flex-wrap px-5 py-3 border-t border-gray-100 bg-gray-50/60">
            <div className="flex items-center gap-3">
              <p className="text-xs text-gray-500">Page {meta.page || 1} of {meta.lastPage || 1} · {meta.total || 0} events</p>
              <select
                value={filters.perPage}
                onChange={(e) => setField('perPage', Number(e.target.value))}
                className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none"
              >
                <option value={25}>25 / page</option>
                <option value={50}>50 / page</option>
                <option value={100}>100 / page</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" icon={ChevronLeft} disabled={!meta.page || meta.page <= 1} onClick={() => jumpTo(meta.page - 1)}>Prev</Button>
              <Button variant="outline" size="sm" disabled={!meta.lastPage || meta.page >= meta.lastPage} onClick={() => jumpTo(meta.page + 1)}>
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={ScrollText}
          title={hasFilters ? 'No events match these filters' : 'Nothing recorded yet'}
          description={hasFilters ? 'Try a wider period or clear the filters.' : 'Actions like adding an employee or deciding a leave request will appear here.'}
        />
      )}

      <p className="flex items-center justify-center gap-1.5 text-xs text-gray-400">
        <Lock className="w-3.5 h-3.5" /> Entries are written by the system, and can't be edited or deleted by anyone, including administrators.
      </p>

      {/* Detail panel */}
      {showDetail && createPortal(
        <div className="fixed inset-0 z-50 flex justify-end bg-black/40" onClick={() => setShowDetail(null)}>
          <aside className="w-full max-w-md h-full overflow-y-auto bg-white shadow-2xl" onClick={(ev) => ev.stopPropagation()}>
            {(() => {
              const e = showDetail;
              const style = KIND_STYLE[kindOf(e)] || KIND_STYLE.updated;
              const Icon = style.icon;
              const list = changesOf(e.before, e.after);
              const created = e.event?.endsWith('.created');
              const recorded = Object.entries(e.after || {}).filter(([k, v]) => !HIDDEN_FIELDS.has(k) && isSimple(v) && v !== null && v !== '');
              return (
                <div className="p-6 space-y-5">
                  <div className="flex items-start justify-between gap-3">
                    <span className={clsx('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', style.box)}>
                      <Icon className="w-5 h-5" />
                    </span>
                    <button type="button" onClick={() => setShowDetail(null)} aria-label="Close" className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{eventName(e.event)}</h3>
                    <p className="text-sm text-gray-600 mt-1">
                      <span className="font-semibold text-gray-900">{e.actor || 'System'}</span> {sentenceOf(e)}.
                    </p>
                  </div>

                  <dl className="rounded-xl border border-gray-100 divide-y divide-gray-50 text-sm">
                    <div className="flex items-center justify-between gap-4 px-4 py-2.5"><dt className="text-gray-500">When</dt><dd className="font-medium text-gray-800 text-right">{formatWhen(e.createdAt)}</dd></div>
                    <div className="flex items-center justify-between gap-4 px-4 py-2.5">
                      <dt className="text-gray-500">Done by</dt>
                      <dd className="flex items-center gap-2 font-medium text-gray-800">
                        <span className="w-6 h-6 rounded-full bg-blue-500 text-white text-[10px] flex items-center justify-center">{initialsOf(e.actor)}</span>
                        {e.actor || 'System'}
                      </dd>
                    </div>
                    <div className="flex items-center justify-between gap-4 px-4 py-2.5"><dt className="text-gray-500">Area</dt><dd><Badge variant={SERVICE_COLORS[e.service] || 'default'} size="sm">{areaName(e.service)}</Badge></dd></div>
                    <div className="flex items-center justify-between gap-4 px-4 py-2.5"><dt className="text-gray-500">About</dt><dd className="font-medium text-gray-800 text-right">{subjectOf(e)}</dd></div>
                    {e.entityId && <div className="flex items-center justify-between gap-4 px-4 py-2.5"><dt className="text-gray-500">Record number</dt><dd className="font-medium text-gray-800">{e.entityId}</dd></div>}
                    {e.meta?.status && <div className="flex items-center justify-between gap-4 px-4 py-2.5"><dt className="text-gray-500">Decision</dt><dd className="font-semibold text-gray-900">{e.meta.status}</dd></div>}
                  </dl>

                  {created ? (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Details recorded</p>
                      <dl className="rounded-xl border border-gray-100 divide-y divide-gray-50 text-sm">
                        {recorded.map(([k, v]) => (
                          <div key={k} className="flex justify-between gap-4 px-4 py-2">
                            <dt className="text-gray-500">{words(k)}</dt>
                            <dd className="font-medium text-gray-800 text-right break-words">{showValue(v)}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  ) : list.length ? (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">What changed</p>
                      <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 text-sm">
                        {list.map((c) => (
                          <div key={c.field} className="px-4 py-2.5">
                            <p className="text-gray-500 text-xs mb-1">{c.field}</p>
                            <p className="flex items-center gap-2 flex-wrap">
                              <span className="px-2 py-0.5 rounded-md bg-red-50 text-red-700 line-through decoration-red-300">{c.before}</span>
                              <ChevronRight className="w-3.5 h-3.5 text-gray-300" />
                              <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium">{c.after}</span>
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-500">No individual field changes were recorded for this action.</p>
                  )}

                  <details>
                    <summary className="cursor-pointer text-xs font-medium text-gray-400 hover:text-gray-600">Technical details (for IT)</summary>
                    <pre className="mt-2 bg-gray-50 border border-gray-100 rounded-lg p-3 text-[11px] text-gray-600 overflow-x-auto whitespace-pre-wrap max-h-64 overflow-y-auto">
                      {JSON.stringify({ event: e.event, service: e.service, entityType: e.entityType, meta: e.meta, before: e.before, after: e.after }, null, 2)}
                    </pre>
                  </details>
                </div>
              );
            })()}
          </aside>
        </div>,
        document.body,
      )}
      {passwordModal}
    </div>
  );
}
