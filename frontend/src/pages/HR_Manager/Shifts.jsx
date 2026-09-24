import { useState, useMemo, useEffect } from 'react';
import {
  CalendarDays, Clock, Edit, Check,
  Zap, Search, FilterX, Trash2, AlertTriangle, Bot, UserPlus,
  Flame, ChevronLeft, ChevronRight, Users,
} from 'lucide-react';
import Card, { CardTitle, CardDescription } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import Modal from '../../components/ui/Modal';
import EmployeePicker from '../../components/scheduling/EmployeePicker';
import AutomatedShiftModal from '../../components/scheduling/AutomatedShiftModal';
import Input, { Select, Textarea } from '../../components/ui/Input';
import { employeeService, shiftService } from '../../services/api';
import { formatDate, formatTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import useApiData from '../../hooks/useApiData';
import { SkeletonPage } from '../../components/ui/LoadingSkeleton';

const shiftIcons = { SHIFT004: Zap, SHIFT005: Flame };
const shiftIconBg = {
  SHIFT004: 'bg-blue-50 text-blue-600',
  SHIFT005: 'bg-red-50 text-red-600',
};
const shiftBorder = {
  SHIFT004: 'border-l-blue-500',
  SHIFT005: 'border-l-red-500',
};
const shiftBadgeVariant = { SHIFT004: 'primary', SHIFT005: 'danger' };
const statusVariant = { Scheduled: 'primary', Cancelled: 'danger' };
const STATUS_OPTIONS = ['Scheduled', 'Cancelled'];

const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d) => addDays(d, -((d.getDay() + 6) % 7));
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Shifts() {
  const [employees, setEmployees] = useState([]);
  const { toast } = useToast();
  const { data: shiftDefs, loading: loadingShiftDefs } = useApiData(() => shiftService.getAllShifts(), []);
  const { data: shiftSchedules, refresh: refreshSchedules, loading: loadingShiftSchedules } = useApiData(() => shiftService.getSchedules(), []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [formData, setFormData] = useState({ employeeId: '', shiftId: '', date: '', notes: '' });
  const [formErrors, setFormErrors] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [automationOpen, setAutomationOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [calMonthOffset, setCalMonthOffset] = useState(0);
  const [dayDetailDate, setDayDetailDate] = useState(null);

  useEffect(() => {
    employeeService.getAll().then(setEmployees).catch(() => setEmployees([]));
  }, []);

  const allSchedules = useMemo(() => [...(shiftSchedules || [])].sort((a, b) => b.date.localeCompare(a.date)), [shiftSchedules]);
  const stats = useMemo(() => {
    const s = shiftSchedules || [];
    const now = new Date();
    const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - ((now.getDay() + 6) % 7));
    const weekStart = toDateKey(monday);
    const weekEnd = toDateKey(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6));
    const today = toDateKey(now);
    const active = s.filter(x => x.status === 'Scheduled');
    return {
      total: s.length,
      scheduled: active.length,
      today: active.filter(x => x.date === today).length,
      thisWeek: active.filter(x => x.date >= weekStart && x.date <= weekEnd).length,
    };
  }, [shiftSchedules]);
  const departments = useMemo(() => [...new Set(employees.map(e => e.department).filter(Boolean))].sort(), [employees]);
  const standardShift = useMemo(() => {
    const d = shiftDefs || [];
    return d.find(s => s.startTime === '08:00' && s.endTime === '17:00') || d.find(s => s.id === 'SHIFT004') || d[0] || null;
  }, [shiftDefs]);

  const shiftAssignmentCount = useMemo(() => {
    const map = {};
    for (const s of shiftSchedules || []) { map[s.shiftId] = (map[s.shiftId] || 0) + 1; }
    return map;
  }, [shiftSchedules]);

  // The calendar always shows full weeks (Mon-Sun), so a month grid starts on the Monday
  // on/before the 1st and ends on the Sunday on/after the last day - 28, 35 or 42 days.
  const calMonthDate = useMemo(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + calMonthOffset, 1);
  }, [calMonthOffset]);
  const calGridStart = useMemo(() => startOfWeek(calMonthDate), [calMonthDate]);
  const calGridDays = useMemo(() => {
    const lastOfMonth = new Date(calMonthDate.getFullYear(), calMonthDate.getMonth() + 1, 0);
    const gridEnd = addDays(startOfWeek(lastOfMonth), 6);
    const days = [];
    for (let d = calGridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);
    return days;
  }, [calGridStart, calMonthDate]);
  const calSchedulesByDate = useMemo(() => {
    const map = {};
    const startK = toDateKey(calGridStart);
    const endK = toDateKey(calGridDays[calGridDays.length - 1]);
    for (const s of allSchedules) {
      if (s.date >= startK && s.date <= endK) {
        if (!map[s.date]) map[s.date] = [];
        map[s.date].push(s);
      }
    }
    return map;
  }, [allSchedules, calGridStart, calGridDays]);

  const filteredSchedules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allSchedules.filter(s => {
      const emp = employees.find(e => e.id === s.employeeId);
      if (q) {
        const name = emp ? `${emp.firstName} ${emp.lastName}` : s.employeeName;
        if (!`${name} ${s.employeeId}`.toLowerCase().includes(q)) return false;
      }
      if (departmentFilter && emp?.department !== departmentFilter) return false;
      if (dateFilter && s.date !== dateFilter) return false;
      if (statusFilter && s.status !== statusFilter) return false;
      return true;
    });
  }, [allSchedules, employees, searchQuery, departmentFilter, dateFilter, statusFilter]);

  const groupedSchedules = useMemo(() => {
    const groups = [];
    let lastDate = null;
    for (const s of filteredSchedules) {
      if (s.date !== lastDate) {
        groups.push({ type: 'date', date: s.date });
        lastDate = s.date;
      }
      groups.push({ type: 'row', schedule: s });
    }
    return groups;
  }, [filteredSchedules]);

  const hasActiveFilters = Boolean(searchQuery || departmentFilter || dateFilter || statusFilter);
  const clearFilters = () => { setSearchQuery(''); setDepartmentFilter(''); setDateFilter(''); setStatusFilter(''); };

  // Assigning or generating needs at least one shift template. If none exist say so,
  // instead of opening a form whose Shift dropdown is silently empty.
  const noShiftTemplates = () => {
    if (loadingShiftDefs || (shiftDefs && shiftDefs.length > 0)) return false;
    toast.error('No shift templates found', 'There are no shift definitions (such as the Standard Shift) to assign. Reload the page; if this persists, ask the developer to run the scheduling migrations.');
    return true;
  };

  const openAdd = (presetDate) => {
    if (noShiftTemplates()) return;
    setEditingSchedule(null);
    setFormData({ employeeId: '', shiftId: standardShift?.id || '', date: presetDate || '', notes: '' });
    setFormErrors({});
    setIsModalOpen(true);
  };
  const openEdit = (schedule) => {
    setEditingSchedule(schedule);
    setFormData({ employeeId: schedule.employeeId, shiftId: schedule.shiftId, date: schedule.date, notes: '' });
    setFormErrors({});
    setIsModalOpen(true);
  };
  const openDeleteSchedule = (schedule) => setDeleteTarget(schedule);
  const closeDeleteSchedule = () => setDeleteTarget(null);

  const handleDeleteSchedule = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await shiftService.deleteSchedule(deleteTarget.id);
      toast.success('Assignment Deleted', 'The shift assignment was removed.');
      setDeleteTarget(null);
      await refreshSchedules();
    } catch (err) {
      toast.error('Delete Failed', err?.response?.data?.message || 'Unable to delete this assignment.');
    } finally { setDeleting(false); }
  };

  const validate = () => {
    const errs = {};
    if (!formData.employeeId) errs.employeeId = 'Required';
    if (!formData.shiftId) errs.shiftId = 'Required';
    if (!formData.date) errs.date = 'Required';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;
    const employee = employees.find(e => e.id === formData.employeeId);
    const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : '';
    const payload = { employeeId: formData.employeeId, employeeName, shiftId: formData.shiftId, date: formData.date, notes: formData.notes, status: 'Scheduled' };
    try {
      if (editingSchedule) {
        await shiftService.updateSchedule(editingSchedule.id, payload);
        await refreshSchedules();
        toast.success('Shift Updated', `${employeeName}'s assignment was updated.`);
      } else {
        await shiftService.createSchedule(payload);
        await refreshSchedules();
        toast.success('Shift Assigned', `${employeeName} was scheduled for ${formData.date}.`);
      }
    } catch (err) {
      // Keep the form open (nothing typed is lost) and show the server's reason,
      // e.g. "already has a shift on that day".
      const data = err?.response?.data;
      const firstFieldError = data?.errors ? Object.values(data.errors).flat()[0] : null;
      toast.error('Could not save schedule', firstFieldError || data?.message || 'The server did not respond. Please try again.');
      return;
    }
    setIsModalOpen(false);
  };

  const selectedEmployee = employees.find(e => e.id === formData.employeeId);

  const deleteEmpName = deleteTarget ? (() => {
    const emp = employees.find(e => e.id === deleteTarget.employeeId);
    return emp ? `${emp.firstName} ${emp.lastName}` : deleteTarget.employeeName;
  })() : '';


  const statsCards = [
    { label: 'Total Assignments', value: stats.total, icon: CalendarDays, color: 'blue' },
    { label: 'Scheduled', value: stats.scheduled, icon: Clock, color: 'amber' },
    { label: 'Working Today', value: stats.today, icon: Check, color: 'emerald' },
    { label: 'Scheduled This Week', value: stats.thisWeek, icon: CalendarDays, color: 'purple' },
  ];
  const colorMap = { blue: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', purple: 'bg-purple-50 text-purple-600' };
  const barMap = { blue: 'bg-blue-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', purple: 'bg-purple-500' };

  // Only the FIRST load shows the skeleton. A later refresh (after a save) keeps the page, and any open window,
  // on screen; swapping everything for the skeleton would close the automation window in the middle of its steps.
  const shiftsLoading = (loadingShiftDefs && !shiftDefs) || (loadingShiftSchedules && !shiftSchedules);

  if (shiftsLoading) {
    return <SkeletonPage kpiCount={4} />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shift & Schedule Management</h1>
          <p className="text-[14px] text-gray-500 mt-1">Create and manage employee shifts and schedules</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statsCards.map(s => (
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
        ))}
      </div>

      {/* Shift Definition Cards */}
      <div>
        <h2 className="text-sm font-semibold text-gray-900 mb-3">Shift Types</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {(shiftDefs || []).map(def => {
            const Icon = shiftIcons[def.id] || Clock;
            const startH = parseInt(def.startTime);
            const endH = parseInt(def.endTime);
            let duration = endH - startH;
            if (duration <= 0) duration += 24;
            return (
              <Card key={def.id} className="overflow-hidden" hover>
                <div className="flex items-start gap-3">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${shiftIconBg[def.id] || 'bg-gray-50 text-gray-600'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{def.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{formatTime(def.startTime)} – {formatTime(def.endTime)}</p>
                    <div className="flex items-center gap-3 mt-2">
                      <span className="text-[11px] font-medium text-gray-400">{duration}h</span>
                      <span className="text-[11px] font-medium text-gray-400 flex items-center gap-1">
                        <Users className="w-3 h-3" /> {shiftAssignmentCount[def.id] || 0} assigned
                      </span>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* Monthly Coverage Calendar */}
      <Card padding={false} className="overflow-hidden">
        <div className="p-5 pb-3 flex items-center justify-between">
          <div>
            <CardTitle>Monthly Coverage</CardTitle>
            <CardDescription>{calMonthDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} — click a day to see who's scheduled</CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setCalMonthOffset(o => o - 1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setCalMonthOffset(0)} className="px-3 py-1.5 text-xs font-semibold rounded-lg text-gray-600 hover:bg-gray-100 transition-colors">
              Today
            </button>
            <button onClick={() => setCalMonthOffset(o => o + 1)} className="p-2 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        <div className="grid grid-cols-7 border-t border-gray-100">
          {DAY_LABELS.map((label) => (
            <div key={label} className="px-2 py-2 text-center bg-gray-50/50 border-b border-gray-100">
              <p className="text-[10px] font-semibold uppercase text-gray-400">{label}</p>
            </div>
          ))}
          {calGridDays.map(dayDate => {
            const dateK = toDateKey(dayDate);
            const isToday = dateK === toDateKey(new Date());
            const inMonth = dayDate.getMonth() === calMonthDate.getMonth();
            const daySchedules = calSchedulesByDate[dateK] || [];
            const dayPreview = daySchedules.slice(0, 3);
            return (
              <button
                key={dateK}
                type="button"
                onClick={() => setDayDetailDate(dateK)}
                className={`min-h-[92px] w-full border-r border-b border-gray-50 last:border-r-0 p-2 flex flex-col items-center gap-1.5 transition-colors hover:bg-blue-50/40 ${isToday ? 'bg-blue-50/40' : ''} ${!inMonth ? 'opacity-40' : ''}`}
              >
                <span className={`text-xs font-semibold ${isToday ? 'text-blue-600' : 'text-gray-700'}`}>{dayDate.getDate()}</span>
                {daySchedules.length > 0 && (
                  <>
                    <span className="flex items-center -space-x-1.5">
                      {dayPreview.map(s => {
                        const emp = employees.find(e => e.id === s.employeeId);
                        return (
                          <Avatar
                            key={s.id}
                            firstName={emp?.firstName || s.employeeName?.split(' ')[0] || '?'}
                            lastName={emp?.lastName || s.employeeName?.split(' ')[1] || ''}
                            size="xs"
                            className="ring-2 ring-white"
                          />
                        );
                      })}
                    </span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${isToday ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {daySchedules.length} shift{daySchedules.length === 1 ? '' : 's'}
                    </span>
                  </>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Day Detail Modal */}
      <Modal isOpen={!!dayDetailDate} onClose={() => setDayDetailDate(null)} title={dayDetailDate ? formatDate(dayDetailDate) : ''} size="md">
        {(() => {
          const daySchedules = dayDetailDate ? (calSchedulesByDate[dayDetailDate] || []) : [];
          if (daySchedules.length === 0) {
            return (
              <div className="text-center py-8">
                <p className="text-sm text-gray-500 mb-4">No one is scheduled on this day.</p>
                <Button icon={UserPlus} onClick={() => { const d = dayDetailDate; setDayDetailDate(null); openAdd(d); }}>Assign a shift</Button>
              </div>
            );
          }
          return (
            <div>
              <p className="text-sm text-gray-500 mb-3">{daySchedules.length} shift{daySchedules.length === 1 ? '' : 's'} scheduled</p>
              <div className="rounded-xl border border-gray-200 divide-y divide-gray-100 max-h-96 overflow-y-auto">
                {daySchedules.map(s => {
                  const emp = employees.find(e => e.id === s.employeeId);
                  const def = (shiftDefs || []).find(d => d.id === s.shiftId);
                  const name = emp ? `${emp.firstName} ${emp.lastName}` : s.employeeName;
                  return (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                      <Avatar firstName={emp?.firstName || name.split(' ')[0] || '?'} lastName={emp?.lastName || name.split(' ')[1] || ''} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                        <p className="text-xs text-gray-500 truncate">{emp?.department || '—'}{def ? ` · ${formatTime(def.startTime)}–${formatTime(def.endTime)}` : ''}</p>
                      </div>
                      <Badge variant={statusVariant[s.status] || 'default'} size="xs">{s.status}</Badge>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}
      </Modal>

      {/* Schedule Management Table */}
      <Card padding={false} className="h-[560px] flex flex-col overflow-hidden">
        <div className="p-6 pb-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Schedule Management</CardTitle>
              <CardDescription>Assign, review, and manage employee schedules</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Automated: the rules build a draft for a period, you review and approve it. Standard: you assign one shift to one person by hand. */}
              <Button variant="outline" icon={Bot} onClick={() => setAutomationOpen(true)} title="Let the system build a schedule from your rules, then review and approve it">+ Automated Shift</Button>
              <Button icon={UserPlus} onClick={() => openAdd()} title="Assign one shift to one person by hand">Standard Shift Assign</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-5">
            <div className="sm:col-span-2">
              <Input icon={Search} placeholder="Search employee name or ID..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <Select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}>
              <option value="">All Departments</option>
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </Select>
            <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
            <p className="text-sm text-gray-500">
              Showing <span className="font-semibold text-gray-700">{filteredSchedules.length}</span> of {allSchedules.length} schedules
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors">
                <FilterX className="w-3.5 h-3.5" /> Clear Filters
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Employee', 'Department', 'Shift', 'Date', 'Start', 'End', 'Status', ''].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky top-0 z-10 bg-gray-50 border-b border-gray-100">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {groupedSchedules.map((item) => {
                if (item.type === 'date') {
                  const d = new Date(`${item.date}T00:00:00`);
                  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
                  return (
                    <tr key={`date-${item.date}`}>
                      <td colSpan={8} className="px-6 py-2 bg-gray-50/80 border-b border-gray-100">
                        <span className="text-xs font-semibold text-gray-500">{label}</span>
                      </td>
                    </tr>
                  );
                }
                const schedule = item.schedule;
                const emp = employees.find(e => e.id === schedule.employeeId);
                const shiftDef = (shiftDefs || []).find(s => s.id === schedule.shiftId);
                const empName = emp ? `${emp.firstName} ${emp.lastName}` : schedule.employeeName;
                return (
                  <tr key={schedule.id} className={`hover:bg-gray-50/50 transition-colors border-l-4 ${shiftBorder[schedule.shiftId] || 'border-l-transparent'}`}>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <Avatar firstName={emp?.firstName || ''} lastName={emp?.lastName || ''} size="sm" src={emp?.avatar} />
                        <div>
                          <p className="font-medium text-sm text-gray-900">{empName}</p>
                          <p className="text-xs text-gray-500">{schedule.employeeId}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-gray-600 whitespace-nowrap">{emp?.department || '—'}</td>
                    <td className="px-6 py-3.5">
                      <Badge variant={shiftBadgeVariant[schedule.shiftId]} size="xs">{shiftDef?.name || 'Unknown'}</Badge>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-gray-700 whitespace-nowrap">{formatDate(schedule.date)}</td>
                    <td className="px-6 py-3.5 text-sm text-gray-700 whitespace-nowrap">{shiftDef ? formatTime(shiftDef.startTime) : '—'}</td>
                    <td className="px-6 py-3.5 text-sm text-gray-700 whitespace-nowrap">{shiftDef ? formatTime(shiftDef.endTime) : '—'}</td>
                    <td className="px-6 py-3.5">
                      <Badge variant={statusVariant[schedule.status] || 'default'} dot size="xs">{schedule.status}</Badge>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openEdit(schedule)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-amber-600 transition-colors" title="Edit">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => openDeleteSchedule(schedule)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Delete">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filteredSchedules.length === 0 && (
            <div className="px-6 py-12 text-center">
              <CalendarDays className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <p className="text-sm font-medium text-gray-500">No schedules found</p>
              <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or assign a new schedule.</p>
            </div>
          )}
        </div>
      </Card>

      {/* Assign / Edit Modal */}
      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingSchedule ? 'Edit Shift Assignment' : 'Standard Shift Assign'} size="xl">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 space-y-2 min-w-0">
            <span className="text-[13px] font-semibold text-gray-700 block">Who is this for?</span>
            <EmployeePicker mode="single" employees={employees} value={formData.employeeId} onChange={(id) => setFormData({ ...formData, employeeId: id })} error={formErrors.employeeId} listHeight="max-h-[46vh]" />
            {formErrors.employeeId && <p className="text-xs text-red-500">Choose an employee</p>}
          </div>

          <div className="lg:col-span-2 space-y-5">
            <div>
              <span className="text-[13px] font-semibold text-gray-700 block mb-1.5">Selected employee</span>
              {selectedEmployee ? (
                <div className="flex items-center gap-3 px-4 py-3 bg-blue-50/60 border border-blue-100 rounded-xl">
                  <Avatar firstName={selectedEmployee.firstName} lastName={selectedEmployee.lastName} size="md" src={selectedEmployee.avatar} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{selectedEmployee.firstName} {selectedEmployee.lastName}</p>
                    <p className="text-xs text-gray-500 truncate">{selectedEmployee.department} · {selectedEmployee.position}</p>
                  </div>
                  <Badge variant="success" size="xs">{selectedEmployee.status}</Badge>
                </div>
              ) : <p className="text-xs text-gray-400 px-1">Pick someone from the list on the left.</p>}
            </div>

            <div>
              <span className="text-[13px] font-semibold text-gray-700 block mb-1.5">Working hours</span>
              {standardShift ? (
                <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-blue-100 bg-blue-50/60">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${shiftIconBg[standardShift.id] || 'text-blue-600 bg-blue-50'}`}>
                    <Zap className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{standardShift.name}</p>
                    <p className="text-xs text-gray-500">Standard working hours</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-gray-900">{formatTime(standardShift.startTime)}</p>
                    <p className="text-xs text-gray-500">to {formatTime(standardShift.endTime)}</p>
                  </div>
                </div>
              ) : <p className="text-xs text-gray-400">No shift definition available.</p>}
              <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
                <Clock className="w-3 h-3" /> Hours worked beyond {standardShift ? formatTime(standardShift.endTime) : '5:00 PM'} only count with an approved overtime request.
              </p>
            </div>

            <div>
              <Input label="Date" type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} error={formErrors.date} />
              {formData.date && <p className="text-xs text-gray-400 mt-1.5">{new Date(`${formData.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>}
            </div>
            <Textarea label="Notes" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes about this assignment..." rows={2} />
          </div>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
          <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave}>{editingSchedule ? 'Save Changes' : 'Assign Shift'}</Button>
        </div>
      </Modal>

      <AutomatedShiftModal isOpen={automationOpen} onClose={() => setAutomationOpen(false)} employees={employees} shiftDefs={shiftDefs || []} onChanged={() => refreshSchedules()} />

      {/* Delete Confirmation */}
      <Modal isOpen={!!deleteTarget} onClose={closeDeleteSchedule} title="Delete Shift Assignment" size="sm">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-gray-700">
                  Are you sure you want to remove <span className="font-semibold text-gray-900">{deleteEmpName}</span> from the <span className="font-semibold text-gray-900">{formatDate(deleteTarget.date)}</span> schedule?
                </p>
                <p className="text-xs text-gray-500 mt-1">The employee will no longer be scheduled for this day. This action cannot be undone.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button variant="outline" onClick={closeDeleteSchedule} disabled={deleting}>Cancel</Button>
              <Button variant="danger" onClick={handleDeleteSchedule} loading={deleting}>Delete Assignment</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
