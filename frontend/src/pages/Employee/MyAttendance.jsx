import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CheckCircle, AlertTriangle, TrendingUp,
  CalendarDays, MapPin, Filter, Clock, Plus, XCircle, Pencil, LogOut, Download, Printer,
} from 'lucide-react';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Input, { Select, Textarea } from '../../components/ui/Input';
import { SkeletonTable } from '../../components/ui/LoadingSkeleton';
import KpiCard from '../../components/dashboard/KpiCard';
import LiveClock from '../../components/attendance/LiveClock';
import ShiftTimer from '../../components/attendance/ShiftTimer';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import useApiData from '../../hooks/useApiData';
import { attendanceService, overtimeService, shiftService } from '../../services/api';
import { formatDate, formatTime, approvedOvertimeHours, extendTime } from '../../utils/helpers';
import { formatHours } from '../../services/attendanceService';
import { downloadCsv, printElementAsPdf } from '../../utils/export';
import {
  EARLY_CLOCKOUT_REASON_OPTIONS,
  EARLY_CLOCKOUT_REASON_LABELS,
  EARLY_CLOCKOUT_CLASSIFICATION_META,
  EARLY_CLOCKOUT_REASON_STATUS_META,
} from '../../utils/constants';

const statusVariant = {
  Present: 'success', Late: 'warning', Absent: 'danger',
  'Half Day': 'info', 'Early Leave': 'amber', 'On Leave': 'default',
};

const overtimeStatusVariant = {
  Pending: 'warning', Approved: 'success', Rejected: 'danger', Cancelled: 'default',
};

// Local (browser) calendar dates - toISOString() is UTC and gives the wrong day in the early morning.
const localDateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const TODAY = localDateKey(new Date());
// Overtime can be requested for a day already worked (up to a week back) - HR can approve it afterwards.
const OT_EARLIEST = localDateKey(new Date(Date.now() - 7 * 86400000));

function toDateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatMinutesShort(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  return h > 0 ? `${h}h` : `${m}m`;
}

