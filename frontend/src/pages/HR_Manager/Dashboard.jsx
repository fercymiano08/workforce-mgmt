import { useEffect, useMemo, useState } from 'react';
import {
  Users, CheckCircle, CalendarOff, Clock, TrendingUp,
  Calendar, Briefcase, Check, X, ArrowRight, Inbox, FileText, LogOut, CheckCircle2, UserX, Download,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from 'recharts';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import KpiCard from '../../components/dashboard/KpiCard';
import ChartCard from '../../components/dashboard/ChartCard';
import { leaveTypeChartColor } from '../../constants/leaveTypes';
import { SkeletonLine, SkeletonPage } from '../../components/ui/LoadingSkeleton';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useNotifications } from '../../context/NotificationContext';
import {
  employeeService, attendanceService, leaveService, shiftService, analyticsService, overtimeService, timesheetService,
} from '../../services/api';
import { toDateKey } from '../../services/attendanceService';
import { kioskService } from '../../services/kioskService';
import { didAttend, isPresentGroup } from '../../utils/constants';
import { weekWithRecords, dayTick, weekRangeLabel } from '../../utils/today';
import { formatDate } from '../../utils/helpers';
import { downloadCsv } from '../../utils/export';

// How far back the export reaches. Every option is inside the 35 days of attendance this page
// already loads (see the fetch below), so choosing one re-reads what is already in memory instead
// of asking the server again - the range costs no request and no wait.
const RANGE_OPTIONS = [
  { days: 7, label: '7 days' },
  { days: 14, label: '14 days' },
  { days: 30, label: '30 days' },
];

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

