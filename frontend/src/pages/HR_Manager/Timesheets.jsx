import { useMemo, useState } from 'react';
import {
  ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertTriangle, Download,
  Eye, RotateCcw, History, ExternalLink, Users,
} from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Modal from '../../components/ui/Modal';
import SearchBar from '../../components/ui/SearchBar';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonPage } from '../../components/ui/LoadingSkeleton';
import TableShell from '../../components/ui/TableShell';
import { Pagination } from '../../components/ui/Table';
import { Textarea } from '../../components/ui/Input';
import { employeeService, timesheetService } from '../../services/api';
import { formatDate, formatTime } from '../../utils/helpers';
import { statusVariant, FLAG_INFO } from '../../utils/timesheetWorkflow';
import { downloadCSV } from '../../utils/export';
import { HistoryTimeline } from '../../components/timesheets/WorkflowParts';
import { periodByOffset, periodLabel } from '../../utils/payPeriod';
import { useToast } from '../../context/ToastContext';
import useApiData from '../../hooks/useApiData';
import {
  useTimesheets, useTimesheetsLoaded, refreshTimesheets,
  approveTimesheet, rejectTimesheet, reopenTimesheet, exportTimesheetsForPayroll,
} from '../../hooks/useTimesheets';

const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const ROWS_PER_PAGE = 10;

const payableHours = (t) => round1(
  Number(t.regularHours) + Number(t.regularHolidayHours) + Number(t.specialHolidayHours) + Number(t.paidOtHours)
);
function round1(n) { return Math.round(n * 100) / 100; }

