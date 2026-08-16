import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle, AlertTriangle, TrendingUp,
  CalendarDays, MapPin, Filter, Clock, Plus, XCircle,
} from 'lucide-react';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input, { Textarea } from '../../components/ui/Input';
import { SkeletonCard, SkeletonTable } from '../../components/ui/LoadingSkeleton';
import KpiCard from '../../components/dashboard/KpiCard';
import LiveClock from '../../components/attendance/LiveClock';
import ShiftTimer from '../../components/attendance/ShiftTimer';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useApiData from '../../hooks/useApiData';
import { attendanceService, overtimeService, shiftService } from '../../services/api';
import { formatDate, formatTime, approvedOvertimeHours, extendTime } from '../../utils/helpers';
import { formatHours } from '../../services/attendanceService';

const statusVariant = {
  Present: 'success', Late: 'warning', Absent: 'danger',
  'Half Day': 'info', 'On Leave': 'default',
};

const overtimeStatusVariant = {
  Pending: 'warning', Approved: 'success', Rejected: 'danger', Cancelled: 'default',
};

const TODAY = new Date().toISOString().split('T')[0];

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export default function MyAttendance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const employeeId = user?.id || 'EMP001';

  const { data: records, loading } = useApiData(
    () => attendanceService.getByEmployeeId(employeeId),
    [employeeId]
  );
  const [periodFilter, setPeriodFilter] = useState('All');
  const [activeTab, setActiveTab] = useState('attendance');
  const [todayShift, setTodayShift] = useState(null);

  const {
    data: overtimeRequests,
    loading: loadingOvertime,
    refresh: refreshOvertime,
  } = useApiData(() => overtimeService.getByEmployeeId(employeeId), [employeeId]);

  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({ date: '', expectedHours: '', reason: '' });
  const [requestErrors, setRequestErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const myOvertimeRequests = useMemo(
    () => [...(overtimeRequests || [])].sort((a, b) => b.requestedDate.localeCompare(a.requestedDate)),
    [overtimeRequests]
  );

  const todayKey = toDateKey(new Date());

  const activeAttendance = useMemo(
    () => records?.find((a) => a.date === todayKey && a.clockIn && !a.clockOut) || null,
    [records, todayKey]
  );

  const approvedOtHours = useMemo(
    () => approvedOvertimeHours(overtimeRequests, todayKey),
    [overtimeRequests, todayKey]
  );

  const effectiveShiftEnd = useMemo(
    () => extendTime(todayShift?.endTime || '17:00', approvedOtHours) || '17:00',
    [todayShift, approvedOtHours]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [schedule, shifts] = await Promise.all([
          shiftService.getScheduleByEmployeeId(employeeId),
          shiftService.getAllShifts(),
        ]);
        if (cancelled) return;
        const todays = (schedule || []).find((s) => s.date === todayKey);
        if (!todays) return;
        const def = (shifts || []).find((s) => s.id === todays.shiftId);
        setTodayShift(def ? { name: def.name, startTime: def.startTime, endTime: def.endTime } : null);
      } catch {
        if (!cancelled) setTodayShift(null);
      }
    })();
    return () => { cancelled = true; };
  }, [employeeId, todayKey]);

  const openRequestModal = () => {
    setRequestForm({ date: '', expectedHours: '', reason: '' });
    setRequestErrors({});
    setIsRequestModalOpen(true);
  };

  const handleSubmitRequest = async () => {
    const errs = {};
    if (!requestForm.date) errs.date = 'Required';
    if (!requestForm.reason.trim()) errs.reason = 'Required';
    if (requestForm.expectedHours && (Number(requestForm.expectedHours) <= 0 || Number(requestForm.expectedHours) > 24)) {
      errs.expectedHours = 'Enter a value between 0 and 24';
    }
    setRequestErrors(errs);
    if (Object.keys(errs).length > 0) return;

    const employeeName = `${user?.firstName || ''} ${user?.lastName || ''}`.trim();
    setSubmitting(true);
    try {
      await overtimeService.create({
        employeeId,
        employeeName,
        date: requestForm.date,
        expectedHours: requestForm.expectedHours ? Number(requestForm.expectedHours) : null,
        reason: requestForm.reason,
        status: 'Pending',
        requestedDate: TODAY,
      });
      await refreshOvertime();
      setIsRequestModalOpen(false);
      toast.success('Overtime Requested', 'Your request has been sent to HR for approval.');
    } catch {
      toast.error('Error', 'Failed to submit overtime request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelOvertime = async (request) => {
    try {
      await overtimeService.updateStatus(request.id, 'Cancelled');
      await refreshOvertime();
      toast.success('Request Cancelled', 'Your overtime request was withdrawn.');
    } catch {
      toast.error('Error', 'Failed to cancel overtime request.');
    }
  };

  const myAttendance = useMemo(
    () => [...(records || [])].sort((a, b) => b.date.localeCompare(a.date)),
    [records]
  );

  const filtered = useMemo(() => {
    if (periodFilter === 'All') return myAttendance;
    const today = new Date();
    return myAttendance.filter((a) => {
      const d = new Date(a.date);
      if (periodFilter === 'This Week') {
        const dayOfWeek = today.getDay();
        const weekStart = new Date(today);
        weekStart.setDate(today.getDate() - dayOfWeek);
        weekStart.setHours(0, 0, 0, 0);
        return d >= weekStart && d <= today;
      }
      if (periodFilter === 'This Month') {
        return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
      }
      return true;
    });
  }, [myAttendance, periodFilter]);

  const presentCount = filtered.filter((a) => a.status === 'Present').length;
  const lateCount = filtered.filter((a) => a.status === 'Late').length;
  const totalWorkingDays = filtered.filter((a) => a.status === 'Present' || a.status === 'Late').length;
  const attendanceRate = filtered.length ? Math.round((totalWorkingDays / filtered.length) * 100) : 0;

  const totalHoursWorked = useMemo(() => {
    return filtered.reduce((sum, a) => sum + (a.totalHours || 0), 0);
  }, [filtered]);

  return loading ? (
    <div className="max-w-7xl mx-auto space-y-6">
      <SkeletonCard lines={2} />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <SkeletonCard lines={1} />
        <SkeletonCard lines={1} />
        <SkeletonCard lines={1} />
      </div>
      <SkeletonTable rows={6} cols={5} />
    </div>
  ) : (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Attendance</h1>
          <p className="text-[14px] text-gray-500 mt-1">Track your attendance and working hours</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm">
            <CalendarDays className="w-4 h-4 text-gray-400" />
            <span className="font-medium">{formatDate(new Date().toISOString())}</span>
          </div>
          <LiveClock />
        </div>
      </div>

      {/* Shift Timer */}
      <ShiftTimer
        activeAttendance={activeAttendance}
        shiftStartTime={todayShift?.startTime || '08:00'}
        shiftEndTime={effectiveShiftEnd}
        shiftName={todayShift?.name || ''}
        overtimeHours={approvedOtHours}
      />

      {/* Attendance / Overtime tabs */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl w-fit">
        {[
          { key: 'attendance', label: 'Attendance History' },
          { key: 'overtime', label: 'Overtime Requests' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 text-[13px] font-semibold rounded-lg transition-colors ${
              activeTab === tab.key
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'attendance' ? (
        <>
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <KpiCard label="Days Present" value={presentCount} icon={CheckCircle} accent="emerald" />
        <KpiCard label="Days Late" value={lateCount} icon={AlertTriangle} accent="amber" />
        <KpiCard label="Attendance Rate" value={`${attendanceRate}%`} icon={TrendingUp} accent="blue" />
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[13px] font-medium text-gray-400">Total Hours Worked</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{formatHours(totalHoursWorked)}h</p>
        </div>
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
          <p className="text-[13px] font-medium text-gray-400">Total Working Days</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{totalWorkingDays} days</p>
        </div>
      </div>

        </>
      ) : (
        <>
          {/* My Overtime Requests */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 pb-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <h3 className="text-[15px] font-semibold text-gray-900">My Overtime Requests</h3>
            <p className="text-xs text-gray-500 mt-0.5">Request overtime ahead of time and track approval status</p>
          </div>
          <Button size="sm" icon={Plus} onClick={openRequestModal}>Request Overtime</Button>
        </div>
        {loadingOvertime ? (
          <div className="px-6 pb-6"><SkeletonTable rows={2} cols={5} /></div>
        ) : myOvertimeRequests.length === 0 ? (
          <div className="px-6 pb-8 text-center">
            <p className="text-sm text-gray-400">No overtime requests yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-t border-b border-gray-100">
                  {['Date', 'Expected Hours', 'Reason', 'Status', ''].map((h) => (
                    <th key={h} className="px-6 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {myOvertimeRequests.map((req) => (
                  <tr key={req.id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-3.5 text-sm text-gray-900 font-medium whitespace-nowrap">{formatDate(req.date)}</td>
                    <td className="px-6 py-3.5 text-sm text-gray-700 whitespace-nowrap">
                      {req.status === 'Approved' && req.approvedHours != null
                        ? <span className="text-emerald-700 font-medium">{formatHours(req.approvedHours)}h approved</span>
                        : req.expectedHours ? `${formatHours(req.expectedHours)}h` : '—'}
                    </td>
                    <td className="px-6 py-3.5 text-sm text-gray-600 max-w-xs truncate">{req.reason}</td>
                    <td className="px-6 py-3.5">
                      <Badge variant={overtimeStatusVariant[req.status] || 'default'} dot size="xs">{req.status}</Badge>
                      {req.status === 'Approved' && (() => {
                        const actual = records?.find(a => a.employeeId === employeeId && a.date === req.date)?.overtime || 0;
                        const approvedH = req.approvedHours != null ? req.approvedHours : (req.expectedHours || 0);
                        if (actual > approvedH) {
                          return <p className="text-xs text-amber-600 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Exceeded by {formatHours(actual - approvedH)}h</p>;
                        }
                        if (actual > 0) {
                          return <p className="text-xs text-emerald-600 mt-1">Clocked {formatHours(actual)}h</p>;
                        }
                        return <p className="text-xs text-gray-400 mt-1">Not clocked yet</p>;
                      })()}
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {req.status === 'Pending' && (
                        <button
                          onClick={() => handleCancelOvertime(req)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-500 hover:text-red-600 transition-colors"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
        </>
      )}

      {activeTab === 'attendance' ? (
        <>
          {/* Attendance History */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-[560px] flex flex-col overflow-hidden">
        <div className="p-6 pb-4 flex-shrink-0">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-[15px] font-semibold text-gray-900">Attendance History</h3>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-400" />
              {['All', 'This Week', 'This Month'].map((period) => (
                <button
                  key={period}
                  onClick={() => setPeriodFilter(period)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    periodFilter === period
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
                  }`}
                >
                  {period}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100">
                {['Date', 'Day', 'Clock In', 'Clock Out', 'Regular Hours', 'Overtime', 'Total Hours', 'Status', 'Location'].map((h) => (
                  <th key={h} className="sticky top-0 z-10 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider bg-gray-50">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-4 py-12 text-center text-gray-400 text-sm">
                    No attendance records found
                  </td>
                </tr>
              ) : (
                filtered.map((a) => {
                  const dayName = new Date(a.date).toLocaleDateString('en-US', { weekday: 'short' });
                  const inProgress = a.clockIn && !a.clockOut;
                  const finalized = a.clockIn && a.clockOut;
                  return (
                    <tr key={a.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-4 py-4 text-sm text-gray-900 font-medium">{formatDate(a.date)}</td>
                      <td className="px-4 py-4 text-sm text-gray-500">{dayName}</td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {a.clockIn ? formatTime(a.clockIn) : <span className="text-gray-400">Not Clocked In</span>}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {a.clockOut ? (
                          formatTime(a.clockOut)
                        ) : inProgress ? (
                          <span className="text-amber-500 italic">In Progress</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700 font-medium">
                        {finalized ? (
                          `${formatHours(a.regularHours)}h`
                        ) : inProgress ? (
                          <span className="text-amber-500 italic">In Progress</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-700">
                        {finalized ? (
                          a.overtime > 0 ? (
                            <span className="text-blue-600 font-medium">+{formatHours(a.overtime)}h</span>
                          ) : (
                            <span className="text-gray-400">No Overtime</span>
                          )
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900 font-semibold">
                        {finalized ? (
                          `${formatHours(a.totalHours)}h`
                        ) : inProgress ? (
                          <span className="text-amber-500 italic">In Progress</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <Badge variant={statusVariant[a.status]} dot size="xs">{a.status}</Badge>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex items-center gap-1.5 text-sm text-gray-600">
                          <MapPin className="w-3.5 h-3.5 text-gray-400" />
                          {a.location}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
        </>
      ) : null}

      <Modal isOpen={isRequestModalOpen} onClose={() => setIsRequestModalOpen(false)} title="Request Overtime" size="md">
        <div className="space-y-4">
          <Input
            label="Date"
            type="date"
            min={TODAY}
            value={requestForm.date}
            onChange={e => setRequestForm({ ...requestForm, date: e.target.value })}
            error={requestErrors.date}
          />
          <Input
            label="Expected Hours (optional)"
            type="number"
            min="0"
            max="24"
            step="0.5"
            placeholder="e.g. 2"
            value={requestForm.expectedHours}
            onChange={e => setRequestForm({ ...requestForm, expectedHours: e.target.value })}
            error={requestErrors.expectedHours}
          />
          <Textarea
            label="Reason"
            rows={3}
            placeholder="Why is overtime needed?"
            value={requestForm.reason}
            onChange={e => setRequestForm({ ...requestForm, reason: e.target.value })}
            error={requestErrors.reason}
          />
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
          <Button variant="outline" onClick={() => setIsRequestModalOpen(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={handleSubmitRequest} loading={submitting} icon={Clock}>Submit Request</Button>
        </div>
      </Modal>
    </div>
  );
}