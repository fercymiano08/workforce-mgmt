import { useState, useMemo, useEffect } from 'react';
import { CheckCircle, AlertTriangle, Timer, Download, Coffee, MapPin, Clock, X, Check, CheckCheck, ChevronDown, ChevronRight } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import SearchBar from '../../components/ui/SearchBar';
import Modal from '../../components/ui/Modal';
import Input, { Select, Textarea } from '../../components/ui/Input';
import { Pagination } from '../../components/ui/Table';
import { SkeletonTable } from '../../components/ui/LoadingSkeleton';
import { attendanceService, employeeService, overtimeService } from '../../services/api';
import { formatHours, toDateKey } from '../../services/attendanceService';
import { formatDate, formatTime } from '../../utils/helpers';
import { downloadCSV } from '../../utils/export';
import useApiData from '../../hooks/useApiData';
import { useToast } from '../../context/ToastContext';
import { useAuth } from '../../context/AuthContext';

const statusVariant = { Present: 'success', Late: 'warning', Absent: 'danger', 'Half Day': 'info', 'On Leave': 'default' };
const overtimeStatusVariant = { Pending: 'warning', Approved: 'success', Rejected: 'danger', Cancelled: 'default' };

export default function Attendance() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState('attendance');
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [periodFilter, setPeriodFilter] = useState('All');
  const [currentPage, setCurrentPage] = useState(1);
  const PAGE_SIZE = 12;

  const { data: attendanceRecords } = useApiData(
    () => attendanceService.getAll(),
    []
  );

  const {
    data: overtimeRecords,
    loading: loadingOvertime,
    refresh: refreshOvertime,
  } = useApiData(() => overtimeService.getAll(), []);

  const [overtimeSearch, setOvertimeSearch] = useState('');
  const [overtimeStatusFilter, setOvertimeStatusFilter] = useState('All');
  const [overtimePage, setOvertimePage] = useState(1);
  const [selectedOvertime, setSelectedOvertime] = useState(null);
  const [approveHours, setApproveHours] = useState('');
  const [approveComment, setApproveComment] = useState('');
  const [selectedOtIds, setSelectedOtIds] = useState(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [collapsedDepts, setCollapsedDepts] = useState(new Set());
  const OT_PAGE_SIZE = 12;

  useEffect(() => {
    employeeService.getAll()
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, []);

  const enrichedOvertime = useMemo(() => {
    return (overtimeRecords || []).map(req => {
      const emp = employees.find(e => e.id === req.employeeId);
      return { ...req, firstName: emp?.firstName || '', lastName: emp?.lastName || '', avatar: emp?.avatar, department: emp?.department || '' };
    });
  }, [overtimeRecords, employees]);

  const overtimeStats = useMemo(() => ({
    pending: (overtimeRecords || []).filter(r => r.status === 'Pending').length,
    approved: (overtimeRecords || []).filter(r => r.status === 'Approved').length,
    rejected: (overtimeRecords || []).filter(r => r.status === 'Rejected').length,
  }), [overtimeRecords]);

  const filteredOvertime = useMemo(() => {
    return enrichedOvertime.filter(r => {
      const name = `${r.firstName} ${r.lastName}`.toLowerCase();
      const matchSearch = !overtimeSearch || name.includes(overtimeSearch.toLowerCase());
      const matchStatus = overtimeStatusFilter === 'All' || r.status === overtimeStatusFilter;
      return matchSearch && matchStatus;
    }).sort((a, b) => b.requestedDate.localeCompare(a.requestedDate));
  }, [enrichedOvertime, overtimeSearch, overtimeStatusFilter]);

  const overtimeTotalPages = Math.ceil(filteredOvertime.length / OT_PAGE_SIZE);
  const overtimePaginated = filteredOvertime.slice((overtimePage - 1) * OT_PAGE_SIZE, overtimePage * OT_PAGE_SIZE);

  const openOvertime = (req) => {
    setApproveHours(req.expectedHours ? String(req.expectedHours) : '');
    setApproveComment(req.comments || '');
    setSelectedOvertime(req);
  };

  const otDepartments = useMemo(() => {
    const groups = {};
    for (const r of filteredOvertime) {
      const dept = r.department || 'Unassigned';
      if (!groups[dept]) groups[dept] = [];
      groups[dept].push(r);
    }
    return Object.entries(groups).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filteredOvertime]);

  const pendingOtIds = useMemo(
    () => new Set(filteredOvertime.filter(r => r.status === 'Pending').map(r => r.id)),
    [filteredOvertime],
  );

  const isAllPendingSelected = pendingOtIds.size > 0 && [...pendingOtIds].every(id => selectedOtIds.has(id));
  const anySelected = selectedOtIds.size > 0;

  const toggleSelectAll = (ids) => {
    setSelectedOtIds(prev => {
      const next = new Set(prev);
      const allSelected = ids.every(id => next.has(id));
      for (const id of ids) { allSelected ? next.delete(id) : next.add(id); }
      return next;
    });
  };

  const toggleSelectOne = (id) => {
    setSelectedOtIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleDeptCollapse = (dept) => {
    setCollapsedDepts(prev => {
      const next = new Set(prev);
      next.has(dept) ? next.delete(dept) : next.add(dept);
      return next;
    });
  };

  const handleBulkDecision = async (status) => {
    const ids = [...selectedOtIds].filter(id => pendingOtIds.has(id));
    if (ids.length === 0) return;
    setBulkLoading(true);
    try {
      const approvedBy = user ? `${user.firstName} ${user.lastName}` : 'HR Admin';
      await overtimeService.bulkUpdateStatus(ids, status, approvedBy);
      await refreshOvertime();
      setSelectedOtIds(new Set());
      toast.success(
        status === 'Approved' ? 'Overtime Approved' : 'Overtime Rejected',
        `${ids.length} overtime request${ids.length === 1 ? '' : 's'} ${status.toLowerCase()}.`,
      );
    } catch {
      toast.error('Error', `Failed to bulk ${status.toLowerCase()} overtime requests.`);
    } finally {
      setBulkLoading(false);
    }
  };

  const handleOvertimeDecision = async (status) => {
    if (!selectedOvertime) return;
    const approvedBy = user ? `${user.firstName} ${user.lastName}` : 'HR Admin';
    const approvedHours = status === 'Approved' && approveHours !== '' ? Number(approveHours) : undefined;
    const comments = approveComment.trim() || undefined;
    try {
      await overtimeService.updateStatus(selectedOvertime.id, status, approvedBy, approvedHours, comments);
      await refreshOvertime();
      setSelectedOvertime(null);
      toast.success(
        status === 'Approved' ? 'Overtime Approved' : 'Overtime Rejected',
        `Overtime request has been ${status.toLowerCase()}.`
      );
    } catch {
      toast.error('Error', `Failed to ${status === 'Approved' ? 'approve' : 'reject'} overtime request.`);
    }
  };

  const todayStr = toDateKey(new Date());

  const enriched = useMemo(() => {
    return (attendanceRecords || []).map(a => {
      const emp = employees.find(e => e.id === a.employeeId);
      return { ...a, firstName: emp?.firstName || '', lastName: emp?.lastName || '', avatar: emp?.avatar, department: emp?.department || '' };
    });
  }, [attendanceRecords, employees]);

  const todayRecords = useMemo(() => enriched.filter(a => a.date === todayStr), [enriched, todayStr]);

  const stats = useMemo(() => ({
    present: todayRecords.filter(a => a.status === 'Present').length,
    late: todayRecords.filter(a => a.status === 'Late').length,
    absent: todayRecords.filter(a => a.status === 'Absent').length,
    avgOvertime: todayRecords.length ? (todayRecords.reduce((s, a) => s + (a.overtime || 0), 0) / todayRecords.length).toFixed(1) : '0.0',
  }), [todayRecords]);

  const filtered = useMemo(() => {
    return enriched.filter(a => {
      const name = `${a.firstName} ${a.lastName}`.toLowerCase();
      const matchSearch = !search || name.includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || a.status === statusFilter;
      let matchPeriod = true;
      if (periodFilter === 'Today') matchPeriod = a.date === todayStr;
      else if (periodFilter === 'This Week') {
        const d = new Date(a.date);
        const now = new Date(todayStr);
        const dayOfWeek = now.getDay();
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - dayOfWeek);
        matchPeriod = d >= weekStart && d <= now;
      }
      return matchSearch && matchStatus && matchPeriod;
    });
  }, [enriched, search, statusFilter, periodFilter, todayStr]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paginated = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handleExport = () => {
    const rows = filtered.map((a) => ({
      Employee: `${a.firstName} ${a.lastName}`.trim(),
      Department: a.department,
      Date: formatDate(a.date),
      'Clock In': a.clockIn ? formatTime(a.clockIn) : '',
      'Clock Out': a.clockOut ? formatTime(a.clockOut) : '',
      'Regular Hours': a.regularHours || 0,
      Overtime: a.overtime || 0,
      'Total Hours': a.totalHours || 0,
      Status: a.status,
      Location: a.location,
    }));
    downloadCSV('attendance.csv', rows);
    toast.success('Export Complete', `Exported ${rows.length} attendance record${rows.length === 1 ? '' : 's'} to CSV.`);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Time & Attendance</h1>
          <p className="text-[14px] text-gray-500 mt-1">Track employee attendance and working hours</p>
        </div>
        {activeTab === 'attendance' && (
          <Button variant="outline" icon={Download} onClick={handleExport}>Export</Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border border-gray-200 rounded-xl overflow-hidden w-fit">
        {[
          { key: 'attendance', label: 'Attendance Records' },
          { key: 'overtime', label: 'Overtime Requests' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key ? 'bg-blue-50 text-blue-600' : 'text-gray-500 hover:bg-gray-50'
            }`}
          >
            {tab.label}
            {tab.key === 'overtime' && overtimeStats.pending > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-semibold rounded-full bg-amber-100 text-amber-700">
                {overtimeStats.pending}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'attendance' ? (
      <>
      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Present Today', value: stats.present, icon: CheckCircle, color: 'emerald' },
          { label: 'Late Today', value: stats.late, icon: AlertTriangle, color: 'red' },
          { label: 'Absent Today', value: stats.absent, icon: Coffee, color: 'amber' },
          { label: 'Avg Overtime', value: `${stats.avgOvertime}h`, icon: Timer, color: 'blue' },
        ].map(s => {
          const colorMap = { emerald: 'bg-emerald-50 text-emerald-600', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600', blue: 'bg-blue-50 text-blue-600' };
          const barMap = { emerald: 'bg-emerald-500', red: 'bg-red-500', amber: 'bg-amber-500', blue: 'bg-blue-500' };
          return (
            <Card key={s.label} className="overflow-hidden" hover>
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
          );
        })}
      </div>

      {/* Attendance History */}
      <Card padding={false}>
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="font-semibold text-gray-900">Attendance History</h3>
            <div className="flex flex-wrap items-center gap-3">
              <SearchBar value={search} onChange={(v) => { setSearch(v); setCurrentPage(1); }} placeholder="Search employee..." className="w-full sm:w-64" />
              <Select value={periodFilter} onChange={e => { setPeriodFilter(e.target.value); setCurrentPage(1); }} containerClass="w-full sm:w-36">
                <option value="All">All Time</option>
                <option value="Today">Today</option>
                <option value="This Week">This Week</option>
              </Select>
              <Select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setCurrentPage(1); }} containerClass="w-full sm:w-36">
                <option value="All">All Status</option>
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Absent">Absent</option>
                <option value="Half Day">Half Day</option>
                <option value="On Leave">On Leave</option>
              </Select>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Employee', 'Date', 'Clock In', 'Clock Out', 'Regular', 'Overtime', 'Total', 'Status', 'Location'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="px-4 py-12 text-center text-gray-400 text-sm">No attendance records found</td></tr>
              ) : (
                paginated.map((a, i) => (
                  <tr key={a.id || i} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar firstName={a.firstName} lastName={a.lastName} size="sm" src={a.avatar} />
                        <div>
                          <p className="font-medium text-sm text-gray-900">{a.firstName} {a.lastName}</p>
                          <p className="text-xs text-gray-500">{a.department}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{formatDate(a.date)}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{a.clockIn ? formatTime(a.clockIn) : '-'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">{a.clockOut ? formatTime(a.clockOut) : <span className="text-amber-500 italic">Still in</span>}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-700 font-medium">{a.clockIn && a.clockOut ? `${formatHours(a.regularHours)}h` : '-'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-700">
                      {a.overtime > 0 ? (
                        <span className="flex items-center gap-1">
                          <span className={(a.overtimeReconciliation?.status === 'unauthorized' || a.overtimeReconciliation?.status === 'overrun') ? 'text-amber-600 font-medium' : ''}>
                            {formatHours(a.overtime)}h
                          </span>
                          {a.overtimeReconciliation?.status === 'unauthorized' && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" title={`Unauthorized overtime - no approved request for ${formatDate(a.date)}`} />
                          )}
                          {a.overtimeReconciliation?.status === 'overrun' && (
                            <AlertTriangle className="w-3.5 h-3.5 text-amber-500" title={`Overtime overrun - ${formatHours(a.overtimeReconciliation.approvedHours)}h approved, ${formatHours(a.overtimeReconciliation.actualHours)}h clocked`} />
                          )}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-700 font-medium">{a.clockIn && a.clockOut ? `${formatHours(a.totalHours)}h` : '-'}</td>
                    <td className="px-4 py-3.5"><Badge variant={statusVariant[a.status]} dot size="xs">{a.status}</Badge></td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <MapPin className="w-3.5 h-3.5 text-gray-400" />
                        {a.location}
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
      </>
      ) : (
      <>
      {/* Overtime Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Pending', value: overtimeStats.pending, icon: Clock, color: 'amber' },
          { label: 'Approved', value: overtimeStats.approved, icon: CheckCircle, color: 'emerald' },
          { label: 'Rejected', value: overtimeStats.rejected, icon: AlertTriangle, color: 'red' },
        ].map(s => {
          const colorMap = { emerald: 'bg-emerald-50 text-emerald-600', red: 'bg-red-50 text-red-600', amber: 'bg-amber-50 text-amber-600' };
          const barMap = { emerald: 'bg-emerald-500', red: 'bg-red-500', amber: 'bg-amber-500' };
          return (
            <Card key={s.label} className="overflow-hidden" hover>
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
          );
        })}
      </div>

      {/* Filters + Bulk Actions */}
      <Card padding={false}>
        <div className="p-4 border-b border-gray-100">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <SearchBar value={overtimeSearch} onChange={(v) => { setOvertimeSearch(v); setOvertimePage(1); setSelectedOtIds(new Set()); }} placeholder="Search employee..." className="w-full sm:w-64" />
              <Select value={overtimeStatusFilter} onChange={e => { setOvertimeStatusFilter(e.target.value); setOvertimePage(1); setSelectedOtIds(new Set()); }} containerClass="w-full sm:w-36">
                <option value="All">All Status</option>
                <option value="Pending">Pending</option>
                <option value="Approved">Approved</option>
                <option value="Rejected">Rejected</option>
                <option value="Cancelled">Cancelled</option>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              {pendingOtIds.size > 0 && (
                <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input type="checkbox" checked={isAllPendingSelected} onChange={() => toggleSelectAll([...pendingOtIds])} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                  <span className="text-gray-600">Select all pending</span>
                </label>
              )}
            </div>
          </div>
        </div>

        {loadingOvertime ? (
          <div className="p-4"><SkeletonTable rows={6} cols={6} /></div>
        ) : filteredOvertime.length === 0 ? (
          <div className="px-4 py-12 text-center text-gray-400 text-sm">No overtime requests found</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {otDepartments.map(([dept, rows]) => {
              const deptPendingIds = rows.filter(r => r.status === 'Pending').map(r => r.id);
              const deptAllSelected = deptPendingIds.length > 0 && deptPendingIds.every(id => selectedOtIds.has(id));
              const collapsed = collapsedDepts.has(dept);
              return (
                <div key={dept}>
                  <div className="flex items-center gap-3 px-4 py-3 bg-gray-50/80">
                    <button onClick={() => toggleDeptCollapse(dept)} className="text-gray-400 hover:text-gray-600 transition-colors">
                      {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                    <p className="font-semibold text-sm text-gray-800 flex-1">{dept}</p>
                    <span className="text-xs font-medium text-gray-400 bg-white border border-gray-200 rounded-full px-2.5 py-0.5">
                      {rows.length} request{rows.length === 1 ? '' : 's'}
                    </span>
                    {deptPendingIds.length > 0 && (
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer select-none ml-1">
                        <input type="checkbox" checked={deptAllSelected} onChange={() => toggleSelectAll(deptPendingIds)} className="w-3.5 h-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
                        <span className="text-gray-500">All pending</span>
                      </label>
                    )}
                  </div>
                  {!collapsed && (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b border-gray-100 bg-gray-50/30">
                            <th className="w-10 px-4 py-2.5" />
                            {['Employee', 'Date', 'Expected Hours', 'Reason', 'Status', ''].map(h => (
                              <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {rows.map((r) => (
                            <tr key={r.id} className={`transition-colors ${selectedOtIds.has(r.id) ? 'bg-blue-50/50' : 'hover:bg-gray-50/50'}`}>
                              <td className="px-4 py-3">
                                {r.status === 'Pending' && (
                                  <input
                                    type="checkbox"
                                    checked={selectedOtIds.has(r.id)}
                                    onChange={() => toggleSelectOne(r.id)}
                                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                  />
                                )}
                              </td>
                              <td className="px-4 py-3.5">
                                <div className="flex items-center gap-3">
                                  <Avatar firstName={r.firstName} lastName={r.lastName} size="sm" src={r.avatar} />
                                  <div>
                                    <p className="font-medium text-sm text-gray-900">{r.firstName} {r.lastName}</p>
                                    <p className="text-xs text-gray-500">{r.department}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3.5 text-sm text-gray-700">{formatDate(r.date)}</td>
                              <td className="px-4 py-3.5 text-sm text-gray-700">
                                {r.status === 'Approved' && r.approvedHours != null
                                  ? <span><span className="font-medium text-gray-900">{formatHours(r.approvedHours)}h</span> <span className="text-gray-400">(of {r.expectedHours ? `${formatHours(r.expectedHours)}h` : '-'})</span></span>
                                  : r.expectedHours ? `${formatHours(r.expectedHours)}h` : '-'}
                              </td>
                              <td className="px-4 py-3.5 text-sm text-gray-600 max-w-xs truncate">{r.reason}</td>
                              <td className="px-4 py-3.5"><Badge variant={overtimeStatusVariant[r.status] || 'default'} dot size="xs">{r.status}</Badge></td>
                              <td className="px-4 py-3.5">
                                <button onClick={() => openOvertime(r)} className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors">View</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* Bulk Action Bar */}
      {anySelected && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-gray-900 text-white rounded-2xl shadow-2xl px-6 py-3 animate-fadeIn">
          <span className="text-sm font-medium">{selectedOtIds.size} selected</span>
          <div className="w-px h-5 bg-gray-700" />
          <Button variant="success" size="sm" icon={CheckCheck} loading={bulkLoading} onClick={() => handleBulkDecision('Approved')}>
            Approve
          </Button>
          <Button variant="danger" size="sm" icon={X} loading={bulkLoading} onClick={() => handleBulkDecision('Rejected')}>
            Reject
          </Button>
          <button onClick={() => setSelectedOtIds(new Set())} className="ml-1 text-gray-400 hover:text-white transition-colors text-xs">Clear</button>
        </div>
      )}
      </>
      )}

      <Modal isOpen={!!selectedOvertime} onClose={() => setSelectedOvertime(null)} title="Overtime Request" size="md">
        {selectedOvertime && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar firstName={selectedOvertime.firstName} lastName={selectedOvertime.lastName} size="md" src={selectedOvertime.avatar} />
              <div>
                <p className="font-semibold text-gray-900">{selectedOvertime.firstName} {selectedOvertime.lastName}</p>
                <p className="text-xs text-gray-500">{selectedOvertime.department}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-gray-400">Date</p>
                <p className="font-medium text-gray-900 mt-0.5">{formatDate(selectedOvertime.date)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Expected Hours</p>
                <p className="font-medium text-gray-900 mt-0.5">{selectedOvertime.expectedHours ? `${formatHours(selectedOvertime.expectedHours)}h` : 'Not specified'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Requested On</p>
                <p className="font-medium text-gray-900 mt-0.5">{formatDate(selectedOvertime.requestedDate)}</p>
              </div>
              <div>
                <p className="text-xs text-gray-400">Status</p>
                <Badge variant={overtimeStatusVariant[selectedOvertime.status] || 'default'} dot size="xs" className="mt-1">{selectedOvertime.status}</Badge>
              </div>
              {selectedOvertime.status === 'Approved' && (
                <>
                  <div>
                    <p className="text-xs text-gray-400">Approved Hours</p>
                    <p className="font-medium text-emerald-700 mt-0.5">{selectedOvertime.approvedHours != null ? `${formatHours(selectedOvertime.approvedHours)}h` : '-'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400">Approved By</p>
                    <p className="font-medium text-gray-900 mt-0.5">{selectedOvertime.approvedBy || '-'}</p>
                  </div>
                </>
              )}
            </div>
            <div>
              <p className="text-xs text-gray-400">Reason</p>
              <p className="text-sm text-gray-700 mt-1">{selectedOvertime.reason}</p>
            </div>
            {selectedOvertime.status === 'Approved' && (() => {
              const otRecord = attendanceRecords?.find(a => a.employeeId === selectedOvertime.employeeId && a.date === selectedOvertime.date);
              const actualOt = otRecord?.overtime || 0;
              const approvedOt = selectedOvertime.approvedHours != null ? selectedOvertime.approvedHours : (selectedOvertime.expectedHours || 0);
              const overrun = actualOt > approvedOt;
              const worked = actualOt > 0;
              return (
                <div className="rounded-xl border border-gray-100 bg-gray-50/60 p-4">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Overtime Reconciliation</p>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Approved</span>
                    <span className="font-semibold text-gray-900">{formatHours(approvedOt)}h</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-1">
                    <span className="text-gray-600">Clocked</span>
                    <span className="font-semibold text-gray-900">{actualOt > 0 ? `${formatHours(actualOt)}h` : 'None'}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2 pt-2 border-t border-gray-200">
                    {overrun ? (
                      <span className="flex items-center gap-1.5 text-amber-600 font-medium">
                        <AlertTriangle className="w-4 h-4" /> Exceeded approval by {formatHours(actualOt - approvedOt)}h
                      </span>
                    ) : worked ? (
                      <span className="flex items-center gap-1.5 text-emerald-600 font-medium">
                        <CheckCircle className="w-4 h-4" /> Within approved hours
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-gray-500 font-medium">
                        <Clock className="w-4 h-4" /> Approved but no overtime clocked
                      </span>
                    )}
                  </div>
                </div>
              );
            })()}
            {selectedOvertime.comments && (
              <div>
                <p className="text-xs text-gray-400">Comments</p>
                <p className="text-sm text-gray-700 mt-1 italic">{selectedOvertime.comments}</p>
              </div>
            )}
            {selectedOvertime.status === 'Pending' && (
              <>
                <Input
                  label="Approve Hours"
                  type="number"
                  min="0"
                  max="24"
                  step="0.5"
                  value={approveHours}
                  onChange={(e) => setApproveHours(e.target.value)}
                  placeholder={selectedOvertime.expectedHours ? `Defaults to ${selectedOvertime.expectedHours}h` : 'Hours to authorize'}
                />
                <Textarea
                  label="Comment"
                  value={approveComment}
                  onChange={(e) => setApproveComment(e.target.value)}
                  placeholder="Add a note for the employee (optional)"
                  rows={2}
                />
                <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
                  <Button variant="dangerOutline" icon={X} onClick={() => handleOvertimeDecision('Rejected')}>Reject</Button>
                  <Button variant="success" icon={Check} onClick={() => handleOvertimeDecision('Approved')}>Approve</Button>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
