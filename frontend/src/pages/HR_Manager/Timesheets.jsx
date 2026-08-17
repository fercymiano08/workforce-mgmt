import { useState, useMemo } from 'react';
import { FileText, Clock, AlertTriangle, CheckCircle, Download, Calendar, TrendingUp, Timer, Eye, Send, Info } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import SearchBar from '../../components/ui/SearchBar';
import { Select } from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import { Pagination } from '../../components/ui/Table';
import { useTimesheets, approveTimesheet, rejectTimesheet, submitTimesheet, refreshTimesheets } from '../../hooks/useTimesheets';
import { formatDate } from '../../utils/helpers';
import { downloadCSV } from '../../utils/export';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';

const statusVariant = {
  Draft: 'default',
  Submitted: 'info',
  Approved: 'success',
  Rejected: 'danger',
};

// ---------------------------------------------------------------------------
// HR Administrator view — full timesheet management (all employees).
// Approve / reject / modify / export functions are exclusive to HR admins.
// ---------------------------------------------------------------------------
function AdminTimesheetsView() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [deptFilter, setDeptFilter] = useState('All');
  const [viewMode, setViewMode] = useState('Weekly');
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedTimesheet, setSelectedTimesheet] = useState(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [confirmReject, setConfirmReject] = useState(false);

  const data = useTimesheets();

  const departments = useMemo(() => ['All', ...new Set(data.map(t => t.department))], [data]);
  const statuses = ['All', 'Draft', 'Submitted', 'Approved', 'Rejected'];
  const viewModes = ['Daily', 'Weekly', 'Monthly'];

  const stats = useMemo(() => ({
    total: data.length,
    approved: data.filter(t => t.status === 'Approved').length,
    pending: data.filter(t => t.status === 'Submitted').length,
    totalHours: data.reduce((sum, t) => sum + t.regularHours, 0),
  }), [data]);

  const filtered = useMemo(() => {
    return data.filter(t => {
      const matchSearch = !search || t.employeeName.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || t.status === statusFilter;
      const matchDept = deptFilter === 'All' || t.department === deptFilter;
      return matchSearch && matchStatus && matchDept;
    });
  }, [search, statusFilter, deptFilter, data]);

  const weekLimit = { Daily: 1, Weekly: 2, Monthly: 12 }[viewMode] ?? 12;

  const viewFiltered = useMemo(() => {
    const sorted = [...filtered].sort((a, b) => (b.weekStart || '').localeCompare(a.weekStart || ''));
    const latest = sorted[0]?.weekStart;
    if (!latest) return [];
    const cutoff = new Date(`${latest}T00:00:00`);
    cutoff.setDate(cutoff.getDate() - (weekLimit - 1) * 7);
    const cutoffKey = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    return sorted.filter(t => (t.weekStart || '') >= cutoffKey);
  }, [filtered, weekLimit]);

  const periodLabel = { Daily: 'Current week', Weekly: 'Current & previous week', Monthly: 'Last 12 weeks' }[viewMode];

  const totalPages = Math.ceil(viewFiltered.length / 10);
  const paginated = viewFiltered.slice((currentPage - 1) * 10, currentPage * 10);

  const openDetail = (ts) => { setSelectedTimesheet(ts); setConfirmReject(false); setIsDetailOpen(true); };

  const closeDetail = () => { setConfirmReject(false); setIsDetailOpen(false); };

  const handleExport = () => {
    const rows = viewFiltered.map(t => ({
      Employee: t.employeeName,
      'Employee ID': t.employeeId,
      Department: t.department,
      Period: `${formatDate(t.weekStart)} - ${formatDate(t.weekEnd)}`,
      'Regular Hours': t.regularHours,
      'Overtime Hours': t.overtimeHours,
      'Total Hours': t.totalHours,
      Status: t.status,
      'Approved By': t.approvedBy || '',
    }));
    downloadCSV('timesheets.csv', rows);
    toast.success('Export Complete', `Exported ${rows.length} timesheet${rows.length === 1 ? '' : 's'} to CSV.`);
  };

  const handleApprove = async (ts) => {
    try {
      await approveTimesheet(ts.id, user ? `${user.firstName} ${user.lastName}` : 'HR Admin');
      await refreshTimesheets();
      toast.success('Timesheet Approved', `${ts.employeeName}'s timesheet was approved.`);
      closeDetail();
    } catch {
      toast.error('Error', 'Failed to approve timesheet.');
    }
  };

  const handleReject = async (ts) => {
    try {
      await rejectTimesheet(ts.id);
      await refreshTimesheets();
      toast.success('Timesheet Rejected', `${ts.employeeName}'s timesheet was rejected.`);
      closeDetail();
    } catch {
      toast.error('Error', 'Failed to reject timesheet.');
    }
  };

  const statCards = [
    { label: 'Total Timesheets', value: stats.total, icon: FileText, color: 'blue' },
    { label: 'Approved', value: stats.approved, icon: CheckCircle, color: 'emerald' },
    { label: 'Pending Review', value: stats.pending, icon: Clock, color: 'amber' },
    { label: 'Total Regular Hours', value: stats.totalHours.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 }), icon: Timer, color: 'purple' },
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

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Timesheet Management</h1>
          <p className="text-[14px] text-gray-500 mt-1">Track and manage employee timesheets</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" icon={Download} size="md" onClick={handleExport}>Export</Button>
        </div>
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

      {/* Filters */}
      <Card padding={false}>
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center gap-3 flex-wrap">
            <SearchBar
              value={search}
              onChange={(v) => { setSearch(v); setCurrentPage(1); }}
              placeholder="Search by employee name..."
              className="flex-1 min-w-[240px]"
            />
            <Select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
              containerClass="w-40"
            >
              {statuses.map(s => (
                <option key={s} value={s}>{s === 'All' ? 'All Statuses' : s}</option>
              ))}
            </Select>
            <Select
              value={deptFilter}
              onChange={(e) => { setDeptFilter(e.target.value); setCurrentPage(1); }}
              containerClass="w-44"
            >
              {departments.map(d => (
                <option key={d} value={d}>{d === 'All' ? 'All Departments' : d}</option>
              ))}
            </Select>
            <div className="flex border border-gray-200 rounded-xl overflow-hidden">
              {viewModes.map(mode => (
                <button
                  key={mode}
                  onClick={() => { setViewMode(mode); setCurrentPage(1); }}
                  className={`px-3 py-2 pointer-coarse:py-2.5 text-xs font-medium transition-colors ${
                    viewMode === mode ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'
                  }`}
                >
                  {mode}
                </button>
              ))}
            </div>
            <span className="text-xs text-gray-400">{periodLabel}</span>
          </div>
        </div>

        {/* Missing Attendance Warning */}
        {data.some(t => t.regularHours === 0) && (
          <div className="mx-4 mt-4 flex items-center gap-2 px-4 py-3 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <p className="text-sm text-amber-700">
              Some timesheets have zero regular hours logged. Please review the affected entries.
            </p>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Employee', 'Department', 'Period', 'Regular Hours', 'Overtime', 'Total Hours', 'Status', 'Approved By', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {paginated.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-sm text-gray-400">
                    No timesheets found matching your filters.
                  </td>
                </tr>
              ) : (
                paginated.map(ts => (
                  <tr key={ts.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar firstName={(ts.employeeName || '').split(' ')[0]} lastName={(ts.employeeName || '').split(' ').slice(1).join(' ')} size="sm" />
                        <div>
                          <p className="font-medium text-sm text-gray-900">{ts.employeeName}</p>
                          <p className="text-xs text-gray-500">{ts.employeeId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{ts.department}</td>
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
                    <td className="px-4 py-3.5 text-sm text-gray-700">
                      {ts.approvedBy || <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <button
                        onClick={() => openDetail(ts)}
                        className="p-1.5 pointer-coarse:p-2.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
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

      {/* View Detail Modal */}
      <Modal isOpen={isDetailOpen} onClose={closeDetail} title="Timesheet Details" size="lg">
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
                  <Badge variant="primary">{selectedTimesheet.department}</Badge>
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

            {/* Actions — HR Admins may only approve or reject submitted timesheets */}
            {selectedTimesheet.status === 'Submitted' && (
              <div className="pt-4 border-t border-gray-100">
                {confirmReject ? (
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                      <p className="text-sm text-gray-700">Reject this timesheet? This cannot be undone.</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Button variant="outline" size="sm" onClick={() => setConfirmReject(false)}>Cancel</Button>
                      <Button variant="danger" size="sm" icon={AlertTriangle} onClick={() => handleReject(selectedTimesheet)}>Yes, Reject</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-end gap-3">
                    <Button variant="danger" icon={AlertTriangle} onClick={() => setConfirmReject(true)}>Reject</Button>
                    <Button variant="success" icon={CheckCircle} onClick={() => handleApprove(selectedTimesheet)}>Approve</Button>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </Modal>
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
