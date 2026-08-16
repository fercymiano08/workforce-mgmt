import { useMemo, useState } from 'react';
import clsx from 'clsx';
import {
  CalendarDays, Clock3, Timer, Coffee, Filter, Send, CheckCircle, AlertTriangle, XCircle, BarChart3,
} from 'lucide-react';
import { useTimesheets, useTimesheetsLoaded, submitTimesheet, refreshTimesheets } from '../../hooks/useTimesheets';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import KpiCard from '../../components/dashboard/KpiCard';
import { SkeletonCard, SkeletonTable } from '../../components/ui/LoadingSkeleton';
import useApiData from '../../hooks/useApiData';
import { attendanceService } from '../../services/api';
import { formatHours, toDateKey } from '../../services/attendanceService';
import { formatDate, formatTime } from '../../utils/helpers';

const statusVariant = {
  Draft: 'default',
  Submitted: 'warning',
  Approved: 'success',
  Rejected: 'danger',
};

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
  const [period, setPeriod] = useState('All');
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

  const filtered = period === 'All' ? records : records.slice(0, period === 'Latest' ? 1 : 2);
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

      {/* This Week Overview */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-[15px] font-semibold text-gray-900">This Week Overview</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {formatDate(thisWeek.monday.toISOString())} – {formatDate(thisWeek.sunday.toISOString())}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>
              <span className="font-bold text-gray-900">{thisWeek.workedDays}</span> days worked
            </span>
            <span>
              <span className="font-bold text-gray-900">{formatHours(thisWeek.totalHours)}</span> total hours
            </span>
            <span className={clsx('font-semibold', thisWeek.lateCount ? 'text-amber-600' : 'text-gray-400')}>
              {thisWeek.lateCount} late
            </span>
          </div>
        </div>

        <div className="p-6 grid grid-cols-7 gap-2 sm:gap-3">
          {thisWeek.days.map((day) => {
            const rec = thisWeek.byDate[day.key];
            const worked = !!rec && (rec.clockIn || WORKED_STATUSES.includes(rec.status));

            let tile;
            if (worked) {
              const isLate = rec.status === 'Late';
              tile = (
                <>
                  <span className={clsx(
                    'flex items-center justify-center gap-1 text-[11px] font-semibold',
                    isLate ? 'text-amber-600' : rec.status === 'Half Day' ? 'text-blue-600' : 'text-emerald-600'
                  )}>
                    {isLate ? <AlertTriangle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
                    {formatHours(rec.totalHours)}
                  </span>
                  {rec.clockIn && (
                    <span className="text-[10px] text-gray-400">{formatTime(rec.clockIn)}</span>
                  )}
                </>
              );
            } else if (rec?.status === 'On Leave') {
              tile = (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-purple-600">
                  <CalendarDays className="w-3.5 h-3.5" />
                  Leave
                </span>
              );
            } else if (rec?.status === 'Absent' || (!rec && day.isWeekend === false && !day.isFuture && !day.isToday)) {
              tile = (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-red-500">
                  <XCircle className="w-3.5 h-3.5" />
                  Absent
                </span>
              );
            } else if (day.isFuture) {
              tile = <span className="text-[11px] text-gray-300">—</span>;
            } else if (day.isWeekend) {
              tile = <span className="text-[11px] text-gray-400 font-medium">Off</span>;
            } else {
              tile = <span className="text-[11px] text-gray-400">Pending</span>;
            }

            return (
              <div
                key={day.key}
                className={clsx(
                  'rounded-2xl border p-3 flex flex-col items-center gap-1.5 text-center transition-colors',
                  day.isToday ? 'border-blue-300 bg-blue-50/70 ring-1 ring-blue-200' : 'border-gray-100 bg-gray-50/60'
                )}
              >
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">{day.label}</span>
                <span className={clsx('text-sm font-semibold', day.isToday ? 'text-blue-700' : 'text-gray-600')}>
                  {day.date.getDate()}
                </span>
                {tile}
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b border-gray-100 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-[15px] font-semibold text-gray-900">Timesheet History</h3>
            <p className="text-xs text-gray-400 mt-1">Only your timesheets are shown.</p>
          </div>
          <div className="flex items-center gap-1">
            <Filter className="w-4 h-4 text-gray-400 mr-1" />
            {['All', 'Latest', 'Recent'].map((item) => (
              <button
                key={item}
                onClick={() => setPeriod(item)}
                className={`px-3 py-1.5 text-xs font-medium rounded-lg ${
                  period === item ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-auto">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Week', 'Regular Hours', 'Overtime', 'Break', 'Total Hours', 'Status'].map((head) => (
                  <th key={head} className="px-5 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    {head}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center">
                    <p className="text-sm text-gray-400">No timesheet records yet.</p>
                    <p className="text-xs text-gray-300 mt-1">
                      Timesheets are generated weekly once your attendance is complete. Your current week is shown above.
                    </p>
                  </td>
                </tr>
              ) : filtered.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50/50">
                  <td className="px-5 py-4 text-sm font-medium text-gray-900">
                    {formatDate(row.weekStart)} – {formatDate(row.weekEnd)}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">{hours(row.regularHours)}</td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {row.overtimeHours > 0 ? (
                      <span className="text-purple-600 font-medium">
                        {hours(row.overtimeHours)}
                        {row.approvedOtHours > 0 && (
                          <span className="text-xs text-gray-400 font-normal ml-1">· {row.approvedOtHours}h approved</span>
                        )}
                      </span>
                    ) : hours(row.overtimeHours)}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">{hours(row.breakHours)}</td>
                  <td className="px-5 py-4 text-sm font-semibold text-gray-900">{hours(row.totalHours)}</td>
                  <td className="px-5 py-4">
                    <Badge variant={statusVariant[row.status] || 'default'} dot size="xs">{row.status}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
