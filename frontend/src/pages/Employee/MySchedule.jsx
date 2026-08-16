import { useMemo, useState } from 'react';
import {
  CalendarDays, CalendarClock, Sun, Sunset, Moon, Zap,
  Clock, MapPin, Filter, CalendarOff, CalendarPlus,
} from 'lucide-react';
import Badge from '../../components/ui/Badge';
import { SkeletonCard, SkeletonTable } from '../../components/ui/LoadingSkeleton';
import { useAuth } from '../../context/AuthContext';
import useApiData from '../../hooks/useApiData';
import { attendanceService, overtimeService, shiftService } from '../../services/api';
import { extendTime, formatDate, formatTime } from '../../utils/helpers';

const shiftIcons = { SHIFT001: Sun, SHIFT002: Sunset, SHIFT003: Moon, SHIFT004: Zap };
const shiftIconColors = {
  SHIFT001: 'bg-emerald-50 text-emerald-600',
  SHIFT002: 'bg-amber-50 text-amber-600',
  SHIFT003: 'bg-violet-50 text-violet-600',
  SHIFT004: 'bg-blue-50 text-blue-600',
};
const shiftBadgeVariant = { SHIFT001: 'success', SHIFT002: 'warning', SHIFT003: 'purple', SHIFT004: 'primary' };
const statusBadgeVariant = {
  Upcoming: 'primary', Scheduled: 'warning', Completed: 'success',
  Swapped: 'purple', Cancelled: 'danger',
};

