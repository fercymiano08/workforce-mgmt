import { useMemo, useState } from 'react';
import {
  CalendarDays, Clock3, Timer, Coffee, Send, BarChart3, ChevronRight,
} from 'lucide-react';
import { useTimesheets, useTimesheetsLoaded, submitTimesheet, refreshTimesheets } from '../../hooks/useTimesheets';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import KpiCard from '../../components/dashboard/KpiCard';
import { SkeletonCard, SkeletonTable } from '../../components/ui/LoadingSkeleton';
import useApiData from '../../hooks/useApiData';
import { attendanceService } from '../../services/api';
import { toDateKey } from '../../services/attendanceService';
import { formatDate, formatTime } from '../../utils/helpers';

const hours = (value) => `${Number(value || 0).toFixed(1)}h`;

const DAY_LABELS = ['M', 'T', 'W', 'TH', 'F', 'S', 'SN'];

const WORKED_STATUSES = ['Present', 'Late', 'Half Day'];

function getMonday(today) {
  const day = today.getDay(); // 0 = Sunday
  const offset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + offset);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

export default function MyTimesheet() {
  const { user } = useAuth();
  const { toast } = useToast();
  const employeeId = user?.id || 'EMP001';
  const [selectedWeek, setSelectedWeek] = useState(null);
  const data = useTimesheets();
  const loaded = useTimesheetsLoaded();

  const { data: attendance } = useApiData(
    () => attendanceService.getByEmployeeId(employeeId),
    [employeeId]
  );

  const records = useMemo(
    () => data
      .filter((t) => t.employeeId === employeeId)
      .sort((a, b) => b.weekEnd.localeCompare(a.weekEnd)),
    [data, employeeId]
  );

  const latest = records[0];

  // The current calendar week (Mon–Sun) built from this week's attendance, so
  // the page always has a real weekly picture even before a timesheet exists.
  const thisWeek = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = getMonday(today);
    const days = Array.from({ length: 7 }, (_, i) => {
      const date = new Date(monday);
      date.setDate(monday.getDate() + i);
      date.setHours(0, 0, 0, 0);
      return {
        key: toDateKey(date),
        date,
        label: DAY_LABELS[i],
        isWeekend: i >= 5,
        isToday: date.getTime() === today.getTime(),
        isFuture: date.getTime() > today.getTime(),
      };
    });

    const byDate = {};
    (attendance || []).forEach((a) => { byDate[a.date] = a; });

    const workedRecords = days
      .map((d) => byDate[d.key])
      .filter((r) => r && (r.clockIn || WORKED_STATUSES.includes(r.status)));

    return {
      monday,
      sunday: days[6].date,
      days,
      byDate,
      workedRecords,
      workedDays: workedRecords.length,
      regularHours: workedRecords.reduce((sum, r) => sum + (r.regularHours || 0), 0),
      overtimeHours: workedRecords.reduce((sum, r) => sum + (r.overtime || 0), 0),
      breakHours: workedRecords.reduce((sum, r) => sum + (r.breakHours || 0), 0),
      totalHours: workedRecords.reduce((sum, r) => sum + (r.totalHours || 0), 0),
      lateCount: workedRecords.filter((r) => r.status === 'Late').length,
    };
  }, [attendance]);

  // KPIs always render: the latest timesheet once it exists, otherwise this
  // week's live attendance totals so the page never looks empty.
  const kpis = latest
    ? [
        { label: 'Regular Hours', value: hours(latest.regularHours), icon: Clock3, accent: 'blue' },
        { label: 'Overtime', value: hours(latest.overtimeHours), icon: Timer, accent: 'purple' },
        { label: 'Break Hours', value: hours(latest.breakHours), icon: Coffee, accent: 'amber' },
        { label: 'Total Hours', value: hours(latest.totalHours), icon: Clock3, accent: 'emerald' },
      ]
    : [
        { label: 'Regular Hours · This Week', value: hours(thisWeek.regularHours), icon: Clock3, accent: 'blue' },
        { label: 'Overtime · This Week', value: hours(thisWeek.overtimeHours), icon: Timer, accent: 'purple' },
        { label: 'Break Hours · This Week', value: hours(thisWeek.breakHours), icon: Coffee, accent: 'amber' },
        { label: 'Total Hours · This Week', value: hours(thisWeek.totalHours), icon: Clock3, accent: 'emerald' },
      ];

  const handleSubmit = async () => {
    if (!latest || latest.status !== 'Draft') return;
    try {
      await submitTimesheet(latest.id);
      await refreshTimesheets();
      toast.success('Timesheet Submitted', 'Timesheet submitted successfully for HR review.');
    } catch {
      toast.error('Error', 'Failed to submit timesheet.');
    }
  };

  if (!loaded) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <SkeletonCard lines={2} />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </div>
        <SkeletonTable rows={5} cols={5} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Timesheet</h1>
          <p className="text-[14px] text-gray-500 mt-1">Review your weekly working hours and timesheet status</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm">
            <CalendarDays className="w-4 h-4 text-gray-400" />
            <span className="font-medium">{formatDate(new Date().toISOString())}</span>
          </div>
          {latest?.status === 'Draft' && (
            <Button variant="primary" size="md" icon={Send} onClick={handleSubmit}>Submit Timesheet</Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} accent={kpi.accent} />
        ))}
      </div>

      {/* Single Summary Card */}
      <div
        onClick={() => setSelectedWeek(latest || (records[0]))}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <BarChart3 className="w-6 h-6 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">
                {latest ? `${formatDate(latest.weekStart)} – ${formatDate(latest.weekEnd)}` : 'This Week'}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {latest ? `Regular ${Number(latest.regularHours || 0).toFixed(1)}h · OT ${Number(latest.overtimeHours || 0).toFixed(1)}h · Total ${Number(latest.totalHours || 0).toFixed(1)}h` : 'No timesheet yet'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {latest && (
              <Badge variant={latest.status === 'Approved' ? 'success' : latest.status === 'Submitted' ? 'warning' : 'default'} size="sm">
                {latest.status}
              </Badge>
            )}
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </div>
        </div>
      </div>

      <Modal
        isOpen={!!selectedWeek}
        onClose={() => setSelectedWeek(null)}
        title={`Week of ${formatDate(selectedWeek?.weekStart)} – ${formatDate(selectedWeek?.weekEnd)}`}
        size="xl"
      >
        {selectedWeek && (
          <div className="space-y-6">
            {/* Status & Metadata */}
            <div className="flex items-center gap-3 flex-wrap">
              <Badge
                variant={selectedWeek.status === 'Approved' ? 'success' : selectedWeek.status === 'Submitted' ? 'warning' : 'default'}
                size="sm"
              >
                {selectedWeek.status}
              </Badge>
              {selectedWeek.approvedBy && (
                <span className="text-xs text-gray-500">Approved by {selectedWeek.approvedBy}</span>
              )}
            </div>

            {/* KPI Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-[11px] text-blue-600 font-medium uppercase">Regular</p>
                <p className="text-lg font-bold text-blue-700 mt-0.5">{Number(selectedWeek.regularHours || 0).toFixed(1)}h</p>
              </div>
              <div className="bg-purple-50 rounded-xl p-3 text-center">
                <p className="text-[11px] text-purple-600 font-medium uppercase">Overtime</p>
                <p className="text-lg font-bold text-purple-700 mt-0.5">{Number(selectedWeek.overtimeHours || 0).toFixed(1)}h</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-3 text-center">
                <p className="text-[11px] text-amber-600 font-medium uppercase">Break</p>
                <p className="text-lg font-bold text-amber-700 mt-0.5">{Number(selectedWeek.breakHours || 0).toFixed(1)}h</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <p className="text-[11px] text-emerald-600 font-medium uppercase">Total</p>
                <p className="text-lg font-bold text-emerald-700 mt-0.5">{Number(selectedWeek.totalHours || 0).toFixed(1)}h</p>
              </div>
            </div>

            {/* 7-Day Grid */}
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-3">Daily Breakdown</p>
              <div className="grid grid-cols-7 gap-2">
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((dayLabel, i) => {
                  const dayDate = new Date(selectedWeek.weekStart);
                  dayDate.setDate(dayDate.getDate() + i);
                  const dateKey = toDateKey(dayDate);
                  const dayRec = thisWeek?.byDate?.[dateKey];
                  const isToday = dateKey === toDateKey(new Date());
                  return (
                    <div
                      key={i}
                      className={`rounded-xl p-2 text-center border ${
                        isToday ? 'border-blue-400 ring-2 ring-blue-100' : 'border-gray-100'
                      }`}
                    >
                      <p className="text-[10px] font-semibold text-gray-400 uppercase">{dayLabel}</p>
                      <p className="text-xs font-bold text-gray-900 mt-0.5">{dayDate.getDate()}</p>
                      {dayRec?.status === 'Present' || dayRec?.status === 'Late' ? (
                        <>
                          <p className="text-[10px] font-semibold text-emerald-600 mt-1">{dayRec.hours?.toFixed(1) || '—'}h</p>
                          <p className="text-[9px] text-gray-400">{dayRec.clockIn ? formatTime(dayRec.clockIn) : '—'}</p>
                        </>
                      ) : dayRec?.status === 'Leave' ? (
                        <p className="text-[10px] font-medium text-purple-600 mt-1">Leave</p>
                      ) : (
                        <p className="text-[10px] text-gray-300 mt-1">—</p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Notes */}
            {selectedWeek.notes && (
              <div>
                <p className="text-sm font-semibold text-gray-900 mb-1">Notes</p>
                <p className="text-sm text-gray-600">{selectedWeek.notes}</p>
              </div>
            )}

            {/* Submit button */}
            {selectedWeek.status === 'Draft' && (
              <Button onClick={() => { submitTimesheet(selectedWeek.id); setSelectedWeek(null); }}>
                Submit Timesheet
              </Button>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
