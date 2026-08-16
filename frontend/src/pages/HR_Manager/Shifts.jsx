import { useState, useMemo, useEffect } from 'react';
import {
  CalendarDays, Plus, Clock, Edit, ArrowLeftRight, Check,
  Zap, Search, FilterX, Wand2, Trash2, AlertTriangle
} from 'lucide-react';
import Card, { CardTitle, CardDescription } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import Modal from '../../components/ui/Modal';
import Input, { Select, Textarea } from '../../components/ui/Input';
import { SkeletonCard, SkeletonTable } from '../../components/ui/LoadingSkeleton';
import { employeeService, shiftService } from '../../services/api';
import { formatDate, formatTime } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import useApiData from '../../hooks/useApiData';

const shiftIconColors = {
  SHIFT001: 'text-emerald-600 bg-emerald-50',
  SHIFT002: 'text-amber-600 bg-amber-50',
  SHIFT003: 'text-violet-600 bg-violet-50',
  SHIFT004: 'text-blue-600 bg-blue-50',
};
const shiftBadgeVariant = { SHIFT001: 'success', SHIFT002: 'warning', SHIFT003: 'purple', SHIFT004: 'primary' };
const statusVariant = { Scheduled: 'primary', Completed: 'success', Swapped: 'purple', Cancelled: 'danger' };
const STATUS_OPTIONS = ['Scheduled', 'Completed', 'Swapped', 'Cancelled'];

const toDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const startOfWeek = (d) => addDays(d, -((d.getDay() + 6) % 7));
const countWorkdays = (start, end, skipWeekends) => {
  if (!start || !end || end < start) return 0;
  let count = 0;
  const d = new Date(`${start}T00:00:00`);
  const last = new Date(`${end}T00:00:00`);
  while (d <= last) {
    const dow = d.getDay();
    if (!skipWeekends || (dow !== 0 && dow !== 6)) count += 1;
    d.setDate(d.getDate() + 1);
  }
  return count;
};

