import { useMemo } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Clock, CalendarDays, CalendarCheck, Hourglass,
  Briefcase, Plus,
  Fingerprint, FileText, CalendarClock, Calendar, ArrowRight,
  Shield, Building2, BadgeCheck, DoorOpen, User, Settings,
} from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { useAuth } from '../../context/AuthContext';
import Badge from '../../components/ui/Badge';
import Avatar from '../../components/ui/Avatar';
import Button from '../../components/ui/Button';
import KpiCard from '../../components/dashboard/KpiCard';
import ChartCard from '../../components/dashboard/ChartCard';
import { SkeletonPage } from '../../components/ui/LoadingSkeleton';
import useApiData from '../../hooks/useApiData';
import { attendanceService, leaveService, shiftService, timesheetService } from '../../services/api';
import { formatDate, formatTime } from '../../utils/helpers';

const COLORS = { emerald: '#10B981', amber: '#F59E0B', red: '#EF4444', blue: '#3B82F6' };

const leaveTypeBadge = (type) => {
  const map = { Vacation: 'primary', Sick: 'success', Emergency: 'warning', Special: 'purple' };
  return map[type] || 'default';
};

const statusBadge = (status) => {
  const map = { Approved: 'success', Pending: 'warning', Rejected: 'danger' };
  return map[status] || 'default';
};

const dayLabel = (dateStr) => {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { weekday: 'short' });
};

