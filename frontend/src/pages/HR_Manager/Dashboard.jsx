import { useEffect, useMemo, useState } from 'react';
import {
  Users, CheckCircle, CalendarOff, Clock, TrendingUp,
  Calendar, Briefcase, Check, X, ArrowRight, Inbox,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend, Area, AreaChart,
} from 'recharts';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import KpiCard from '../../components/dashboard/KpiCard';
import ChartCard from '../../components/dashboard/ChartCard';
import { SkeletonCard, SkeletonTable } from '../../components/ui/LoadingSkeleton';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useNotifications } from '../../context/NotificationContext';
import {
  employeeService, attendanceService, leaveService, shiftService, analyticsService,
} from '../../services/api';
import { toDateKey } from '../../services/attendanceService';
import { formatDate } from '../../utils/helpers';

const COLORS = {
  blue: '#3B82F6', emerald: '#10B981', amber: '#F59E0B',
  red: '#EF4444', purple: '#8B5CF6', sky: '#0EA5E9',
  indigo: '#6366F1', rose: '#F43F5E', teal: '#14B8A6',
};

const departmentColors = {
  Engineering: COLORS.blue,
  Marketing: COLORS.purple,
  Finance: COLORS.emerald,
  HR: COLORS.sky,
  Sales: COLORS.amber,
  Operations: COLORS.teal,
  IT: COLORS.indigo,
  Legal: COLORS.rose,
};

const leaveTypeColors = {
  Vacation: COLORS.blue,
  Sick: COLORS.emerald,
  Emergency: COLORS.amber,
  'Half Day': COLORS.teal,
  Special: COLORS.purple,
};