export default function Shifts() {
  const [employees, setEmployees] = useState([]);
  const { toast } = useToast();
  const {
    data: shiftDefs,
    loading: loadingDefs,
  } = useApiData(() => shiftService.getAllShifts(), []);
  const {
    data: shiftSchedules,
    loading: loadingSchedules,
    refresh: refreshSchedules,
  } = useApiData(() => shiftService.getSchedules(), []);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null);
  const [formData, setFormData] = useState({ employeeId: '', shiftId: '', date: '', notes: '' });
  const [formErrors, setFormErrors] = useState({});
  const [searchQuery, setSearchQuery] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [generateSearch, setGenerateSearch] = useState('');

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [generateForm, setGenerateForm] = useState({
    startDate: '', endDate: '', shiftId: '', skipWeekends: true, allActive: true, employeeIds: [],
  });
  const [generateErrors, setGenerateErrors] = useState({});
  const [generating, setGenerating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    employeeService.getAll()
      .then(setEmployees)
      .catch(() => setEmployees([]));
  }, []);

  const allSchedules = useMemo(() => {
    return [...(shiftSchedules || [])].sort((a, b) => b.date.localeCompare(a.date));
  }, [shiftSchedules]);

  const stats = useMemo(() => {
    const total = (shiftSchedules || []).length;
    const scheduled = (shiftSchedules || []).filter(s => s.status === 'Scheduled').length;
    const completed = (shiftSchedules || []).filter(s => s.status === 'Completed').length;
    const swapped = (shiftSchedules || []).filter(s => s.status === 'Swapped').length;
    return { total, scheduled, completed, swapped };
  }, [shiftSchedules]);

  const departments = useMemo(() => {
    return [...new Set(employees.map(e => e.department).filter(Boolean))].sort();
  }, [employees]);

  const standardShift = useMemo(() => {
    const defs = shiftDefs || [];
    return (
      defs.find((s) => s.startTime === '08:00' && s.endTime === '17:00') ||
      defs.find((s) => s.id === 'SHIFT004') ||
      defs[0] ||
      null
    );
  }, [shiftDefs]);

  const filteredSchedules = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return allSchedules.filter((s) => {
      const emp = employees.find((e) => e.id === s.employeeId);
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

  const hasActiveFilters = Boolean(searchQuery || departmentFilter || dateFilter || statusFilter);

  const clearFilters = () => {
    setSearchQuery('');
    setDepartmentFilter('');
    setDateFilter('');
    setStatusFilter('');
  };

  const openAdd = () => {
    setEditingSchedule(null);
    setFormData({ employeeId: '', shiftId: standardShift?.id || '', date: '', notes: '' });
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
    } finally {
      setDeleting(false);
    }
  };

  const openEdit = (schedule) => {
    setEditingSchedule(schedule);
    setFormData({ employeeId: schedule.employeeId, shiftId: schedule.shiftId, date: schedule.date, notes: '' });
    setFormErrors({});
    setIsModalOpen(true);
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

    const employee = employees.find((e) => e.id === formData.employeeId);
    const employeeName = employee ? `${employee.firstName} ${employee.lastName}` : '';
    const payload = {
      employeeId: formData.employeeId,
      employeeName,
      shiftId: formData.shiftId,
      date: formData.date,
      notes: formData.notes,
      status: 'Scheduled',
    };

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
    } catch {
      toast.error('Error', 'Failed to save schedule.');
    }

    setIsModalOpen(false);
  };

  const openGenerate = () => {
    setGenerateSearch('');
    setGenerateForm({
      startDate: '', endDate: '', shiftId: standardShift?.id || '',
      skipWeekends: true, allActive: true, employeeIds: [],
    });
    setGenerateErrors({});
    setIsGenerateModalOpen(true);
  };

  const toggleGenerateEmployee = (employeeId) => {
    setGenerateForm((prev) => ({
      ...prev,
      employeeIds: prev.employeeIds.includes(employeeId)
        ? prev.employeeIds.filter((id) => id !== employeeId)
        : [...prev.employeeIds, employeeId],
    }));
  };

  const setQuickRange = (type) => {
    const now = new Date();
    const monday = startOfWeek(now);
    if (type === 'thisWeek') {
      setGenerateForm((prev) => ({ ...prev, startDate: toDateKey(monday), endDate: toDateKey(addDays(monday, 4)) }));
    } else if (type === 'nextWeek') {
      setGenerateForm((prev) => ({ ...prev, startDate: toDateKey(addDays(monday, 7)), endDate: toDateKey(addDays(monday, 11)) }));
    } else {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      setGenerateForm((prev) => ({ ...prev, startDate: toDateKey(first), endDate: toDateKey(last) }));
    }
  };

  const filteredGenerateEmployees = useMemo(() => {
    const q = generateSearch.trim().toLowerCase();
    return employees.filter(
      (e) => !q || `${e.firstName} ${e.lastName} ${e.department}`.toLowerCase().includes(q)
    );
  }, [employees, generateSearch]);

  const allFilteredSelected = filteredGenerateEmployees.length > 0
    && filteredGenerateEmployees.every((e) => generateForm.employeeIds.includes(e.id));

  const toggleSelectAll = () => {
    setGenerateForm((prev) => {
      const ids = allFilteredSelected
        ? prev.employeeIds.filter((id) => !filteredGenerateEmployees.some((e) => e.id === id))
        : [...new Set([...prev.employeeIds, ...filteredGenerateEmployees.map((e) => e.id)])];
      return { ...prev, employeeIds: ids };
    });
  };

  const workdayCount = countWorkdays(generateForm.startDate, generateForm.endDate, generateForm.skipWeekends);
  const targetCount = generateForm.allActive
    ? employees.filter((e) => e.status === 'Active').length
    : generateForm.employeeIds.length;
  const estimate = workdayCount * targetCount;

  const selectedEmployee = employees.find((e) => e.id === formData.employeeId);

  const deleteEmpName = deleteTarget
    ? (() => {
        const emp = employees.find((e) => e.id === deleteTarget.employeeId);
        return emp ? `${emp.firstName} ${emp.lastName}` : deleteTarget.employeeName;
      })()
    : '';

  const handleGenerate = async () => {
    const errs = {};
    if (!generateForm.startDate) errs.startDate = 'Required';
    if (!generateForm.endDate) errs.endDate = 'Required';
    if (generateForm.startDate && generateForm.endDate && generateForm.endDate < generateForm.startDate) {
      errs.endDate = 'Must be on or after the start date';
    }
    if (!generateForm.shiftId) errs.shiftId = 'Required';
    if (!generateForm.allActive && generateForm.employeeIds.length === 0) errs.employeeIds = 'Select at least one employee';
    setGenerateErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setGenerating(true);
    try {
      const payload = {
        startDate: generateForm.startDate,
        endDate: generateForm.endDate,
        shiftId: generateForm.shiftId,
        skipWeekends: generateForm.skipWeekends,
        ...(generateForm.allActive ? {} : { employeeIds: generateForm.employeeIds }),
      };
      const result = await shiftService.generateSchedule(payload);
      await refreshSchedules();
      setIsGenerateModalOpen(false);

      const summary = result?.data || {};
      const parts = [`${summary.created ?? 0} shift${summary.created === 1 ? '' : 's'} created`];
      if (summary.skippedExisting) parts.push(`${summary.skippedExisting} already scheduled`);
      if (summary.skippedOnLeave) parts.push(`${summary.skippedOnLeave} skipped for approved leave`);
      if (summary.shortageDates?.length) parts.push(`${summary.shortageDates.length} day(s) flagged for possible staffing shortage`);
      toast.success('Schedule Generated', parts.join(' · '));
    } catch {
      toast.error('Error', 'Failed to generate schedule.');
    } finally {
      setGenerating(false);
    }
  };

  const statsCards = [
    { label: 'Total Assignments', value: stats.total, icon: CalendarDays, color: 'blue' },
    { label: 'Scheduled', value: stats.scheduled, icon: Clock, color: 'amber' },
    { label: 'Completed', value: stats.completed, icon: Check, color: 'emerald' },
    { label: 'Swapped', value: stats.swapped, icon: ArrowLeftRight, color: 'purple' },
  ];
  const colorMap = { blue: 'bg-blue-50 text-blue-600', emerald: 'bg-emerald-50 text-emerald-600', amber: 'bg-amber-50 text-amber-600', purple: 'bg-purple-50 text-purple-600' };
  const barMap = { blue: 'bg-blue-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', purple: 'bg-purple-500' };

  const loading = loadingDefs || loadingSchedules;

  if (loading) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </div>
        <SkeletonTable rows={8} cols={6} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Shift & Schedule Management</h1>
          <p className="text-[14px] text-gray-500 mt-1">Create and manage employee shifts and schedules</p>
        </div>
      </div>

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

      {/* Schedule Management */}
      <Card padding={false} className="h-[560px] flex flex-col overflow-hidden">
        <div className="p-6 pb-4 flex-shrink-0">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle>Schedule Management</CardTitle>
              <CardDescription>Assign, review, and manage employee schedules</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" icon={Wand2} onClick={openGenerate}>Generate Schedule</Button>
              <Button icon={Plus} onClick={openAdd}>Assign Schedule</Button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mt-5">
            <div className="sm:col-span-2">
              <Input icon={Search} placeholder="Search employee name or ID..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
            </div>
            <Select value={departmentFilter} onChange={e => setDepartmentFilter(e.target.value)}>
              <option value="">All Departments</option>
              {departments.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </Select>
            <Input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} />
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All Statuses</option>
              {STATUS_OPTIONS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </Select>
          </div>

          <div className="flex items-center justify-between gap-3 mt-4 flex-wrap">
            <p className="text-sm text-gray-500">
              Showing <span className="font-semibold text-gray-700">{filteredSchedules.length}</span> of {allSchedules.length} schedules
            </p>
            {hasActiveFilters && (
              <button onClick={clearFilters} className="inline-flex items-center gap-1 text-xs font-semibold text-gray-500 hover:text-gray-700 transition-colors">
                <FilterX className="w-3.5 h-3.5" />
                Clear Filters
              </button>
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr>
                {['Employee Name', 'Department', 'Shift Type', 'Date', 'Start Time', 'End Time', 'Schedule Status', 'Actions'].map(h => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky top-0 z-10 bg-gray-50 border-b border-gray-100">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filteredSchedules.map(schedule => {
                const emp = employees.find(e => e.id === schedule.employeeId);
                const shiftDef = (shiftDefs || []).find(s => s.id === schedule.shiftId);
                const empName = emp ? `${emp.firstName} ${emp.lastName}` : schedule.employeeName;
                return (
                  <tr key={schedule.id} className="hover:bg-gray-50/50 transition-colors">
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
                      <Badge variant={shiftBadgeVariant[schedule.shiftId]} size="xs">
                        {shiftDef?.name || 'Unknown'}
                      </Badge>
                    </td>
                    <td className="px-6 py-3.5 text-sm text-gray-700 whitespace-nowrap">{formatDate(schedule.date)}</td>
                    <td className="px-6 py-3.5 text-sm text-gray-700 whitespace-nowrap">{shiftDef ? formatTime(shiftDef.startTime) : '—'}</td>
                    <td className="px-6 py-3.5 text-sm text-gray-700 whitespace-nowrap">{shiftDef ? formatTime(shiftDef.endTime) : '—'}</td>
                    <td className="px-6 py-3.5">
                      <Badge variant={statusVariant[schedule.status] || 'default'} dot size="xs">{schedule.status}</Badge>
                    </td>
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => openEdit(schedule)} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-amber-600 transition-colors" title="Edit assignment">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => openDeleteSchedule(schedule)} className="p-1.5 rounded-lg hover:bg-red-50 text-gray-400 hover:text-red-600 transition-colors" title="Delete assignment">
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
              <p className="text-sm font-medium text-gray-500">No schedules found</p>
              <p className="text-xs text-gray-400 mt-1">Try adjusting your filters or assign a new schedule.</p>
            </div>
          )}
        </div>
      </Card>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title={editingSchedule ? 'Edit Shift Assignment' : 'Assign Schedule'} size="md">
        <div className="space-y-5">
          <div>
            <Select label="Employee" value={formData.employeeId} onChange={e => setFormData({ ...formData, employeeId: e.target.value })} error={formErrors.employeeId}>
              <option value="">Select Employee</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.firstName} {emp.lastName} - {emp.department}</option>
              ))}
            </Select>
            {selectedEmployee && (
              <div className="mt-3 flex items-center gap-3 px-4 py-3 bg-gray-50 rounded-xl">
                <Avatar firstName={selectedEmployee.firstName} lastName={selectedEmployee.lastName} size="md" src={selectedEmployee.avatar} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{selectedEmployee.firstName} {selectedEmployee.lastName}</p>
                  <p className="text-xs text-gray-500">{selectedEmployee.department} · {selectedEmployee.position}</p>
                </div>
                <Badge variant="success" size="xs">{selectedEmployee.status}</Badge>
              </div>
            )}
          </div>

          <div>
            <span className="text-[13px] font-medium text-gray-700 block mb-1.5">Working Hours</span>
            {standardShift ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-blue-100 bg-blue-50/60">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${shiftIconColors[standardShift.id] || 'text-blue-600 bg-blue-50'}`}>
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
            ) : (
              <p className="text-xs text-gray-400">No shift definition available.</p>
            )}
            <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1">
              <Clock className="w-3 h-3" />
              Hours worked beyond {standardShift ? formatTime(standardShift.endTime) : '5:00 PM'} are tracked as overtime.
            </p>
          </div>

          <div>
            <Input label="Date" type="date" value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} error={formErrors.date} />
            {formData.date && (
              <p className="text-xs text-gray-400 mt-1.5">
                {new Date(`${formData.date}T00:00:00`).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            )}
          </div>

          <Textarea label="Notes" value={formData.notes} onChange={e => setFormData({ ...formData, notes: e.target.value })} placeholder="Optional notes about this assignment..." rows={2} />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
          <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
          <Button onClick={handleSave}>{editingSchedule ? 'Save Changes' : 'Assign Schedule'}</Button>
        </div>
      </Modal>

      <Modal isOpen={isGenerateModalOpen} onClose={() => setIsGenerateModalOpen(false)} title="Generate Schedule" size="lg">
        <div className="space-y-5">
          <p className="text-sm text-gray-500">
            Bulk-create schedules across a date range instead of adding them one by one. Employees already
            scheduled on a given day, or on approved leave that day, are skipped automatically.
          </p>

          <div>
            <span className="text-[13px] font-medium text-gray-700 block mb-2">Date Range</span>
            <div className="flex flex-wrap gap-2 mb-3">
              <button onClick={() => setQuickRange('thisWeek')} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 transition-colors">
                This Week
              </button>
              <button onClick={() => setQuickRange('nextWeek')} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 transition-colors">
                Next Week
              </button>
              <button onClick={() => setQuickRange('thisMonth')} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 transition-colors">
                This Month
              </button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Input label="Start Date" type="date" value={generateForm.startDate} onChange={e => setGenerateForm({ ...generateForm, startDate: e.target.value })} error={generateErrors.startDate} />
              <Input label="End Date" type="date" min={generateForm.startDate || undefined} value={generateForm.endDate} onChange={e => setGenerateForm({ ...generateForm, endDate: e.target.value })} error={generateErrors.endDate} />
            </div>
          </div>

          <div>
            <span className="text-[13px] font-medium text-gray-700 block mb-1.5">Working Hours</span>
            {standardShift ? (
              <div className="flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-blue-100 bg-blue-50/60">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${shiftIconColors[standardShift.id] || 'text-blue-600 bg-blue-50'}`}>
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
            ) : (
              <p className="text-xs text-gray-400">No shift definition available.</p>
            )}
          </div>

          <label className="flex items-center gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={generateForm.skipWeekends}
              onChange={e => setGenerateForm({ ...generateForm, skipWeekends: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Skip Saturdays and Sundays</span>
          </label>

          <div>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={generateForm.allActive}
                  onChange={e => setGenerateForm({ ...generateForm, allActive: e.target.checked })}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm text-gray-700">Include all active employees</span>
              </label>
              <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2.5 py-1">
                {generateForm.allActive
                  ? `${employees.filter((e) => e.status === 'Active').length} selected`
                  : `${generateForm.employeeIds.length} selected`}
              </span>
            </div>

            {!generateForm.allActive && (
              <div className="mt-3 border border-gray-200 rounded-xl">
                <div className="p-2.5 border-b border-gray-100 flex items-center gap-2">
                  <Input icon={Search} placeholder="Search employees..." value={generateSearch} onChange={e => setGenerateSearch(e.target.value)} className="py-2" />
                  <label className="flex items-center gap-1.5 px-2 cursor-pointer whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={allFilteredSelected}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-xs font-medium text-gray-600">Select all</span>
                  </label>
                </div>
                <div className="max-h-44 overflow-y-auto divide-y divide-gray-50">
                  {filteredGenerateEmployees.map(emp => (
                    <label key={emp.id} className="flex items-center gap-2.5 px-3 py-2 cursor-pointer hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={generateForm.employeeIds.includes(emp.id)}
                        onChange={() => toggleGenerateEmployee(emp.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <Avatar firstName={emp.firstName} lastName={emp.lastName} size="xs" src={emp.avatar} />
                      <span className="text-sm text-gray-700">{emp.firstName} {emp.lastName} <span className="text-gray-400">— {emp.department}</span></span>
                    </label>
                  ))}
                  {filteredGenerateEmployees.length === 0 && (
                    <p className="px-3 py-4 text-xs text-gray-400 text-center">No employees found.</p>
                  )}
                </div>
              </div>
            )}
            {generateErrors.employeeIds && <p className="text-xs text-red-500 mt-1.5">{generateErrors.employeeIds}</p>}
          </div>

          {estimate > 0 && (
            <div className="flex items-center justify-between px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-100">
              <p className="text-sm text-emerald-700">
                <span className="font-semibold">≈ {estimate.toLocaleString()} schedules</span> across {workdayCount} working day{workdayCount === 1 ? '' : 's'}
              </p>
              <Check className="w-4 h-4 text-emerald-600" />
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
          <Button variant="outline" onClick={() => setIsGenerateModalOpen(false)} disabled={generating}>Cancel</Button>
          <Button onClick={handleGenerate} loading={generating} icon={Wand2}>Generate</Button>
        </div>
      </Modal>

      <Modal isOpen={!!deleteTarget} onClose={closeDeleteSchedule} title="Delete Shift Assignment" size="sm">
        {deleteTarget && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-gray-700">
                  Are you sure you want to remove{' '}
                  <span className="font-semibold text-gray-900">{deleteEmpName}</span>{' '}
                  from the{' '}
                  <span className="font-semibold text-gray-900">{formatDate(deleteTarget.date)}</span>{' '}
                  schedule?
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  The employee will no longer be scheduled for this day. This action cannot be undone.
                </p>
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