export default function MyAttendance() {
  const { user } = useAuth();
  const { toast } = useToast();
  const employeeId = user?.id || 'EMP001';
  const printRef = useRef(null);

  const { data: records } = useApiData(
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

  const {
    data: earlyOutRecords,
    loading: loadingEarlyOuts,
    refresh: refreshEarlyOuts,
  } = useApiData(() => attendanceService.getEarlyClockOutsByEmployee(employeeId), [employeeId]);

  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({ date: '', expectedHours: '', reason: '' });
  const [requestErrors, setRequestErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  const [editingEarly, setEditingEarly] = useState(null);
  const [earlyReasonForm, setEarlyReasonForm] = useState({ reasonCode: '', reasonNote: '' });
  const [earlyProof, setEarlyProof] = useState(null); // { name, dataUrl } chosen in the modal
  const [earlyProofError, setEarlyProofError] = useState('');
  const [savingEarly, setSavingEarly] = useState(false);

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

  const openEarlyReasonModal = (record) => {
    setEarlyReasonForm({
      reasonCode: record.reasonCode || '',
      reasonNote: record.reasonNote || '',
    });
    setEarlyProof(null);
    setEarlyProofError('');
    setEditingEarly(record);
  };

  const MAX_EARLY_PROOF_SIZE = 5 * 1024 * 1024; // 5MB
  const handleEarlyProofSelect = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setEarlyProofError('');
    if (file.size > MAX_EARLY_PROOF_SIZE) {
      setEarlyProofError('File is too large. Maximum size is 5MB.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setEarlyProof({ name: file.name, dataUrl: reader.result });
    reader.onerror = () => setEarlyProofError('Could not read that file. Please try again.');
    reader.readAsDataURL(file);
  };

  const handleSaveEarlyReason = async () => {
    if (!editingEarly) return;
    setSavingEarly(true);
    try {
      await attendanceService.updateEarlyClockOutReason(editingEarly.id, {
        reasonCode: earlyReasonForm.reasonCode || undefined,
        reasonNote: earlyReasonForm.reasonNote.trim() || undefined,
        ...(earlyProof ? { proof: [earlyProof] } : {}),
      });
      await refreshEarlyOuts();
      setEditingEarly(null);
      toast.success(
        earlyProof ? 'Proof Submitted' : 'Reason Updated',
        earlyProof ? 'Your certificate was sent to HR for review.' : 'Your early clock-out reason has been saved for HR review.'
      );
    } catch {
      toast.error('Error', 'Failed to update the reason. Please try again.');
    } finally {
      setSavingEarly(false);
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

  const handleExport = () => {
    if (!filtered.length) {
      toast.error('Nothing to export', 'No attendance records match the current period filter.');
      return;
    }
    const rows = filtered.map((a) => ({
      Date: a.date,
      Status: a.status || '',
      'Clock In': a.clockIn ? formatTime(a.clockIn) : '',
      'Clock Out': a.clockOut ? formatTime(a.clockOut) : '',
      'Break (h)': a.breakHours || 0,
      'Overtime (h)': a.overtime || 0,
      'Total (h)': a.totalHours || 0,
    }));
    downloadCsv(`my-attendance-${employeeId}.csv`, rows);
    toast.success('Export ready', `Exported ${rows.length} attendance records as CSV.`);
  };

  const handlePrint = () => {
    if (!filtered.length || !printRef.current) {
      toast.error('Nothing to print', 'No attendance records match the current period filter.');
      return;
    }
    printElementAsPdf(printRef.current, `Attendance - ${employeeId}`);
  };

  return (
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
          <Button variant="outline" size="md" icon={Download} onClick={handleExport}>Export CSV</Button>
          <Button variant="outline" size="md" icon={Printer} onClick={handlePrint}>Print / PDF</Button>
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
          { key: 'early', label: 'Early Clock Outs' },
        ].map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 pointer-coarse:py-2.5 text-[13px] font-semibold rounded-lg transition-colors ${
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
      ) : activeTab === 'overtime' ? (
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
                        <Button
                          variant="ghost"
                          size="xs"
                          icon={XCircle}
                          className="text-red-500 hover:text-red-600 hover:bg-red-50"
                          onClick={() => handleCancelOvertime(req)}
                        >
                          Cancel
                        </Button>
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
      ) : (
        <>
          {loadingEarlyOuts ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4"><SkeletonTable rows={4} cols={6} /></div>
          ) : !earlyOutRecords || earlyOutRecords.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <LogOut className="w-8 h-8 mx-auto text-gray-300" />
              <p className="text-sm text-gray-400 mt-3">No early clock-outs recorded yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                When you clock out before your shift ends, the reason you pick at the kiosk appears here.
              </p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="p-6 pb-4">
                <h3 className="text-[15px] font-semibold text-gray-900">My Early Clock Outs</h3>
                <p className="text-xs text-gray-500 mt-0.5">Each early punch is recorded immediately; HR classifies the shortfall after the fact</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      {['Date', 'Clocked Out At', 'Scheduled End', 'Time Lost', 'Reason', 'Classification', ''].map((h) => (
                        <th key={h} className="px-6 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {earlyOutRecords.map((rec) => {
                      const classificationMeta = EARLY_CLOCKOUT_CLASSIFICATION_META[rec.classification] || EARLY_CLOCKOUT_CLASSIFICATION_META.PENDING_REVIEW;
                      return (
                        <tr key={rec.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-3.5 text-sm text-gray-900 font-medium whitespace-nowrap">{formatDate(rec.date)}</td>
                          <td className="px-6 py-3.5 text-sm text-gray-700 tabular-nums">{formatTime(rec.actualClockOutTime)}</td>
                          <td className="px-6 py-3.5 text-sm text-gray-500 tabular-nums">{formatTime(rec.scheduledEndTime)}</td>
                          <td className="px-6 py-3.5 text-sm text-amber-600 font-medium">{formatMinutesShort(rec.minutesEarly)}</td>
                          <td className="px-6 py-3.5 text-sm text-gray-700">
                            {rec.reasonCode ? (
                              <span className="font-medium">{EARLY_CLOCKOUT_REASON_LABELS[rec.reasonCode] || rec.reasonCode}</span>
                            ) : (
                              <span className="text-gray-400 italic">No reason yet</span>
                            )}
                            {rec.reasonNote && (
                              <p className="text-xs text-gray-400 mt-0.5 max-w-[220px] truncate" title={rec.reasonNote}>{rec.reasonNote}</p>
                            )}
                          </td>
                          <td className="px-6 py-3.5">
                            <Badge variant={classificationMeta.variant} dot size="xs">{classificationMeta.label}</Badge>
                            {EARLY_CLOCKOUT_REASON_STATUS_META[rec.reasonStatus] && (
                              <div className="mt-1">
                                <Badge variant={EARLY_CLOCKOUT_REASON_STATUS_META[rec.reasonStatus].variant} size="xs">
                                  {EARLY_CLOCKOUT_REASON_STATUS_META[rec.reasonStatus].label}
                                </Badge>
                                {rec.reasonStatus === 'CERTIFICATE_REQUIRED' && rec.proofDueAt && (
                                  <p className="text-[11px] text-amber-600 mt-0.5">
                                    due {new Date(rec.proofDueAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                  </p>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-3.5 text-right">
                            <button
                              onClick={() => openEarlyReasonModal(rec)}
                              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              {['CERTIFICATE_REQUIRED', 'CERTIFICATE_OVERDUE'].includes(rec.reasonStatus) ? 'Upload Certificate' : 'Edit Reason'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
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
                  className={`px-3 py-1.5 pointer-coarse:py-2.5 text-xs font-medium rounded-lg transition-colors ${
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
            min={OT_EARLIEST}
            value={requestForm.date}
            onChange={e => setRequestForm({ ...requestForm, date: e.target.value })}
            error={requestErrors.date}
          />
          <p className="-mt-2 text-[11px] text-gray-400">
            Worked late without asking first? You can request a day from the past week; HR decides whether to approve it.
          </p>
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

      <Modal isOpen={!!editingEarly} onClose={() => setEditingEarly(null)} title="Edit Early Clock-Out Reason" size="md">
        <div className="space-y-4">
          {editingEarly && (
            <div className="flex items-center gap-3 text-sm">
              <div className="flex items-center gap-1.5 text-gray-600 bg-gray-50 rounded-xl px-3 py-2">
                <CalendarDays className="w-4 h-4 text-gray-400" />
                <span className="font-medium">{formatDate(editingEarly.date)}</span>
              </div>
              <div className="flex items-center gap-1.5 text-gray-600 bg-gray-50 rounded-xl px-3 py-2">
                <LogOut className="w-4 h-4 text-amber-500" />
                <span className="font-medium tabular-nums">{formatTime(editingEarly.actualClockOutTime)}</span>
                <span className="text-gray-400">·</span>
                <span className="text-gray-400 tabular-nums">lost {formatMinutesShort(editingEarly.minutesEarly)}</span>
              </div>
            </div>
          )}
          <Select
            label="Reason"
            value={earlyReasonForm.reasonCode}
            onChange={(e) => setEarlyReasonForm({ ...earlyReasonForm, reasonCode: e.target.value })}
          >
            <option value="">Select a reason...</option>
            {EARLY_CLOCKOUT_REASON_OPTIONS.map(({ value, label }) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </Select>
          <Textarea
            label="Note (optional)"
            rows={3}
            placeholder="Add context for HR..."
            value={earlyReasonForm.reasonNote}
            onChange={(e) => setEarlyReasonForm({ ...earlyReasonForm, reasonNote: e.target.value })}
          />
          <div>
            <label className="text-[13px] font-medium text-gray-700">
              Proof / Medical Certificate{' '}
              <span className="text-gray-400 font-normal">{earlyReasonForm.reasonCode === 'SICK' ? '(required to be excused)' : '(optional)'}</span>
            </label>
            {editingEarly?.proofDueAt && earlyReasonForm.reasonCode === 'SICK' && (
              <p className="text-[11px] text-amber-600 mt-1">
                Upload by {new Date(editingEarly.proofDueAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} or this early clock-out will not be excused.
              </p>
            )}
            {earlyProof ? (
              <div className="mt-1.5 flex items-center justify-between gap-2 px-3.5 py-2.5 rounded-xl border border-gray-200 bg-gray-50">
                <span className="text-sm text-gray-700 truncate">{earlyProof.name}</span>
                <button type="button" onClick={() => setEarlyProof(null)} className="text-xs font-medium text-gray-400 hover:text-red-600 shrink-0">Remove</button>
              </div>
            ) : (
              <label className="mt-1.5 flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl border border-dashed border-gray-300 bg-white text-sm text-gray-500 hover:border-blue-400 hover:text-blue-600 cursor-pointer transition-colors">
                <Plus className="w-4 h-4" />
                {editingEarly?.proof?.length ? 'Replace the attached file' : 'Attach a file (photo or PDF)'}
                <input type="file" accept="image/*,.pdf" className="hidden" onChange={handleEarlyProofSelect} />
              </label>
            )}
            {editingEarly?.proof?.length > 0 && !earlyProof && (
              <p className="text-[11px] text-emerald-600 mt-1">A file is already attached: {editingEarly.proof[0]?.name || 'certificate'}</p>
            )}
            {earlyProofError && <p className="text-xs text-red-500 font-medium mt-1.5">{earlyProofError}</p>}
          </div>
          <p className="text-xs text-gray-400">
            Your reason never blocks the punch, but HR checks every one - a sick claim is only excused with a medical certificate.
          </p>
        </div>
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
          <Button variant="outline" onClick={() => setEditingEarly(null)} disabled={savingEarly}>Cancel</Button>
          <Button onClick={handleSaveEarlyReason} loading={savingEarly} icon={CheckCircle}>Save Reason</Button>
        </div>
      </Modal>

      {/* Print/PDF snapshot - hidden on screen, rendered into a print window */}
      <div className="hidden">
        <div ref={printRef}>
          <h1>My Attendance</h1>
          <p className="print-sub">Employee {employeeId} · Generated {new Date().toLocaleString()}</p>
          <table>
            <thead>
              <tr>
                <th>Date</th><th>Status</th><th>Clock In</th><th>Clock Out</th>
                <th>Break (h)</th><th>Overtime (h)</th><th>Total (h)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((a) => (
                <tr key={a.id}>
                  <td>{a.date}</td>
                  <td>{a.status || ''}</td>
                  <td>{a.clockIn ? formatTime(a.clockIn) : ''}</td>
                  <td>{a.clockOut ? formatTime(a.clockOut) : ''}</td>
                  <td>{a.breakHours || 0}</td>
                  <td>{a.overtime || 0}</td>
                  <td>{a.totalHours || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}