export default function Timesheets() {
  const { toast } = useToast();
  const [offset, setOffset] = useState(0);
  const { start, end } = useMemo(() => periodByOffset(offset), [offset]);
  const startKey = toDateKey(start);

  const sheets = useTimesheets();
  const loaded = useTimesheetsLoaded();
  const { data: employees } = useApiData(() => employeeService.getAll(), []);

  const periodSheets = useMemo(
    () => (sheets || []).filter((t) => t.weekStart === startKey),
    [sheets, startKey]
  );
  const byEmployee = useMemo(() => {
    const map = {};
    periodSheets.forEach((t) => { map[t.employeeId] = t; });
    return map;
  }, [periodSheets]);

  const activeEmployees = useMemo(() => (employees || []).filter((e) => e.status === 'Active'), [employees]);

  const rows = useMemo(() => activeEmployees.map((e) => {
    const t = byEmployee[e.id];
    return {
      employee: e,
      sheet: t || null,
      status: t?.status || 'Not Submitted',
      exceptions: t?.flags?.length || 0,
    };
  }), [activeEmployees, byEmployee]);

  const tiles = useMemo(() => ({
    submitted: rows.filter((r) => r.status === 'Submitted').length,
    approved: rows.filter((r) => r.status === 'Approved').length,
    rejected: rows.filter((r) => r.status === 'Rejected').length,
    // Draft rows are never shown to admins (an employee's unfinished week is theirs alone until they
    // submit it - see TimesheetController::index()), so "not submitted" is a plain headcount, not a
    // peek at anyone's in-progress hours.
    notSubmitted: rows.filter((r) => r.status === 'Not Submitted').length,
  }), [rows]);

  const [search, setSearch] = useState('');
  const [exceptionsOnly, setExceptionsOnly] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      const name = `${r.employee.firstName} ${r.employee.lastName}`.toLowerCase();
      const matchSearch = !q || name.includes(q) || (r.employee.department || '').toLowerCase().includes(q);
      const matchException = !exceptionsOnly || r.exceptions > 0;
      return matchSearch && matchException;
    });
  }, [rows, search, exceptionsOnly]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const paginated = filtered.slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE);

  const approvedUnexported = periodSheets.filter((t) => t.status === 'Approved' && !t.exportedAt);
  const readiness = `${tiles.approved} approved · ${tiles.submitted + tiles.notSubmitted} pending · ${rows.filter((r) => r.exceptions > 0).length} exceptions`;

  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const exported = await exportTimesheetsForPayroll({ ids: approvedUnexported.map((t) => t.id) });
      downloadCSV(`payroll-${startKey}.csv`, exported.map((t) => ({
        employee: t.employeeName, department: t.department, period: `${t.weekStart} to ${t.weekEnd}`,
        regularHours: t.regularHours, holidayHours: round1(t.regularHolidayHours + t.specialHolidayHours),
        overtimeHours: t.paidOtHours, payableHours: payableHours(t), lateMinutes: t.lateMinutes, undertimeMinutes: t.undertimeMinutes,
      })));
      toast.success('Sent to Payroll', `${exported.length} timesheet(s) exported and locked.`);
      refreshTimesheets();
    } catch (e) {
      toast.error('Export failed', e?.response?.data?.message || 'Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const [detailEmployee, setDetailEmployee] = useState(null);

  if (!loaded) return <SkeletonPage />;

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timesheets</h1>
          <p className="text-[14px] text-gray-500 mt-1">Review and approve pay-period timesheets</p>
        </div>
      </div>

      {/* 1. Period selector + status tiles */}
      <Card>
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => setOffset((o) => o - 1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <p className="text-lg font-bold text-gray-900 min-w-[200px] text-center">{periodLabel(start, end)}</p>
          <button onClick={() => setOffset((o) => o + 1)} disabled={offset >= 0} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-30 disabled:hover:bg-transparent">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Not Submitted', value: tiles.notSubmitted, accent: 'text-gray-500 bg-gray-50' },
            { label: 'Submitted', value: tiles.submitted, accent: 'text-blue-600 bg-blue-50' },
            { label: 'Approved', value: tiles.approved, accent: 'text-emerald-600 bg-emerald-50' },
            { label: 'Rejected', value: tiles.rejected, accent: 'text-red-600 bg-red-50' },
          ].map((s) => (
            <div key={s.label} className={`rounded-xl p-3 ${s.accent}`}>
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{s.label}</p>
              <p className="text-2xl font-bold mt-0.5">{s.value}</p>
            </div>
          ))}
        </div>
      </Card>

      {/* 2 & 3. Employee list + exception queue filter */}
      <Card padding={false}>
        <div className="p-5 pb-4 flex items-center gap-3 flex-wrap">
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search employee or department..." className="flex-1 min-w-[220px]" />
          <button
            type="button"
            onClick={() => { setExceptionsOnly((v) => !v); setPage(1); }}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-lg border transition-colors ${
              exceptionsOnly ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <AlertTriangle className="w-3.5 h-3.5" /> Exceptions only
          </button>
        </div>
        {paginated.length === 0 ? (
          <EmptyState icon={Users} title="No employees match" description="Try a different search or clear the exceptions filter." />
        ) : (
          <>
            <TableShell minWidth="min-w-[760px]">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    {['Employee', 'Reported', 'Payable', 'Exceptions', 'Status', ''].map((h) => (
                      <th key={h} className="px-5 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {paginated.map((r) => (
                    <tr key={r.employee.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-sm font-medium text-gray-900">{r.employee.firstName} {r.employee.lastName}</p>
                        <p className="text-xs text-gray-400">{r.employee.department}</p>
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-700 tabular-nums">{r.sheet ? `${r.sheet.totalHours}h` : '—'}</td>
                      <td className="px-5 py-3 text-sm font-semibold text-gray-900 tabular-nums">{r.sheet ? `${payableHours(r.sheet)}h` : '—'}</td>
                      <td className="px-5 py-3">
                        {r.exceptions > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700">
                            <AlertTriangle className="w-3.5 h-3.5" /> {r.exceptions}
                          </span>
                        ) : <span className="text-xs text-gray-300">—</span>}
                      </td>
                      <td className="px-5 py-3">
                        <Badge variant={statusVariant[r.status] || 'default'} dot size="xs">{r.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Button size="xs" variant="secondary" icon={Eye} disabled={!r.sheet} onClick={() => setDetailEmployee(r.employee)}>View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableShell>
            {totalPages > 1 && (
              <div className="p-4"><Pagination currentPage={page} totalPages={totalPages} onPageChange={setPage} /></div>
            )}
          </>
        )}
      </Card>

      {/* 5. Export + Lock */}
      <Card>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <p className="text-xs text-gray-500">{readiness}</p>
          <Button
            icon={Download}
            loading={exporting}
            disabled={approvedUnexported.length === 0}
            onClick={handleExport}
            title={approvedUnexported.length === 0 ? 'Nothing approved and waiting yet' : 'Exporting also locks these timesheets - no further edits or reopening'}
          >
            Export to Payroll & Lock ({approvedUnexported.length})
          </Button>
        </div>
      </Card>

      {/* 4. Drill-down */}
      {detailEmployee && (
        <DetailModal
          employee={detailEmployee}
          sheet={byEmployee[detailEmployee.id]}
          start={startKey}
          onClose={() => setDetailEmployee(null)}
        />
      )}
    </div>
  );
}

function DetailModal({ employee, sheet, start, onClose }) {
  const { toast } = useToast();
  const [rejectReason, setRejectReason] = useState('');
  const [showReject, setShowReject] = useState(false);
  const [busy, setBusy] = useState(false);

  const end = useMemo(() => {
    const d = new Date(start);
    return toDateKey(d.getDate() === 1 ? new Date(d.getFullYear(), d.getMonth(), 15) : new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }, [start]);

  const { data: days, loading } = useApiData(
    () => timesheetService.getDays(employee.id, start, end),
    [employee.id, start, end]
  );

  const handleApprove = async () => {
    setBusy(true);
    try {
      await approveTimesheet(sheet.id, 'Workforce Admin');
      toast.success('Approved', `${employee.firstName}'s timesheet was approved.`);
      refreshTimesheets();
      onClose();
    } catch (e) {
      toast.error('Could not approve', e?.response?.data?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (rejectReason.trim().length < 5) {
      toast.error('Reason required', 'Tell the employee why, in at least a few words.');
      return;
    }
    setBusy(true);
    try {
      await rejectTimesheet(sheet.id, rejectReason.trim());
      toast.success('Rejected', 'Sent back to the employee for correction.');
      refreshTimesheets();
      onClose();
    } catch (e) {
      toast.error('Could not reject', e?.response?.data?.message || 'Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen onClose={onClose} title={`${employee.firstName} ${employee.lastName}`} size="xl">
      <div className="space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <p className="text-sm text-gray-500">{employee.department} · {periodLabel(new Date(start), new Date(end))}</p>
          </div>
          <Badge variant={statusVariant[sheet?.status] || 'default'} dot>{sheet?.status || 'Not Submitted'}</Badge>
        </div>

        {sheet?.flags?.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 space-y-1">
            <p className="text-xs font-semibold text-amber-800 uppercase tracking-wide">Check before approving</p>
            {sheet.flags.map((f) => (
              <p key={f} className="text-sm text-amber-800">• {FLAG_INFO[f]?.label || f}</p>
            ))}
          </div>
        )}

        <div className="rounded-xl border border-gray-200 overflow-hidden">
          <div className="grid grid-cols-4 bg-gray-50 px-4 py-2 text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
            <span>Date</span><span>Scheduled</span><span>Reported</span><span className="text-right">Payable</span>
          </div>
          <div className="divide-y divide-gray-50 max-h-[320px] overflow-y-auto">
            {loading ? (
              <div className="p-6 text-center text-sm text-gray-400">Loading…</div>
            ) : (days || []).map((d) => {
              const a = d.attendance;
              const payable = a ? round1(Number(a.regularHours) + Number(a.regularHolidayHours) + Number(a.specialHolidayHours)) : 0;
              return (
                <div key={d.date} className="grid grid-cols-4 px-4 py-2 text-sm items-center">
                  <span className="text-gray-700">{formatDate(d.date)}</span>
                  <span className="text-gray-500 text-xs">{d.scheduledStart ? `${formatTime(d.scheduledStart)}–${formatTime(d.scheduledEnd)}` : '—'}</span>
                  <span className="text-gray-700 text-xs">{a ? `${a.clockIn ? formatTime(a.clockIn) : '—'}–${a.clockOut ? formatTime(a.clockOut) : '—'}` : (d.leaveType ? `${d.leaveType} leave` : '—')}</span>
                  <span className="text-right font-semibold text-gray-900">{payable ? `${payable}h` : '—'}</span>
                </div>
              );
            })}
          </div>
        </div>

        {sheet && (sheet.history || []).length > 0 && (
          <details>
            <summary className="flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer select-none">
              <History className="w-3.5 h-3.5" /> History
            </summary>
            <div className="mt-2"><HistoryTimeline history={sheet.history} /></div>
          </details>
        )}

        {sheet?.status === 'Submitted' && (
          <div className="pt-3 border-t border-gray-100">
            {showReject ? (
              <div className="space-y-2">
                <Textarea label="Reason for rejection" required rows={2} value={rejectReason} onChange={(e) => setRejectReason(e.target.value)} placeholder="What needs to be fixed..." />
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" size="sm" onClick={() => setShowReject(false)}>Cancel</Button>
                  <Button variant="danger" size="sm" loading={busy} onClick={handleReject}>Confirm Reject</Button>
                </div>
              </div>
            ) : (
              <div className="flex justify-end gap-3">
                <Button variant="dangerOutline" icon={XCircle} onClick={() => setShowReject(true)}>Reject</Button>
                <Button icon={CheckCircle} loading={busy} onClick={handleApprove}>Approve</Button>
              </div>
            )}
          </div>
        )}
        {sheet?.status === 'Approved' && !sheet.exportedAt && (
          <div className="pt-3 border-t border-gray-100 flex justify-end">
            <Button variant="secondary" icon={RotateCcw} loading={busy} onClick={async () => {
              setBusy(true);
              try {
                await reopenTimesheet(sheet.id, 'Reopened for correction by admin.');
                toast.success('Reopened', 'Sent back to the employee.');
                refreshTimesheets();
                onClose();
              } catch (e) {
                toast.error('Could not reopen', e?.response?.data?.message || 'Please try again.');
              } finally { setBusy(false); }
            }}>
              Reopen for Correction
            </Button>
          </div>
        )}
        {!sheet && (
          <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2 text-sm text-gray-400">
            <ExternalLink className="w-3.5 h-3.5" /> Nothing submitted for this period yet.
          </div>
        )}
      </div>
    </Modal>
  );
}