const leaveTypeBadge = (type) => {
  const map = { Vacation: 'primary', Sick: 'success', Emergency: 'warning', Special: 'purple' };
  return map[type] || 'default';
};

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3">
        <p className="text-sm font-semibold text-gray-900 mb-1">{label}</p>
        {payload.map((entry, index) => (
          <p key={index} className="text-xs text-gray-600">
            <span className="inline-block w-2 h-2 rounded-full mr-1.5" style={{ backgroundColor: entry.color }} />
            {entry.name}: {entry.value}{entry.name === 'percentage' ? '%' : ''}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

const EmptyState = ({ message }) => (
  <div className="flex flex-col items-center justify-center h-full py-12 text-center">
    <Inbox className="w-8 h-8 text-gray-300 mb-2" />
    <p className="text-sm text-gray-400">{message}</p>
  </div>
);

const countDays = (start, end) => {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
};

export default function Dashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const { refresh: refreshNotifications } = useNotifications();

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [shiftDefs, setShiftDefs] = useState([]);
  const [analytics, setAnalytics] = useState(null);

  useEffect(() => {
    let active = true;
    Promise.all([
      employeeService.getAll(),
      attendanceService.getAll(),
      leaveService.getAll(),
      shiftService.getSchedules(),
      shiftService.getAllShifts(),
      analyticsService.getAll().catch(() => null),
    ])
      .then(([emps, att, lvs, scheds, defs, an]) => {
        if (!active) return;
        setEmployees(emps);
        setAttendance(att);
        setLeaves(lvs);
        setSchedules(scheds);
        setShiftDefs(defs);
        setAnalytics(an);
      })
      .catch(() => {
        // leave states empty; empty states will render
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    // Fire-and-forget: checks for no-shows, un-closed-out attendance, and
    // staffing shortage risk, and creates notifications for any found. Never
    // allowed to break the dashboard if it fails.
    attendanceService.checkAlerts()
      .then(() => refreshNotifications())
      .catch(() => {});

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const today = toDateKey(new Date());
  const todaysAttendance = useMemo(
    () => attendance.filter((a) => a.date === today),
    [attendance, today]
  );

  const kpi = useMemo(() => {
    const presentToday = todaysAttendance.filter(
      (a) => a.status !== 'Absent' && a.status !== 'On Leave'
    ).length;
    const lateToday = todaysAttendance.filter((a) => a.status === 'Late').length;
    const onLeave = employees.filter((e) => e.status === 'On Leave').length;
    const attendanceRate = employees.length
      ? Math.round((presentToday / employees.length) * 1000) / 10
      : 0;

    return {
      totalEmployees: employees.length,
      presentToday,
      lateToday,
      onLeave,
      attendanceRate,
    };
  }, [employees, todaysAttendance]);

  const attendanceOverviewData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = toDateKey(d);
      const label = d.toLocaleDateString('en-US', { weekday: 'short' });
      const rows = attendance.filter((a) => a.date === key);
      days.push({
        day: label,
        present: rows.filter((a) => a.status === 'Present' || a.status === 'Late').length,
        late: rows.filter((a) => a.status === 'Late').length,
        absent: rows.filter((a) => a.status === 'Absent').length,
      });
    }
    return days;
  }, [attendance]);

  const leaveStatisticsData = useMemo(() => {
    const byType = {};
    leaves.forEach((l) => {
      byType[l.leaveType] = (byType[l.leaveType] || 0) + 1;
    });
    return Object.entries(byType).map(([name, value]) => ({
      name,
      value,
      color: leaveTypeColors[name] || COLORS.purple,
    }));
  }, [leaves]);

  const weeklyAttendanceData = useMemo(() => {
    const trend = analytics?.attendanceTrend || [];
    return trend.map((row) => ({ week: row.month, percentage: row.rate ?? 0 }));
  }, [analytics]);

  const productivityData = useMemo(() => {
    const rows = analytics?.departmentProductivity || [];
    return rows.map((row) => ({ department: row.name, score: row.productivity ?? 0 }));
  }, [analytics]);

  const pendingLeaveRequests = useMemo(
    () =>
      leaves
        .filter((l) => l.status === 'Pending')
        .map((l) => ({
          id: l.id,
          name: l.employeeName,
          type: l.leaveType,
          dates: `${formatDate(l.startDate)} - ${formatDate(l.endDate)}`,
          days: countDays(l.startDate, l.endDate),
          reason: l.reason,
        })),
    [leaves]
  );

  const handleLeaveDecision = async (requestId, status) => {
    const approvedBy = user ? `${user.firstName} ${user.lastName}` : 'HR Admin';
    try {
      await leaveService.updateStatus(requestId, status, approvedBy);
      setLeaves((prev) => prev.map((l) => (l.id === requestId ? { ...l, status, approvedBy } : l)));
      toast.success(
        status === 'Approved' ? 'Leave Approved' : 'Leave Rejected',
        `Leave request has been ${status.toLowerCase()}.`
      );
    } catch {
      toast.error('Error', `Failed to ${status === 'Approved' ? 'approve' : 'reject'} leave request.`);
    }
  };

  const todaySchedule = useMemo(() => {
    const defById = Object.fromEntries(shiftDefs.map((s) => [s.id, s]));
    return schedules
      .filter((s) => s.date === today)
      .map((s) => {
        const def = defById[s.shiftId];
        return {
          employee: s.employeeName,
          shift: def?.name || s.shiftId,
          time: def ? `${def.startTime} - ${def.endTime}` : '',
          status: s.status,
        };
      });
  }, [schedules, shiftDefs, today]);

  const kpiCards = [
    { labelKey: 'dashboard.totalEmployees', value: kpi.totalEmployees, icon: Users, change: null, accent: 'blue' },
    { labelKey: 'dashboard.presentToday', value: kpi.presentToday, icon: CheckCircle, change: null, accent: 'emerald' },
    { labelKey: 'dashboard.onLeave', value: kpi.onLeave, icon: CalendarOff, change: null, accent: 'amber' },
    { labelKey: 'dashboard.lateEmployees', value: kpi.lateToday, icon: Clock, change: null, accent: 'red' },
    { labelKey: 'dashboard.attendanceRate', value: `${kpi.attendanceRate}%`, icon: TrendingUp, change: null, accent: 'purple' },
  ];

  const visibleLeaveRequests = pendingLeaveRequests.slice(0, 5);
  const visibleSchedule = todaySchedule.slice(0, 5);

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto space-y-7">
        <div className="space-y-2">
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
          {[1, 2, 3, 4, 5].map((i) => <SkeletonCard key={i} lines={2} />)}
        </div>
        <SkeletonTable rows={6} cols={5} />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-7">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-sm text-gray-400 mt-1.5">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-500 bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm">
          <Calendar className="w-4 h-4 text-gray-400" />
          <span className="font-medium">{formatDate(new Date().toISOString())}</span>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {kpiCards.map((card) => (
          <KpiCard key={card.labelKey} {...card} label={t(card.labelKey)} />
        ))}
      </div>

      {/* Row 2: Charts - Attendance Overview + Leave Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title={t('dashboard.attendanceOverview')} badge={t('dashboard.thisWeek')} badgeVariant="primary">
          <div className="h-[320px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendanceOverviewData} barGap={3} barCategoryGap="22%" margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend iconType="circle" iconSize={8} wrapperStyle={{ paddingTop: 16, fontSize: 12 }} />
                <Bar dataKey="present" name="Present" fill={COLORS.emerald} radius={[6, 6, 0, 0]} />
                <Bar dataKey="late" name="Late" fill={COLORS.amber} radius={[6, 6, 0, 0]} />
                <Bar dataKey="absent" name="Absent" fill={COLORS.red} radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard title={t('dashboard.leaveStatistics')} badge={t('dashboard.allTypes')} badgeVariant="info">
          <div className="h-[320px]">
            {leaveStatisticsData.length === 0 ? (
              <EmptyState message={t('dashboard.noData')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={leaveStatisticsData}
                    cx="50%"
                    cy="45%"
                    innerRadius={70}
                    outerRadius={105}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {leaveStatisticsData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        return (
                          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3">
                            <p className="text-sm font-semibold text-gray-900">{payload[0].name}</p>
                            <p className="text-xs text-gray-600">{payload[0].value} leaves</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Legend
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                    formatter={(value) => <span className="text-gray-600">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>

      {/* Row 3: Charts - Weekly Trend + Productivity */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title={t('dashboard.weeklyTrend')} badge={t('dashboard.overall')} badgeVariant="success">
          <div className="h-[320px]">
            {weeklyAttendanceData.length === 0 ? (
              <EmptyState message={t('dashboard.noData')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={weeklyAttendanceData} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <defs>
                    <linearGradient id="attendanceGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={COLORS.blue} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={COLORS.blue} stopOpacity={0.01} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Area type="monotone" dataKey="percentage" name="percentage" stroke={COLORS.blue} strokeWidth={2.5} fill="url(#attendanceGradient)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <ChartCard title={t('dashboard.productivity')} badge={t('dashboard.byDepartment')} badgeVariant="purple">
          <div className="h-[320px]">
            {productivityData.length === 0 ? (
              <EmptyState message={t('dashboard.noData')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productivityData} layout="vertical" barSize={16} barCategoryGap={10} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                  <YAxis type="category" dataKey="department" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#475569' }} width={110} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F8FAFC' }} />
                  <Bar dataKey="score" name="score" radius={[0, 6, 6, 0]}>
                    {productivityData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={departmentColors[entry.department] || COLORS.blue} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>
      </div>

      {/* Row 4: Pending Leave Requests (2fr) + Today's Schedule (1fr) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Pending Leave Requests - wider */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[560px]">
          <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3 flex-shrink-0">
            <h3 className="text-base font-semibold text-gray-900 tracking-tight">{t('dashboard.pendingLeave')}</h3>
            <div className="flex items-center gap-3">
              {pendingLeaveRequests.length > 5 && (
                <Link
                  to="/leave"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  {t('dashboard.viewAll')}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
              <Badge variant="warning" size="sm">{pendingLeaveRequests.length} {t('dashboard.pending')}</Badge>
            </div>
          </div>
          <div className="divide-y divide-gray-100/70 flex-1 overflow-y-auto overflow-x-hidden">
            {visibleLeaveRequests.length === 0 ? (
              <EmptyState message={t('dashboard.noLeaveRequests')} />
            ) : (
              visibleLeaveRequests.map((request) => (
                <div key={request.id} className="px-6 py-4 hover:bg-gray-50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <Avatar firstName={(request.name || '').split(' ')[0]} lastName={(request.name || '').split(' ')[1]} size="sm" className="mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold text-gray-900 truncate">{request.name}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant={leaveTypeBadge(request.type)} size="xs">{request.type}</Badge>
                          <span className="text-xs text-gray-400">{request.days}d</span>
                        </div>
                        <p className="text-xs text-gray-500 mt-1">{request.dates}</p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{request.reason}</p>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 mt-3 ml-11">
                    <Button variant="success" size="xs" icon={Check} onClick={() => handleLeaveDecision(request.id, 'Approved')}>
                      {t('dashboard.approve')}
                    </Button>
                    <Button variant="dangerOutline" size="xs" icon={X} onClick={() => handleLeaveDecision(request.id, 'Rejected')}>
                      {t('dashboard.reject')}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Today's Schedule - narrower */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[560px]">
          <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3 flex-shrink-0">
            <h3 className="text-base font-semibold text-gray-900 tracking-tight">{t('dashboard.todaySchedule')}</h3>
            <div className="flex items-center gap-3">
              {todaySchedule.length > 5 && (
                <Link
                  to="/shifts"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  {t('dashboard.viewAll')}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
              <Badge variant="primary" size="sm">{todaySchedule.length} {t('dashboard.assigned')}</Badge>
            </div>
          </div>
          <div className="divide-y divide-gray-100/70 flex-1 overflow-y-auto overflow-x-hidden">
            {visibleSchedule.length === 0 ? (
              <EmptyState message={t('dashboard.noSchedule')} />
            ) : (
              visibleSchedule.map((entry, idx) => (
                <div key={idx} className="px-6 py-3.5 flex items-center gap-3 hover:bg-gray-50 transition-colors">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${entry.status === 'On Leave' ? 'bg-amber-50' : 'bg-emerald-50'}`}>
                    {entry.status === 'On Leave' ? (
                      <CalendarOff className="w-4 h-4 text-amber-500" />
                    ) : (
                      <Briefcase className="w-4 h-4 text-emerald-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{entry.employee}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{entry.shift} &middot; {entry.time}</p>
                  </div>
                  <Badge variant={entry.status === 'On Leave' ? 'warning' : 'success'} size="xs">
                    {entry.status === 'On Leave' ? t('dashboard.onLeaveShort') : t('dashboard.present')}
                  </Badge>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