const toDateStr = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function MySchedule() {
  const { user } = useAuth();
  const employeeId = user?.id || 'EMP001';
  const [periodFilter, setPeriodFilter] = useState('This Week');

  const { data: schedules, loading: loadingSchedules } = useApiData(
    () => shiftService.getScheduleByEmployeeId(employeeId),
    [employeeId]
  );
  const { data: definitions, loading: loadingDefs } = useApiData(
    () => shiftService.getAllShifts(),
    []
  );
  const { data: attendanceRecords, loading: loadingAttendance } = useApiData(
    () => attendanceService.getByEmployeeId(employeeId),
    [employeeId]
  );
  const { data: overtimeRequests } = useApiData(
    () => overtimeService.getByEmployeeId(employeeId),
    [employeeId]
  );

  const approvedOtByDate = useMemo(() => {
    const map = {};
    for (const r of overtimeRequests || []) {
      if (r.status === 'Approved') {
        const hours = Number(r.approvedHours ?? r.expectedHours ?? 0);
        if (Number.isFinite(hours) && hours > 0) map[r.date] = (map[r.date] || 0) + hours;
      }
    }
    return map;
  }, [overtimeRequests]);

  const shiftOf = (shiftId) => (definitions || []).find((s) => s.id === shiftId);

  const mySchedules = useMemo(() => {
    return (schedules || [])
      .filter((s) => s.employeeId === employeeId)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [schedules, employeeId]);

  const hasNoSchedule = mySchedules.length === 0;

  // Use the real current date as the reference point (not a date derived
  // from mock data) so newly HR-assigned schedules always land in the
  // correct "This Week" / "This Month" window regardless of what dates
  // happen to exist in the seed data.
  const today = useMemo(() => toDateStr(new Date()), []);

  const referenceDate = useMemo(() => {
    if (mySchedules.length === 0) return null;
    return today;
  }, [mySchedules, today]);

  const todaySchedule = useMemo(() => {
    return mySchedules.find((s) => s.date === today) || null;
  }, [mySchedules, today]);

  const nextSchedule = useMemo(() => {
    return mySchedules.find((s) => s.date > today) || null;
  }, [mySchedules, today]);

  const thisWeek = useMemo(() => {
    if (!referenceDate) return { count: 0, start: null, end: null };
    const ref = new Date(today);
    const start = new Date(ref);
    start.setDate(ref.getDate() - ref.getDay());
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const count = mySchedules.filter(
      (s) => s.date >= toDateStr(start) && s.date <= toDateStr(end)
    ).length;
    return { count, start, end };
  }, [mySchedules, referenceDate, today]);

  const filtered = useMemo(() => {
    if (periodFilter === 'All Schedules') return mySchedules;
    if (!referenceDate || !thisWeek.start) return [];
    const ref = new Date(today);
    return mySchedules.filter((s) => {
      const d = new Date(s.date);
      if (periodFilter === 'This Week') {
        return d >= thisWeek.start && d <= thisWeek.end;
      }
      if (periodFilter === 'This Month') {
        return d.getMonth() === ref.getMonth() && d.getFullYear() === ref.getFullYear();
      }
      return true;
    });
  }, [mySchedules, periodFilter, referenceDate, thisWeek, today]);

  const locationMap = useMemo(() => {
    const map = {};
    for (const a of attendanceRecords || []) {
      if (a.employeeId === employeeId && a.location && !map[a.date]) map[a.date] = a.location;
    }
    return map;
  }, [attendanceRecords, employeeId]);

  const clockInByDate = useMemo(() => {
    const map = {};
    for (const a of attendanceRecords || []) {
      if (a.employeeId === employeeId && a.clockIn && !map[a.date]) map[a.date] = a.clockIn;
    }
    return map;
  }, [attendanceRecords, employeeId]);

  const scheduleStatus = (schedule) => {
    if (referenceDate && schedule.date > referenceDate) return 'Upcoming';
    return schedule.status;
  };

  const renderShiftCard = (label, schedule, fallbackIcon, fallbackText) => {
    const def = schedule ? shiftOf(schedule.shiftId) : null;
    const Icon = def ? shiftIcons[def.id] || Clock : fallbackIcon;
    const otHours = schedule ? approvedOtByDate[schedule.date] : 0;
    const endTime = def && otHours ? extendTime(def.endTime, otHours) : def?.endTime;
    return (
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-medium text-gray-400">{label}</p>
            <p className="text-lg font-bold text-gray-900 mt-1.5 truncate">{def ? def.name : fallbackText}</p>
            {def ? (
              <>
                <p className="text-xs text-gray-500 mt-1">
                  {formatTime(def.startTime)} –{' '}
                  <span className={otHours ? 'text-blue-600 font-semibold' : ''}>{formatTime(endTime)}</span>
                </p>
                {otHours ? (
                  <p className="text-[10px] font-medium text-blue-600 mt-1 flex items-center gap-1">
                    <Zap className="w-3 h-3" /> Expanded · +{otHours}h overtime
                  </p>
                ) : null}
              </>
            ) : (
              <p className="text-xs text-gray-500 mt-1">Not assigned</p>
            )}
          </div>
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${def ? shiftIconColors[def.id] : 'bg-gray-50 text-gray-400'}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
      </div>
    );
  };

  const loading = loadingSchedules || loadingDefs || loadingAttendance;

  return loading ? (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={2} />
      </div>
      <SkeletonTable rows={6} cols={5} />
    </div>
  ) : (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Schedule</h1>
          <p className="text-[14px] text-gray-500 mt-1">View your assigned work schedules</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-white px-4 py-2 rounded-xl border border-gray-100 shadow-sm">
            <CalendarClock className="w-4 h-4 text-blue-500" />
            <span className="font-medium">{user?.firstName} {user?.lastName}</span>
          </div>
        </div>
      </div>

      {hasNoSchedule ? (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-10 flex flex-col items-center text-center">
          <div className="w-14 h-14 rounded-2xl bg-gray-50 flex items-center justify-center mb-4">
            <CalendarPlus className="w-7 h-7 text-gray-400" />
          </div>
          <h3 className="text-base font-semibold text-gray-900">No Schedule Assigned</h3>
          <p className="text-sm text-gray-500 mt-1.5 max-w-sm">
            You don't have any work schedule yet. Your manager will assign one through Shift & Schedule, and it will appear here once it's set.
          </p>
        </div>
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            {renderShiftCard(
              'Today\'s Shift',
              todaySchedule,
              CalendarOff,
              'No Shift Today'
            )}

            {renderShiftCard(
              'Next Shift',
              nextSchedule,
              CalendarClock,
              'No Upcoming Shift'
            )}

            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium text-gray-400">Scheduled Days This Week</p>
                  <p className="text-lg font-bold text-gray-900 mt-1.5">{thisWeek.count} days</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {thisWeek.start ? `${formatDate(toDateStr(thisWeek.start))} – ${formatDate(toDateStr(thisWeek.end))}` : 'No schedule available'}
                  </p>
                </div>
                <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 bg-blue-50 text-blue-600">
                  <CalendarDays className="w-5 h-5" />
                </div>
              </div>
            </div>
          </div>

          {/* Schedule Table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm h-[560px] flex flex-col overflow-hidden">
            <div className="p-6 pb-4 flex-shrink-0">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div>
                  <h3 className="text-[15px] font-semibold text-gray-900">Schedule History</h3>
                  <p className="text-[13px] text-gray-500 mt-0.5">Your assigned work schedules</p>
                </div>
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  {['This Week', 'This Month', 'All Schedules'].map((period) => (
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

            <div className="flex-1 overflow-y-auto overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr>
                    {['Date', 'Day', 'Shift Type', 'Start Time', 'End Time', 'Status', 'Work Location'].map((h) => (
                      <th key={h} className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap sticky top-0 z-10 bg-gray-50 border-b border-gray-100">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-gray-400 text-sm">
                        No schedules found for this period
                      </td>
                    </tr>
                  ) : (
                    filtered.map((s) => {
                      const def = shiftOf(s.shiftId);
                      const dayName = new Date(s.date).toLocaleDateString('en-US', { weekday: 'short' });
                      const status = scheduleStatus(s);
                      const otHours = approvedOtByDate[s.date];
                      const endTime = def && otHours ? extendTime(def.endTime, otHours) : def?.endTime;
                      return (
                        <tr key={s.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 text-sm text-gray-900 font-medium whitespace-nowrap">{formatDate(s.date)}</td>
                          <td className="px-6 py-4 text-sm text-gray-500 whitespace-nowrap">{dayName}</td>
                          <td className="px-6 py-4">
                            <Badge variant={shiftBadgeVariant[s.shiftId] || 'default'} size="xs">
                              {def?.name || 'Unknown'}
                            </Badge>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {def ? (
                              clockInByDate[s.date] ? (
                                <>
                                  <span className="text-sm font-semibold text-gray-900">{formatTime(clockInByDate[s.date])}</span>
                                  <span className="block text-[10px] text-gray-400 mt-0.5">Scheduled: {formatTime(def.startTime)}</span>
                                </>
                              ) : (
                                <span className="text-sm text-gray-700">{formatTime(def.startTime)}</span>
                              )
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {def ? (
                              <>
                                <span className={`text-sm ${otHours ? 'font-semibold text-blue-600' : 'text-gray-700'}`}>
                                  {formatTime(endTime)}
                                </span>
                                {otHours ? (
                                  <span className="block text-[10px] font-medium text-blue-600 mt-0.5 flex items-center gap-1">
                                    <Zap className="w-3 h-3" /> +{otHours}h OT · expanded
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              <span className="text-sm text-gray-400">—</span>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant={statusBadgeVariant[status] || 'default'} dot size="xs">{status}</Badge>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-1.5 text-sm text-gray-600 whitespace-nowrap">
                              <MapPin className="w-3.5 h-3.5 text-gray-400" />
                              {locationMap[s.date] || 'Office'}
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
      )}
    </div>
  );
}