// App-style shortcuts: a big icon tile with a short name underneath (nothing gets cut off).
const quickActions = [
  { label: 'My Attendance', hint: 'Clock-ins & hours', path: '/my-attendance', icon: Fingerprint, tile: 'from-blue-500 to-blue-600 shadow-blue-500/25' },
  { label: 'Leave', hint: 'Apply & track', path: '/leave', icon: Calendar, tile: 'from-emerald-500 to-emerald-600 shadow-emerald-500/25' },
  { label: 'My Timesheet', hint: 'Weekly hours', path: '/my-timesheet', icon: FileText, tile: 'from-purple-500 to-purple-600 shadow-purple-500/25' },
  { label: 'My Schedule', hint: 'Upcoming shifts', path: '/my-schedule', icon: CalendarClock, tile: 'from-amber-500 to-orange-500 shadow-amber-500/25' },
  { label: 'My Profile', hint: 'Details & contact', path: '/my-profile', icon: User, tile: 'from-sky-500 to-cyan-600 shadow-sky-500/25' },
  { label: 'Settings', hint: 'Password & look', path: '/settings', icon: Settings, tile: 'from-slate-500 to-slate-600 shadow-slate-500/25' },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3">
        <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-xs text-gray-600">
            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: entry.color }} />
            {entry.name}: {entry.value}h
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export default function EmployeeDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const employeeId = user?.id || 'EMP001';

  const { data: attendanceRecords, loading: loadingAttendance } = useApiData(
    () => attendanceService.getByEmployeeId(employeeId),
    [employeeId]
  );
  const { data: leavesRecords, loading: loadingLeaves } = useApiData(
    () => leaveService.getByEmployeeId(employeeId),
    [employeeId]
  );
  const { data: schedules, loading: loadingSchedules } = useApiData(
    () => shiftService.getScheduleByEmployeeId(employeeId),
    [employeeId]
  );
  const { data: shiftDefs, loading: loadingShiftDefs } = useApiData(
    () => shiftService.getAllShifts(),
    []
  );
  const { data: timesheetRecords, loading: loadingTimesheets } = useApiData(
    () => timesheetService.getByEmployeeId(employeeId),
    [employeeId]
  );
  const { data: leaveBalances, loading: loadingBalances } = useApiData(
    () => leaveService.getBalances(employeeId),
    [employeeId]
  );
  const { data: earlyOuts, loading: loadingEarlyOuts } = useApiData(
    () => attendanceService.getEarlyClockOutsByEmployee(employeeId),
    [employeeId]
  );

  const dashboardLoading =
    loadingAttendance || loadingLeaves || loadingSchedules || loadingShiftDefs || loadingTimesheets || loadingBalances || loadingEarlyOuts;

  const myAttendance = useMemo(
    () => (attendanceRecords || [])
      .filter((a) => a.employeeId === employeeId)
      .sort((a, b) => a.date.localeCompare(b.date)),
    [attendanceRecords, employeeId]
  );

  const myLeaves = useMemo(
    () => (leavesRecords || [])
      .filter((l) => l.employeeId === employeeId)
      .sort((a, b) => b.appliedDate.localeCompare(a.appliedDate)),
    [leavesRecords, employeeId]
  );

  const mySchedule = useMemo(
    () => (schedules || []).filter((s) => s.employeeId === employeeId).slice(-7),
    [schedules, employeeId]
  );

  const myTimesheet = useMemo(
    () => (timesheetRecords || [])
      .filter((t) => t.employeeId === employeeId)
      .sort((a, b) => b.weekEnd.localeCompare(a.weekEnd))[0] || null,
    [timesheetRecords, employeeId]
  );

  // Last 10 working days -> hours per day, for the chart
  const chartData = useMemo(() => {
    return myAttendance.slice(-10).map((a) => {
      const hours = a.clockIn && a.clockOut ? a.totalHours || 0 : 0;
      return { day: dayLabel(a.date), hours: Math.round(hours * 10) / 10, status: a.status };
    });
  }, [myAttendance]);

  const hoursThisWeek = useMemo(() => {
    const last7 = myAttendance.slice(-5);
    return last7.reduce((sum, a) => sum + (a.clockIn && a.clockOut ? a.totalHours || 0 : 0), 0);
  }, [myAttendance]);

  const leaveBalance = useMemo(() => {
    const balances = leaveBalances || [];
    const vacation = balances.find((b) => b.type === 'Vacation');
    if (vacation) return vacation.remaining;
    return balances.reduce((sum, b) => sum + b.remaining, 0);
  }, [leaveBalances]);

  const pendingCount = myLeaves.filter((l) => l.status === 'Pending').length;
  const attendanceRate = myAttendance.length
    ? Math.round((myAttendance.filter((a) => a.status === 'Present').length / myAttendance.length) * 100)
    : 0;

  const todayKey = new Date().toISOString().slice(0, 10);
  const todayEarly = useMemo(
    () => (earlyOuts || []).find((e) => e.date === todayKey),
    [earlyOuts, todayKey]
  );

  const earlyInfo = todayEarly ? (
    <div className="flex items-center gap-5 p-5 rounded-2xl border border-amber-100 bg-amber-50/70">
      <div className="w-11 h-11 rounded-xl bg-amber-400/20 flex items-center justify-center shrink-0">
        <DoorOpen className="w-5 h-5 text-amber-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-amber-800">Early leave today</p>
        <p className="text-xs text-amber-700 mt-0.5">
          You clocked out {todayEarly.minutesEarly ? `${todayEarly.minutesEarly} min early` : 'early'} today
          {todayEarly.classification === 'UNPAID'
            ? ' · classified as Unpaid'
            : todayEarly.classification === 'PENDING_REVIEW'
              ? ' · pending HR review'
              : todayEarly.classification
                ? ' · excused'
                : ''}.
        </p>
      </div>
      <Badge
        variant={
          todayEarly.classification === 'UNPAID'
            ? 'danger'
            : todayEarly.classification === 'PENDING_REVIEW' || !todayEarly.classification
              ? 'warning'
              : 'success'}
        size="sm"
      >
        {todayEarly.classification === 'UNPAID'
          ? 'Unpaid'
          : todayEarly.classification === 'PENDING_REVIEW' || !todayEarly.classification
            ? 'Pending Review'
            : 'Excused'}
      </Badge>
      <Link to="/my-attendance" className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 hover:text-amber-900 transition-colors shrink-0">
        Review <ArrowRight className="w-3.5 h-3.5" />
      </Link>
    </div>
  ) : null;

  if (dashboardLoading) {
    return <SkeletonPage kpiCount={4} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-7">
      {/* Page Header */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-start gap-5">
          <Avatar firstName={user?.firstName} lastName={user?.lastName} size="2xl" src={user?.avatar} />
          <div className="flex-1 min-w-0">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
                Welcome back, {user?.firstName}!
              </h1>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-blue-50 border border-blue-100">
                <BadgeCheck className="w-3.5 h-3.5 text-blue-600" />
                <span className="text-[12px] font-bold text-blue-700 tracking-wide font-mono">{user?.id || 'EMP001'}</span>
              </div>
            </div>
            <p className="text-sm text-gray-400 mt-1">Here's what's happening with your work today.</p>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              {user?.department && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                  <Building2 className="w-3 h-3" />
                  {user.department}
                </span>
              )}
              {user?.position && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
                  <Briefcase className="w-3 h-3" />
                  {user.position}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                <Shield className="w-3 h-3" />
                Identity verified via facial recognition
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 px-4 py-2.5 rounded-xl border border-gray-100 shrink-0">
            <CalendarDays className="w-4 h-4 text-gray-400" />
            <span className="font-medium">{formatDate(new Date().toISOString())}</span>
          </div>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard label="Hours This Week" value={`${hoursThisWeek.toFixed(1)}h`} icon={Hourglass} accent="blue" />
        <KpiCard label="Leave Balance" value={`${leaveBalance} days`} icon={CalendarCheck} accent="emerald" />
        <KpiCard label="Attendance Rate" value={`${attendanceRate}%`} icon={CalendarDays} accent="purple" />
        <KpiCard label="Pending Requests" value={pendingCount} icon={Clock} accent="amber" />
      </div>

      {/* Early Leave Today */}
      {earlyInfo}

      {/* Attendance chart + My Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard title="My Attendance" badge="Last 10 days" badgeVariant="primary" className="lg:col-span-2">
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={3} barCategoryGap="22%" margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 16, fontSize: 12 }} />
                <Bar dataKey="hours" name="Hours Worked" fill={COLORS.blue} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        {/* My Schedule - fixed height, scrollable list */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[416px]">
          <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3 flex-shrink-0">
            <h3 className="text-base font-semibold text-gray-900 tracking-tight">My Shift</h3>
            <Badge variant="primary" size="sm">{mySchedule.length} shifts</Badge>
          </div>
          <div className="divide-y divide-gray-100/70 flex-1 overflow-y-auto overflow-x-hidden">
            {mySchedule.length === 0 && (
              <p className="px-6 py-6 text-sm text-gray-400 text-center">No upcoming shifts scheduled.</p>
            )}
            {mySchedule.slice().reverse().map((entry) => {
              const shift = (shiftDefs || []).find((s) => s.id === entry.shiftId);
              return (
                <div key={entry.id} className="px-6 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0 bg-blue-50">
                    <Briefcase className="w-4 h-4 text-blue-500" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{formatDate(entry.date)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{shift?.name} &middot; {shift ? `${formatTime(shift.startTime)} - ${formatTime(shift.endTime)}` : ''}</p>
                  </div>
                  <Badge variant={entry.status === 'Completed' ? 'success' : 'primary'} size="xs">
                    {entry.status}
                  </Badge>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* My Timesheet */}
      {myTimesheet && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-semibold text-gray-900 tracking-tight">My Timesheet</h3>
                <Badge variant={myTimesheet.status === 'Approved' ? 'success' : myTimesheet.status === 'Submitted' ? 'warning' : 'default'} size="xs">
                  {myTimesheet.status}
                </Badge>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                {formatDate(myTimesheet.weekStart)} – {formatDate(myTimesheet.weekEnd)}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-5 sm:gap-8">
              <div>
                <p className="text-[11px] text-gray-400">Regular</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{Number(myTimesheet.regularHours || 0).toFixed(1)}h</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400">Overtime</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{Number(myTimesheet.overtimeHours || 0).toFixed(1)}h</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400">Total</p>
                <p className="text-sm font-semibold text-gray-900 mt-0.5">{Number(myTimesheet.totalHours || 0).toFixed(1)}h</p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate('/my-timesheet')}>View Timesheet</Button>
          </div>
        </div>
      )}

      {/* My Leave Requests + Quick Actions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[460px]">
          <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3 flex-shrink-0">
            <h3 className="text-base font-semibold text-gray-900 tracking-tight">My Leave Requests</h3>
            <div className="flex items-center gap-3">
              {myLeaves.length > 5 && (
                <Link
                  to="/leave"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  View All
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
              <Button variant="outline" size="xs" icon={Plus} onClick={() => navigate('/leave')}>Apply Leave</Button>
            </div>
          </div>
          <div className="divide-y divide-gray-100/70 flex-1 overflow-y-auto overflow-x-hidden">
            {myLeaves.length === 0 && (
              <p className="px-6 py-6 text-sm text-gray-400 text-center">You haven't filed any leave requests yet.</p>
            )}
            {myLeaves.map((leave) => (
              <div key={leave.id} className="px-6 py-4 flex items-start justify-between gap-3 hover:bg-gray-50 transition-colors">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant={leaveTypeBadge(leave.leaveType)} size="xs">{leave.leaveType}</Badge>
                    <span className="text-xs text-gray-400">
                      {formatDate(leave.startDate)}{leave.startDate !== leave.endDate ? ` - ${formatDate(leave.endDate)}` : ''}
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5 line-clamp-2">{leave.reason}</p>
                </div>
                <Badge variant={statusBadge(leave.status)} size="sm" className="shrink-0">{leave.status}</Badge>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[460px]">
          <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3 flex-shrink-0">
            <h3 className="text-base font-semibold text-gray-900 tracking-tight">Quick Actions</h3>
            <Badge variant="primary" size="sm">{quickActions.length} shortcuts</Badge>
          </div>
          <div className="flex-1 min-h-0 p-4 pt-1 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-2 gap-2.5 auto-rows-fr">
            {quickActions.map((action) => (
              <button
                key={action.label}
                type="button"
                onClick={() => navigate(action.path)}
                className="group flex flex-col items-center justify-center gap-1 p-2 min-w-0 min-h-0 rounded-2xl border border-gray-100 bg-gray-50/60 hover:bg-white hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 text-center"
              >
                <span className={`w-11 h-11 rounded-xl bg-gradient-to-br ${action.tile} shadow-md flex items-center justify-center group-hover:scale-105 transition-transform duration-200`}>
                  <action.icon className="w-5 h-5 text-white" />
                </span>
                <span className="text-[13px] font-semibold text-gray-900 leading-tight">{action.label}</span>
                <span className="text-[10px] text-gray-400 leading-tight">{action.hint}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