const leaveTypeBadge = (type) => {
  // Same variants as leaveTypeVariant in pages/Employee/Leave.jsx, which the badge-only pages use.
  const map = {
    Vacation: 'primary', Sick: 'danger', Emergency: 'warning',
    Special: 'purple', Funeral: 'indigo', Unpaid: 'teal',
  };
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
  // How far back the trend card and the CSV reach. 30 days is the default because that is the span
  // the page has always been showing, so opening the dashboard looks the same as it did yesterday.
  const [rangeDays, setRangeDays] = useState(30);
  // Things waiting for a decision from the administrator, other than leave (which is already loaded)
  // These arrive on their own now, so they start as null - "unknown" - rather than 0. Saying zero when
  // the answer has not loaded yet would tell the administrator they are all caught up when they are not.
  const [waiting, setWaiting] = useState({ overtime: null, early: null, timesheets: null });
  const [pendingReady, setPendingReady] = useState(false);

  useEffect(() => {
    let active = true;

    // Every endpoint now loads on its own instead of inside one Promise.all. They used to be all or
    // nothing: the page drew nothing until the slowest of nine requests came back, so one slow call
    // held a skeleton over data that had already arrived. Each result paints the moment it lands.
    const load = (request, apply, fallback) => {
      request
        .then((res) => { if (active) apply(res); })
        .catch(() => { if (active && fallback !== undefined) apply(fallback); });
    };

    // The five number cards and the week chart are all worked out from these two, so they are what
    // decides when the skeleton lifts. Everything else fills in behind them.
    let criticalLeft = 2;
    const criticalDone = () => {
      criticalLeft -= 1;
      if (active && criticalLeft === 0) setLoading(false);
    };

    // The "needs your attention" counts are shown together, so they are held back until all four are
    // known. Showing a half-filled panel that quietly claims there is nothing to do is worse than a
    // brief placeholder.
    let pendingLeft = 4;
    const pendingDone = () => {
      pendingLeft -= 1;
      if (active && pendingLeft === 0) setPendingReady(true);
    };

    load(employeeService.getAll(), (res) => { setEmployees(res); criticalDone(); }, []);
    // The dashboard only shows today and the last 7 days.
    load(
      attendanceService.getAll({ from: (() => { const d = kioskService.now(); d.setDate(d.getDate() - 35); return toDateKey(d); })() }),
      (res) => { setAttendance(res); criticalDone(); },
      []
    );
    load(leaveService.getAll(), (res) => { setLeaves(res); pendingDone(); }, []);
    load(shiftService.getSchedules(), setSchedules, []);
    load(shiftService.getAllShifts(), setShiftDefs, []);

    load(analyticsService.getAll(), setAnalytics, null);
    load(
      overtimeService.getAll(),
      (ot) => {
        setWaiting((w) => ({ ...w, overtime: (ot || []).filter((r) => r.status === 'Pending').length }));
        pendingDone();
      },
      () => pendingDone()
    );
    // /attendance/early-outs/pending returns an object of the form { pending: N }
    load(
      attendanceService.getEarlyClockOutsPending(),
      (early) => {
        setWaiting((w) => ({ ...w, early: Number(early && typeof early === 'object' ? early.pending ?? 0 : 0) || 0 }));
        pendingDone();
      },
      () => pendingDone()
    );
    load(
      timesheetService.getAll(),
      (sheets) => {
        setWaiting((w) => ({ ...w, timesheets: (sheets || []).filter((s) => s.status === 'Submitted').length }));
        pendingDone();
      },
      () => pendingDone()
    );

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

  const today = kioskService.today();
  const todaysAttendance = useMemo(
    () => attendance.filter((a) => a.date === today),
    [attendance, today]
  );

  // Every day inside the chosen range, counted the way the overview card counts them, so the CSV and
  // the card cannot disagree about a number. Days with no record at all still appear, as zeros -
  // a day missing from a report reads as "we never looked", which is the one thing it must not say.
  const dailyRange = useMemo(() => {
    const start = new Date(today);
    start.setDate(start.getDate() - (rangeDays - 1));

    const byDate = new Map();
    attendance.forEach((a) => {
      if (a.date < toDateKey(start) || a.date > today) return;
      if (!byDate.has(a.date)) byDate.set(a.date, []);
      byDate.get(a.date).push(a);
    });

    const rows = [];
    for (let i = 0; i < rangeDays; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = toDateKey(d);
      const records = byDate.get(key) || [];
      const onTime = records.filter((a) => a.status === 'Present').length;
      const late = records.filter((a) => a.status === 'Late').length;
      const earlyLeave = records.filter((a) => a.status === 'Early Leave').length;
      const absent = records.filter((a) => a.status === 'Absent').length;
      const onLeave = records.filter((a) => a.status === 'On Leave').length;
      const attended = records.filter((a) => didAttend(a.status)).length;
      rows.push({
        key,
        onTime,
        late,
        earlyLeave,
        absent,
        onLeave,
        attended,
        records: records.length,
        rate: records.length ? Math.round((attended / records.length) * 1000) / 10 : 0,
      });
    }
    return rows;
  }, [attendance, today, rangeDays]);

  const exportRange = () => {
    // The daily rows, plus a total row: a spreadsheet of 30 lines with no bottom line makes someone
    // add it up by hand, and get it subtly wrong.
    const rows = dailyRange.map((r) => ({
      Date: r.key,
      Records: r.records,
      'On time': r.onTime,
      Late: r.late,
      'Early leave': r.earlyLeave,
      Absent: r.absent,
      'On leave': r.onLeave,
      'Attendance rate %': r.rate,
    }));
    const total = dailyRange.reduce(
      (acc, r) => ({
        records: acc.records + r.records,
        onTime: acc.onTime + r.onTime,
        late: acc.late + r.late,
        earlyLeave: acc.earlyLeave + r.earlyLeave,
        absent: acc.absent + r.absent,
        onLeave: acc.onLeave + r.onLeave,
        attended: acc.attended + r.attended,
      }),
      { records: 0, onTime: 0, late: 0, earlyLeave: 0, absent: 0, onLeave: 0, attended: 0 }
    );
    rows.push({
      Date: 'Total',
      Records: total.records,
      'On time': total.onTime,
      Late: total.late,
      'Early leave': total.earlyLeave,
      Absent: total.absent,
      'On leave': total.onLeave,
      'Attendance rate %': total.records ? Math.round((total.attended / total.records) * 1000) / 10 : 0,
    });

    downloadCsv(`attendance-${rangeDays}d-${today}.csv`, rows);
    toast.success('Export ready', `Attendance for the last ${rangeDays} days has been downloaded.`);
  };

  const kpi = useMemo(() => {
    // Present = everyone who came in, split into On Time and Late. Early Leave is counted on its own.
    const onTimeToday = todaysAttendance.filter((a) => a.status === 'Present').length;
    const presentToday = todaysAttendance.filter((a) => isPresentGroup(a.status)).length;
    const attendedToday = todaysAttendance.filter((a) => didAttend(a.status)).length;
    const lateToday = todaysAttendance.filter((a) => a.status === 'Late').length;
    const inactive = employees.filter((e) => e.status === 'Inactive').length;
    const attendanceRate = employees.length
      ? Math.round((attendedToday / employees.length) * 1000) / 10
      : 0;

    return {
      totalEmployees: employees.length,
      presentToday,
      onTimeToday,
      lateToday,
      inactive,
      attendanceRate,
    };
  }, [employees, todaysAttendance]);

  // Seven days exactly, Monday through Sunday, in the kiosk's time zone - never more, so the bars
  // stay wide enough to read instead of collapsing into sticks.
  //
  // The current week is used whenever it holds a single record. If it holds none - the week has not
  // started yet, or the last clock-in was the previous Saturday - it walks back one week at a time
  // to the most recent week that does. Anchoring on today alone left the card completely empty
  // whenever today happened to have no attendance yet, which is the whole card, not a column.
  // The badge then names the week it fell back to instead of claiming "This Week".
  const attendanceOverview = useMemo(() => {
    // weekWithRecords picks the current Monday-Sunday week when it holds a record, otherwise the most
    // recent one that does, so the overview is never an empty card. It is the same helper the
    // employee's own chart uses, which is what keeps the two cards identical in shape.
    const week = weekWithRecords(attendance.map((a) => a.date));
    const rowsByDate = new Map();
    attendance.forEach((a) => {
      if (!rowsByDate.has(a.date)) rowsByDate.set(a.date, []);
      rowsByDate.get(a.date).push(a);
    });

    const days = week.days.map((key) => {
      const rows = rowsByDate.get(key) || [];
      return {
        key,
        day: dayTick(key),
        onTime: rows.filter((a) => a.status === 'Present').length,
        late: rows.filter((a) => a.status === 'Late').length,
        earlyLeave: rows.filter((a) => a.status === 'Early Leave').length,
        absent: rows.filter((a) => a.status === 'Absent').length,
      };
    });

    return { days, isCurrentWeek: week.weeksBack === 0, rangeLabel: weekRangeLabel(week.start, week.end) };
  }, [attendance]);

  const attendanceOverviewData = attendanceOverview.days;

  const hasAttendanceData = attendanceOverviewData.some(
    (d) => d.onTime || d.late || d.earlyLeave || d.absent
  );

  const leaveStatisticsData = useMemo(() => {
    const byType = {};
    leaves.forEach((l) => {
      byType[l.leaveType] = (byType[l.leaveType] || 0) + 1;
    });
    return Object.entries(byType).map(([name, value]) => ({
      name,
      value,
      color: leaveTypeChartColor(name),
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
          employeeId: l.employeeId,
          avatar: (employees || []).find((e) => e.id === l.employeeId)?.avatar,
          name: l.employeeName,
          type: l.leaveType,
          dates: `${formatDate(l.startDate)} - ${formatDate(l.endDate)}`,
          days: l.days != null ? Number(l.days) : countDays(l.startDate, l.endDate),
          reason: l.reason,
        })),
    [leaves, employees]
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

  // Each card links to the screen the number describes, so the figure and the next action are the
  // same tap. The inactive count carries its own filter because "inactive" on its own is not a view.
  const kpiCards = [
    { labelKey: 'dashboard.totalEmployees', value: kpi.totalEmployees, icon: Users, change: null, accent: 'blue', to: '/employees' },
    { labelKey: 'dashboard.presentToday', value: kpi.presentToday, icon: CheckCircle, change: null, accent: 'emerald', subtext: `${kpi.onTimeToday} on time · ${kpi.lateToday} late`, to: '/attendance' },
    { labelKey: 'dashboard.inactive', value: kpi.inactive, icon: UserX, change: null, accent: 'amber', to: '/employees?status=Inactive' },
    { labelKey: 'dashboard.lateEmployees', value: kpi.lateToday, icon: Clock, change: null, accent: 'red', to: '/attendance?status=Late' },
    { labelKey: 'dashboard.attendanceRate', value: `${kpi.attendanceRate}%`, icon: TrendingUp, change: null, accent: 'purple', to: '/reports' },
  ];

  const attention = [
    { label: 'Leave requests to decide', count: pendingLeaveRequests.length, to: '/leave', icon: Calendar },
    { label: 'Overtime requests to decide', count: waiting.overtime, to: '/attendance?tab=overtime', icon: Clock },
    { label: 'Early clock-outs to review', count: waiting.early, to: '/attendance?view=early', icon: LogOut },
    { label: 'Timesheets to approve', count: waiting.timesheets, to: '/timesheets', icon: FileText },
  ];

  const visibleLeaveRequests = pendingLeaveRequests.slice(0, 5);
  const visibleSchedule = todaySchedule.slice(0, 5);

  if (loading) {
    return <SkeletonPage kpiCount={kpiCards.length} />;
  }

  return (
    <div className="max-w-7xl mx-auto space-y-7">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight">{t('dashboard.title')}</h1>
          <p className="text-sm text-gray-400 mt-1.5">{t('dashboard.subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 text-sm text-gray-500 bg-white px-4 py-2.5 rounded-xl border border-gray-100 shadow-sm">
            <Calendar className="w-4 h-4 text-gray-400" />
            <span className="font-medium">{formatDate(today)}</span>
          </div>
          {/* The presets and the button belong together: this range is what the export covers, and
              the button says so on its face rather than leaving a control that quietly changes
              something. The weekly-trend card below is fed by the analytics endpoint over its own
              window, so it is deliberately left alone rather than made to disagree with its own data. */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-gray-100 shadow-sm">
            {RANGE_OPTIONS.map((o) => (
              <button
                key={o.days}
                onClick={() => setRangeDays(o.days)}
                className={`px-3 py-1.5 pointer-coarse:py-2.5 rounded-lg text-xs font-medium transition-colors ${
                  rangeDays === o.days ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:bg-gray-50'
                }`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <Button variant="outline" size="md" icon={Download} onClick={exportRange}>
            Export CSV ({rangeDays} days)
          </Button>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6">
        {kpiCards.map((card) => (
          <KpiCard key={card.labelKey} {...card} label={t(card.labelKey)} />
        ))}
      </div>

      {/* Needs your attention: everything waiting for a decision, one click from the right page */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold text-gray-900">Needs your attention</h2>
          {pendingReady && attention.every((a) => a.count === 0) && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium"><CheckCircle2 className="w-4 h-4" /> Nothing is waiting for you</span>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {attention.map((a) => {
            const unknown = !pendingReady;
            return (
            <Link
              key={a.label}
              to={a.to}
              className={`group flex items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${unknown ? 'border-gray-100 bg-gray-50/50' : a.count > 0 ? 'border-amber-200 bg-amber-50/60 hover:bg-amber-50' : 'border-gray-100 bg-gray-50/50 hover:bg-gray-50'}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${!unknown && a.count > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-400'}`}>
                <a.icon className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                {unknown ? (
                  <>
                    <SkeletonLine className="h-6 w-8" />
                    <SkeletonLine className="h-3 w-24 mt-2" />
                  </>
                ) : (
                  <>
                    <p className={`text-2xl font-bold leading-none ${a.count > 0 ? 'text-gray-900' : 'text-gray-400'}`}>{a.count}</p>
                    <p className="text-xs text-gray-500 mt-1 truncate">{a.label}</p>
                  </>
                )}
              </div>
              <ArrowRight className="w-4 h-4 ml-auto text-gray-300 group-hover:text-blue-500 transition-colors" />
            </Link>
            );
          })}
        </div>
      </div>

      {/* Row 2: Charts - Attendance Overview (2/3, the wide one) + Leave Statistics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard
          title={t('dashboard.attendanceOverview')}
          badge={attendanceOverview.isCurrentWeek ? t('dashboard.thisWeek') : attendanceOverview.rangeLabel}
          badgeVariant="primary"
          className="lg:col-span-2"
        >
          <div className="h-[340px]">
            {!hasAttendanceData ? (
              <EmptyState message={t('dashboard.noData')} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={attendanceOverviewData}
                  barSize={32}
                  barGap={2}
                  barCategoryGap="18%"
                  margin={{ top: 8, right: 8, left: -12, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Legend iconType="square" iconSize={8} wrapperStyle={{ paddingTop: 16, fontSize: 12 }} />
                  {/* One Present bar, split into On Time and Late */}
                  <Bar dataKey="onTime" name="Present - On Time" stackId="present" fill={COLORS.emerald} />
                  <Bar dataKey="late" name="Present - Late" stackId="present" fill={COLORS.amber} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="earlyLeave" name="Early Leave" fill={COLORS.sky} radius={[6, 6, 0, 0]} />
                  <Bar dataKey="absent" name="Absent" fill={COLORS.red} radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </ChartCard>

        <ChartCard title={t('dashboard.leaveStatistics')} badge={t('dashboard.allTypes')} badgeVariant="info">
          <div className="h-[340px]">
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
                    paddingAngle={2}
                    stroke="#FFFFFF"
                    strokeWidth={2}
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
                    iconType="square"
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
                <BarChart data={weeklyAttendanceData} barSize={28} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                  <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                  <Tooltip content={<CustomTooltip />} cursor={{ fill: '#F1F5F9' }} />
                  <Bar dataKey="percentage" name="percentage" fill={COLORS.blue} radius={[6, 6, 0, 0]} />
                </BarChart>
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
                      <Avatar firstName={(request.name || '').split(' ')[0]} lastName={(request.name || '').split(' ')[1]} src={request.avatar} size="sm" className="mt-0.5" />
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
