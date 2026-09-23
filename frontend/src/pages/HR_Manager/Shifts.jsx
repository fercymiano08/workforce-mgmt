import { useState, useMemo, useEffect } from 'react';
import {
  CalendarDays, Clock, Edit, Check,
  Zap, Search, FilterX, Wand2, Trash2, AlertTriangle, Bot, UserPlus,
  Flame, ChevronLeft, ChevronRight, Users,
} from 'lucide-react';
import Card, { CardTitle, CardDescription } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import Modal from '../../components/ui/Modal';
import EmployeePicker from '../../components/scheduling/EmployeePicker';
import ScheduleRulesModal from '../../components/scheduling/ScheduleRulesModal';
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
  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [generateStep, setGenerateStep] = useState(1);
  const [generateForm, setGenerateForm] = useState({
    startDate: '', endDate: '', shiftId: '', skipWeekends: true, employeeIds: [],
  });
  const [generateErrors, setGenerateErrors] = useState({});
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [generating, setGenerating] = useState(false);
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

  const openGenerate = () => {
    if (noShiftTemplates()) return;
    setGenerateForm({ startDate: '', endDate: '', shiftId: standardShift?.id || '', skipWeekends: true, employeeIds: [] });
    setGenerateErrors({});
    setGenerateStep(1);
    setPreview(null);
    setIsGenerateModalOpen(true);
  };

  const setQuickRange = (type) => {
    const now = new Date();
    const monday = startOfWeek(now);
    if (type === 'thisWeek') {
      setGenerateForm(p => ({ ...p, startDate: toDateKey(monday), endDate: toDateKey(addDays(monday, 4)) }));
    } else if (type === 'nextWeek') {
      setGenerateForm(p => ({ ...p, startDate: toDateKey(addDays(monday, 7)), endDate: toDateKey(addDays(monday, 11)) }));
    } else if (type === 'thisMonth') {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setGenerateForm(p => ({ ...p, startDate: toDateKey(first), endDate: toDateKey(last) }));
    } else if (type === 'nextMonth') {
      const first = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 2, 0);
      setGenerateForm(p => ({ ...p, startDate: toDateKey(first), endDate: toDateKey(last) }));
    }
  };

  const targetCount = generateForm.employeeIds.length;
  const selectedEmployee = employees.find(e => e.id === formData.employeeId);
  const selectedGenShift = (shiftDefs || []).find(s => s.id === generateForm.shiftId);

  const deleteEmpName = deleteTarget ? (() => {
    const emp = employees.find(e => e.id === deleteTarget.employeeId);
    return emp ? `${emp.firstName} ${emp.lastName}` : deleteTarget.employeeName;
  })() : '';


  const generateErrorsFor = () => {
    const errs = {};
    if (!generateForm.startDate) errs.startDate = 'Required';
    if (!generateForm.endDate) errs.endDate = 'Required';
    if (generateForm.startDate && generateForm.endDate && generateForm.endDate < generateForm.startDate) errs.endDate = 'Must be on or after the start date';
    if (!generateForm.shiftId) errs.shiftId = 'Required';
    if (generateForm.employeeIds.length === 0) errs.employeeIds = 'Select at least one employee';
    return errs;
  };

  const generatePayload = () => ({
    startDate: generateForm.startDate, endDate: generateForm.endDate, shiftId: generateForm.shiftId,
    skipWeekends: generateForm.skipWeekends, employeeIds: generateForm.employeeIds,
  });

  // Step 2 -> 3: ask the server what WOULD happen. Nothing is created yet.
  const handlePreview = async () => {
    const errs = generateErrorsFor();
    setGenerateErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setPreviewing(true);
    try {
      const result = await shiftService.generateSchedule({ ...generatePayload(), preview: true });
      setPreview(result?.data || result);
      setGenerateStep(3);
    } catch (err) {
      const data = err?.response?.data;
      const firstFieldError = data?.errors ? Object.values(data.errors).flat()[0] : null;
      toast.error('Could not preview', firstFieldError || data?.message || 'The server did not respond. Please try again.');
    } finally { setPreviewing(false); }
  };

  const handleGenerate = async () => {
    const errs = generateErrorsFor();
    setGenerateErrors(errs);
    if (Object.keys(errs).length > 0) return;
    setGenerating(true);
    try {
      const result = await shiftService.generateSchedule(generatePayload());
      await refreshSchedules();
      setIsGenerateModalOpen(false);
      const summary = result?.data || {};
      const parts = [`${summary.created ?? 0} shift${summary.created === 1 ? '' : 's'} created`];
      if (summary.skippedExisting) parts.push(`${summary.skippedExisting} already scheduled`);
      if (summary.skippedHoliday) parts.push(`${summary.skippedHoliday} skipped for holidays`);
      if (summary.skippedOnLeave) parts.push(`${summary.skippedOnLeave} skipped for approved leave`);
      if (summary.coverageShortages?.length) parts.push(`${new Set(summary.coverageShortages.map(c => c.date)).size} day(s) below minimum coverage`);
      toast.success('Schedule Generated', parts.join(' · '));
    } catch (err) {
      const data = err?.response?.data;
      const firstFieldError = data?.errors ? Object.values(data.errors).flat()[0] : null;
      toast.error('Could not generate schedule', firstFieldError || data?.message || 'The server did not respond. Please try again.');
    }
    finally { setGenerating(false); }
  };

  const statsCards = [
    { label: 'Total Assignments', value: stats.total, icon: CalendarDays, color: 'blue' },
    { label: 'Scheduled', value: stats.scheduled, icon: Clock, color: 'amber' },
    { label: 'Working Today', value: stats.today, icon: Check, color: 'emerald' },
    { label: 'Scheduled This Week', value: stats.thisWeek, icon: CalendarDays, color: 'purple' },
  ];
  const colorMap = { blue: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', purple: 'bg-purple-50 text-purple-600' };
  const barMap = { blue: 'bg-blue-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', purple: 'bg-purple-500' };

  const shiftsLoading = loadingShiftDefs || loadingShiftSchedules;

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
              {/* Two doors, two different jobs: the system assigning many people (automated), or you assigning one person by hand. */}
              <Button variant="outline" icon={Bot} onClick={() => setRulesOpen(true)} title="Generate schedules for many people at once, and set the rules for automatic weekly scheduling">Automated Shift Assign</Button>
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

      {/* Generate Schedule — 2-Step Wizard */}
      <Modal isOpen={isGenerateModalOpen} onClose={() => setIsGenerateModalOpen(false)} title="Automated Shift Assign - Generate a schedule" size="xl">
        {/* Step indicator */}
        <div className="flex items-center gap-3 mb-5">
          {[['When & What'], ['Who'], ['Review']].map(([label], idx) => {
            const n = idx + 1;
            const done = generateStep > n;
            const current = generateStep === n;
            return (
              <div key={label} className="flex items-center gap-3 flex-1 last:flex-none">
                <div className={`flex items-center gap-2 ${current ? 'text-blue-600' : done ? 'text-emerald-600' : 'text-gray-400'}`}>
                  <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${current ? 'bg-blue-100 text-blue-700' : done ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>{done ? <Check className="w-3.5 h-3.5" /> : n}</span>
                  <span className="text-sm font-semibold">{label}</span>
                </div>
                {n < 3 && <div className="flex-1 h-px bg-gray-200" />}
              </div>
            );
          })}
        </div>

        {generateStep === 1 && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-3">
              <Zap className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
              <p className="text-sm text-blue-700">Select a shift type, then set the date range. Employees already scheduled or on approved leave are <span className="font-semibold">skipped automatically</span>.</p>
            </div>

            <div>
              <span className="text-[13px] font-semibold text-gray-700 block mb-3">1. Pick a Shift Type</span>
              <div className={`grid gap-3 ${(shiftDefs || []).length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {(shiftDefs || []).map(def => {
                  const Icon = shiftIcons[def.id] || Clock;
                  const isSelected = generateForm.shiftId === def.id;
                  let duration = parseInt(def.endTime) - parseInt(def.startTime);
                  if (duration <= 0) duration += 24;
                  return (
                    <button
                      key={def.id}
                      onClick={() => setGenerateForm(p => ({ ...p, shiftId: def.id }))}
                      className={`relative p-4 rounded-xl border-2 text-left transition-all duration-200 ${isSelected ? 'border-blue-500 bg-blue-50/80 shadow-md shadow-blue-500/10 ring-1 ring-blue-200' : 'border-gray-200 hover:border-gray-300 hover:shadow-sm bg-white'}`}
                    >
                      {isSelected && (
                        <div className="absolute top-3 right-3 w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center">
                          <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />
                        </div>
                      )}
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 transition-all ${isSelected ? 'bg-blue-100' : shiftIconBg[def.id]}`}>
                        <Icon className={`w-6 h-6 transition-all ${isSelected ? 'text-blue-600' : ''}`} />
                      </div>
                      <p className="text-sm font-bold text-gray-900">{def.name}</p>
                      <p className="text-xs text-gray-500 mt-1">{formatTime(def.startTime)} – {formatTime(def.endTime)}</p>
                      <p className="text-[11px] font-medium text-gray-400 mt-1.5">{duration} hours</p>
                    </button>
                  );
                })}
              </div>
              {generateErrors.shiftId && <p className="text-xs text-red-500 mt-1.5">{generateErrors.shiftId}</p>}
            </div>

            <div>
              <span className="text-[13px] font-semibold text-gray-700 block mb-3">2. Set the Date Range</span>
              <div className="flex flex-wrap gap-2 mb-3">
                {[['thisWeek', 'This Week'], ['nextWeek', 'Next Week'], ['thisMonth', 'This Month'], ['nextMonth', 'Next Month']].map(([k, l]) => (
                  <button key={k} onClick={() => setQuickRange(k)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 transition-colors">{l}</button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Input label="Start Date" type="date" value={generateForm.startDate} onChange={e => setGenerateForm({ ...generateForm, startDate: e.target.value })} error={generateErrors.startDate} />
                <Input label="End Date" type="date" min={generateForm.startDate || undefined} value={generateForm.endDate} onChange={e => setGenerateForm({ ...generateForm, endDate: e.target.value })} error={generateErrors.endDate} />
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <input type="checkbox" id="skipWE" checked={generateForm.skipWeekends} onChange={e => setGenerateForm({ ...generateForm, skipWeekends: e.target.checked })} className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500" />
              <label htmlFor="skipWE" className="text-sm text-gray-700 cursor-pointer">Follow each person's work days (usually Monday to Friday - set per department under Automation & rules)</label>
            </div>
          </div>
        )}

        {generateStep === 2 && (
          <div className="space-y-5">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${selectedGenShift ? shiftIconBg[selectedGenShift.id] : 'bg-gray-100 text-gray-400'}`}>
                {selectedGenShift ? (() => { const I = shiftIcons[selectedGenShift.id] || Clock; return <I className="w-5 h-5" />; })() : <Clock className="w-5 h-5" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-gray-900">{selectedGenShift?.name || 'No shift selected'}</p>
                <p className="text-xs text-gray-500">
                  {generateForm.startDate && generateForm.endDate ? `${formatDate(generateForm.startDate)} – ${formatDate(generateForm.endDate)}` : 'No dates set'}
                  {generateForm.skipWeekends ? ' · Following work patterns' : ' · Every day of the week'}
                </p>
              </div>
            </div>

            <div>
              <span className="text-[13px] font-semibold text-gray-700 block mb-2">Choose employees</span>
              <p className="text-xs text-gray-400 mb-3">Pick a department, then a role, then tick the people to schedule. You can repeat this for other departments, and your ticks stay.</p>
              <EmployeePicker mode="multi" employees={employees} value={generateForm.employeeIds} onChange={(ids) => setGenerateForm(p => ({ ...p, employeeIds: ids }))} error={generateErrors.employeeIds} listHeight="max-h-[38vh]" />
              {generateErrors.employeeIds && <p className="text-xs text-red-500 mt-1.5">{generateErrors.employeeIds}</p>}
            </div>

          </div>
        )}

        {generateStep === 3 && preview && (
          <div className="space-y-5">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-5">
              <p className="text-sm font-semibold text-emerald-800 flex items-center gap-2"><Check className="w-4 h-4" /> This is what will happen - nothing has been created yet</p>
              <p className="text-3xl font-bold text-emerald-700 mt-2">{preview.created.toLocaleString()} <span className="text-base font-semibold">shifts</span></p>
              <p className="text-sm text-emerald-700 mt-1">for {preview.employees} employee{preview.employees === 1 ? '' : 's'} · {formatDate(preview.startDate)} – {formatDate(preview.endDate)} · {selectedGenShift?.name}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ['Already scheduled', preview.skippedExisting],
                ['On approved leave', preview.skippedOnLeave],
                ['Holidays', preview.skippedHoliday],
                ['Day off (work pattern)', preview.skippedOffDay],
              ].map(([label, n]) => (
                <div key={label} className="rounded-xl border border-gray-100 bg-white p-3">
                  <p className="text-xl font-bold text-gray-900">{n}</p>
                  <p className="text-[11px] text-gray-500 leading-tight">{label} <span className="text-gray-400">(skipped)</span></p>
                </div>
              ))}
            </div>

            {Object.keys(preview.holidays || {}).length > 0 && (
              <p className="text-xs text-gray-500">Holidays in this range: {Object.entries(preview.holidays).map(([d, n]) => `${formatDate(d)} (${n})`).join(', ')}.</p>
            )}

            {preview.coverageShortages?.length > 0 && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 space-y-2">
                <p className="text-sm font-semibold text-amber-800 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Check before publishing</p>
                <ul className="text-sm text-amber-800 space-y-1 max-h-32 overflow-y-auto">
                  {preview.coverageShortages.map((c) => <li key={`${c.date}-${c.department}`}>• {formatDate(c.date)}: {c.department} would have {c.have} scheduled, needs at least {c.need}</li>)}
                </ul>
              </div>
            )}

            {Object.keys(preview.perDay || {}).length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-700 mb-0.5">Shifts per day</p>
                <p className="text-xs text-gray-400 mb-2.5">How many people get a shift on each day in this range — a quick check the week isn't lopsided.</p>
                <div className="rounded-xl border border-gray-200 max-h-72 overflow-y-auto divide-y divide-gray-100">
                  {(() => {
                    const entries = Object.entries(preview.perDay);
                    const counts = entries.map(([, n]) => n);
                    const max = Math.max(...counts);
                    const min = Math.min(...counts);
                    const flagged = max !== min;
                    return entries.map(([d, n]) => (
                      <div key={d} className="flex items-center justify-between gap-3 px-4 py-3">
                        <span className="text-sm font-medium text-gray-700">
                          {new Date(`${d}T00:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}, {formatDate(d)}
                        </span>
                        <span className="flex items-center gap-2.5">
                          <span className="text-base font-bold text-gray-900">{n} shift{n === 1 ? '' : 's'}</span>
                          {flagged && n === max && <Badge variant="info" size="sm">busiest</Badge>}
                          {flagged && n === min && <Badge variant="default" size="sm">lightest</Badge>}
                        </span>
                      </div>
                    ));
                  })()}
                </div>
              </div>
            )}

            {preview.created === 0 && <p className="text-sm text-gray-500">Nothing would be created: everyone is already scheduled, on leave, or off on those days.</p>}
          </div>
        )}

        <div className="flex justify-between gap-3 mt-6 pt-4 border-t border-gray-100">
          {generateStep > 1 ? (
            <Button variant="outline" onClick={() => setGenerateStep(generateStep - 1)} disabled={generating || previewing}>Back</Button>
          ) : <div />}
          {generateStep === 1 && (
            <Button onClick={() => { const errs = generateErrorsFor(); delete errs.employeeIds; setGenerateErrors(errs); if (Object.keys(errs).length === 0) setGenerateStep(2); }}>Next: choose employees</Button>
          )}
          {generateStep === 2 && (
            <Button onClick={handlePreview} loading={previewing} icon={Search}>Preview{targetCount > 0 ? ` for ${targetCount} employee${targetCount === 1 ? '' : 's'}` : ''}</Button>
          )}
          {generateStep === 3 && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setIsGenerateModalOpen(false)} disabled={generating}>Cancel</Button>
              <Button onClick={handleGenerate} loading={generating} icon={Wand2} disabled={!preview || preview.created === 0}>Publish schedule</Button>
            </div>
          )}
        </div>
      </Modal>

      <ScheduleRulesModal isOpen={rulesOpen} onClose={() => setRulesOpen(false)} employees={employees} shiftDefs={shiftDefs} onChanged={() => refreshSchedules()} onGenerateNow={() => { setRulesOpen(false); openGenerate(); }} />

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
