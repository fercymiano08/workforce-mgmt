import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Users, CheckCircle, CalendarOff, Clock, Calendar, Briefcase, Check, X, ArrowRight, Inbox,
  FileText, LogOut, CheckCircle2, Download, ChevronLeft, ChevronRight, Activity, Smartphone,
  Database, Sparkles, Eye, Building2, Gift, Fingerprint, CalendarDays, FileBarChart,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import {
  BarChart, Bar, PieChart, Pie, Cell, LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  Legend,
} from 'recharts';
import Avatar from '../../components/ui/Avatar';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import KpiCard from '../../components/dashboard/KpiCard';
import ChartCard from '../../components/dashboard/ChartCard';
import { leaveTypeChartColorIn } from '../../constants/leaveTypes';
import { SkeletonLine, SkeletonPage } from '../../components/ui/LoadingSkeleton';
import { useLanguage } from '../../context/LanguageContext';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { chartTheme } from '../../constants/chartTheme';
import { useToast } from '../../context/ToastContext';
import { useNotifications } from '../../context/NotificationContext';
import {
  employeeService, attendanceService, leaveService, shiftService, analyticsService, overtimeService, timesheetService,
} from '../../services/api';
import { toDateKey } from '../../services/attendanceService';
import { kioskService } from '../../services/kioskService';
import { didAttend, isPresentGroup } from '../../utils/constants';
import { weekOf, weekWithRecords, dayTick, weekRangeLabel } from '../../utils/today';
import { formatDate } from '../../utils/helpers';
import { openAttendanceReport } from '../../utils/attendanceReport';
import Modal from '../../components/ui/Modal';
import { Textarea } from '../../components/ui/Input';

// How far back the report reaches, in whole weeks. Every option is inside the 35 days of attendance this
// page already loads (see the fetch below), so choosing one re-reads what is already in memory instead
// of asking the server again - the range costs no request and no wait.
const RANGE_OPTIONS = [
  { days: 7, label: '7 days', sub: '1 week' },
  { days: 14, label: '14 days', sub: '2 weeks' },
  { days: 21, label: '21 days', sub: '3 weeks' },
  { days: 28, label: '28 days', sub: '4 weeks' },
];

// Only 35 days of attendance are loaded below, so the week navigator cannot honestly go back
// further than that - 4 weeks back is the oldest week that chart has any data to draw.
const MAX_WEEKS_BACK = 4;

// App-icon shortcuts, same tile pattern the Employee dashboard already uses for its Quick Actions.
const QUICK_ACTIONS = [
  { label: 'Employees', hint: 'Roster & profiles', path: '/employees', icon: Users, tile: 'from-blue-500 to-blue-600 shadow-blue-500/25' },
  { label: 'Attendance', hint: 'Clock-ins & hours', path: '/attendance', icon: Fingerprint, tile: 'from-emerald-500 to-emerald-600 shadow-emerald-500/25' },
  { label: 'Schedule', hint: 'Shifts & coverage', path: '/shifts', icon: CalendarDays, tile: 'from-amber-500 to-orange-500 shadow-amber-500/25' },
  { label: 'Leave', hint: 'Requests & balances', path: '/leave', icon: Calendar, tile: 'from-purple-500 to-purple-600 shadow-purple-500/25' },
  { label: 'Timesheets', hint: 'Review & approve', path: '/timesheets', icon: FileText, tile: 'from-sky-500 to-cyan-600 shadow-sky-500/25' },
  { label: 'Reports', hint: 'Export & analyze', path: '/reports', icon: FileBarChart, tile: 'from-slate-500 to-slate-600 shadow-slate-500/25' },
];

// The one overall workforce score, as a ring. An SVG circle rather than a Recharts radial bar
// because it is a single value, not a series - the number in the middle is the whole point, and
// the gap is drawn from a fixed circumference so the stroke does not scale with the text.
const ScoreRing = ({ score, size = 160, stroke = 14, color = '#3B82F6', track = '#E2E8F0', suffix, suffixLabel = 'out of 100' }) => {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, Number(score) || 0));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circumference}
          strokeDashoffset={circumference - (pct / 100) * circumference}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-5xl font-bold text-gray-900 tabular-nums">{pct}{suffix || ''}</span>
        {!suffix && <span className="text-sm font-semibold text-gray-400 mt-0.5">{suffixLabel}</span>}
      </div>
    </div>
  );
};

const leaveTypeBadge = (type) => {
  // Same variants as leaveTypeVariant in pages/Employee/Leave.jsx, which the badge-only pages use.
  const map = {
    Vacation: 'primary', Sick: 'danger', Special: 'purple', Bereavement: 'indigo',
    Maternity: 'pink', Paternity: 'info', Unpaid: 'teal', Emergency: 'warning', 'Half Day': 'default',
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

// Days until the next occurrence of a month/day (a birthday or a hire-date anniversary), plus how
// many full years will have passed by then. Used for the "Upcoming Birthdays & Anniversaries" card.
const nextAnniversary = (dateStr, todayKeyStr) => {
  if (!dateStr) return null;
  const [origY, m, d] = dateStr.split('-').map(Number);
  const [ty, tm, td] = todayKeyStr.split('-').map(Number);
  const todayUtc = Date.UTC(ty, tm - 1, td);
  let targetYear = ty;
  let next = Date.UTC(ty, m - 1, d);
  if (next < todayUtc) {
    targetYear = ty + 1;
    next = Date.UTC(targetYear, m - 1, d);
  }
  return { days: Math.round((next - todayUtc) / 86400000), years: targetYear - origY };
};

export default function Dashboard() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { toast } = useToast();
  const { refresh: refreshNotifications } = useNotifications();
  const { isDark } = useTheme();
  const chart = chartTheme(isDark);
  const COLORS = chart.colors;

  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [shiftDefs, setShiftDefs] = useState([]);
  const [timesheets, setTimesheets] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  // The same This Week figure Workforce Analytics itself shows and explains (present days ÷
  // scheduled days) - one source of truth, so the number here can never quietly disagree with the
  // card that states its formula.
  const [workforceRate, setWorkforceRate] = useState(null);
  // How far back the exported report reaches (chosen in the Export dialog - it changes nothing else on this page).
  const [rangeDays, setRangeDays] = useState(7);
  const [exportOpen, setExportOpen] = useState(false);
  // Things waiting for a decision from the administrator, other than leave (which is already loaded)
  // These arrive on their own now, so they start as null - "unknown" - rather than 0. Saying zero when
  // the answer has not loaded yet would tell the administrator they are all caught up when they are not.
  const [waiting, setWaiting] = useState({ overtime: null, early: null, timesheets: null });
  const [pendingReady, setPendingReady] = useState(false);

  // Which week the attendance overview chart shows - 0 is the current Mon-Sun week. It starts
  // wherever the chevrons leave it, but the very first paint lands on the most recent week that
  // actually has a record (weekWithRecords) rather than always the current one - otherwise the
  // chart opens empty every time the current week has not logged anything yet (e.g. first thing
  // Monday morning), which used to be exactly what the auto-selecting version before this existed
  // to avoid.
  const [weeksBack, setWeeksBack] = useState(0);
  const weeksBackInitialized = useRef(false);
  useEffect(() => {
    if (weeksBackInitialized.current || attendance.length === 0) return;
    weeksBackInitialized.current = true;
    setWeeksBack(weekWithRecords(attendance.map((a) => a.date)).weeksBack);
  }, [attendance]);

  // The live "System Health" KPI and the Decision Support overview both read this one poll - the
  // cheap, non-AI half of the Workforce Health Score (score + findings + a rule-based summary, no
  // Gemini call anywhere in it). Loading the dashboard used to also fetch the full, AI-backed
  // /ai/insights endpoint, which can mean a live model call sharing the same small worker pool as
  // everything else the page loads at once - that was the actual cause of the whole page (System
  // Health, Decision Support, even the unrelated Database Health poll) feeling slow or stuck, not
  // any one of those widgets individually. The full AI-written briefing still exists - it is what
  // the AI Decision Support tab itself asks for - this dashboard just never needs to be the one
  // that pays for or waits behind it.
  const [healthScore, setHealthScore] = useState(null);
  const [healthScoreError, setHealthScoreError] = useState(false);
  // A rolling window of Postgres round-trip times for the Database Health graph - never persisted,
  // just the last ~30 polls kept in memory so the line has something to draw.
  const [dbHealth, setDbHealth] = useState([]);
  const [dbHealthError, setDbHealthError] = useState(false);
  const [kioskSettings, setKioskSettings] = useState(kioskService.getSettings());

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

    // Still paints as each result lands rather than waiting on the slowest - but staggered into
    // small waves instead of firing all 13 requests in the same instant. Measured directly against
    // the real backend: firing them all at once queued one request past 12 seconds (the free plan
    // runs PHP's built-in dev server, a handful of workers shared by everything the page loads at
    // once) - long enough that a proxy in front of it can and does kill the connection outright
    // (ERR_CONNECTION_CLOSED in devtools), not just feel slow. A few hundred ms of stagger costs
    // nothing visible and gives the worker pool room to actually finish each wave before the next.
    const wave = (fns, delay) => fns.forEach((fn) => setTimeout(() => { if (active) fn(); }, delay));

    wave([
      () => load(employeeService.getAll(), (res) => { setEmployees(res); criticalDone(); }, []),
      // The dashboard only shows today and the last 35 days.
      () => load(
        attendanceService.getAll({ from: (() => { const d = kioskService.now(); d.setDate(d.getDate() - 35); return toDateKey(d); })() }),
        (res) => { setAttendance(res); criticalDone(); },
        []
      ),
      () => load(leaveService.getAll(), (res) => { setLeaves(res); pendingDone(); }, []),
    ], 0);

    wave([
      () => load(shiftService.getSchedules(), setSchedules, []),
      () => load(shiftService.getAllShifts(), setShiftDefs, []),
      () => load(analyticsService.getAll(), setAnalytics, null),
    ], 350);

    wave([
      () => {
        // "This Week" is the freshest window, but a brand-new week (e.g. first thing Monday)
        // genuinely has no scheduled days counted yet - fall back to the month so this card never
        // opens on a guaranteed-empty window just because of what day it happens to be.
        analyticsService.getWorkforce('week')
          .then((res) => (res?.attendanceRate?.scheduledDays ? res : analyticsService.getWorkforce('month')))
          .then((res) => { if (active) setWorkforceRate(res); })
          .catch(() => { if (active) setWorkforceRate(null); });
      },
      () => load(
        overtimeService.getAll(),
        (ot) => {
          setWaiting((w) => ({ ...w, overtime: (ot || []).filter((r) => r.status === 'Pending').length }));
          pendingDone();
        },
        () => pendingDone()
      ),
    ], 700);

    wave([
      // /attendance/early-outs/pending returns an object of the form { pending: N }
      () => load(
        attendanceService.getEarlyClockOutsPending(),
        (early) => {
          setWaiting((w) => ({ ...w, early: Number(early && typeof early === 'object' ? early.pending ?? 0 : 0) || 0 }));
          pendingDone();
        },
        () => pendingDone()
      ),
      () => load(
        timesheetService.getAll(),
        (sheets) => {
          setTimesheets(sheets || []);
          setWaiting((w) => ({ ...w, timesheets: (sheets || []).filter((s) => s.status === 'Submitted').length }));
          pendingDone();
        },
        () => pendingDone()
      ),
    ], 1050);

    wave([
      // Fire-and-forget: checks for no-shows, un-closed-out attendance, and staffing shortage risk,
      // and creates notifications for any found. Never allowed to break the dashboard if it fails.
      () => attendanceService.checkAlerts().then(() => refreshNotifications()).catch(() => {}),
      () => kioskService.load().then((settings) => { if (active) setKioskSettings(settings); }),
    ], 1400);

    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The System Health tile: the cheap, non-AI score, re-asked every 30s so the number on screen is
  // genuinely live rather than a single snapshot from page load. Two consecutive failures (not one -
  // a single dropped request on a free-tier host is normal, not an outage) flip this to an explicit
  // error state, so a real problem reads as "couldn't reach the server," never as a skeleton that
  // quietly never resolves.
  useEffect(() => {
    let active = true;
    let misses = 0;
    const poll = () => analyticsService.getHealthScore()
      .then((res) => {
        if (!active) return;
        misses = 0;
        setHealthScoreError(false);
        setHealthScore(res?.data || null);
      })
      .catch(() => {
        if (!active) return;
        misses += 1;
        if (misses >= 2) setHealthScoreError(true);
      });
    // Offset from the main load effect's first wave (0ms) so this doesn't stack another
    // simultaneous request on top of it at the exact instant the page mounts.
    const first = setTimeout(poll, 500);
    const id = setInterval(poll, 30000);
    return () => { active = false; clearTimeout(first); clearInterval(id); };
  }, []);

  // The Database Health graph: a fresh round trip every ~10s, each one appended to a capped rolling
  // window so the line scrolls the way a Task Manager graph does. Slower than it reads as "live" -
  // the free-tier backend runs PHP's built-in dev server with a handful of workers, shared with
  // everything else the dashboard loads; polling any faster adds a standing request every few
  // seconds for the life of the page, on top of the double-digit ones the page already fires on
  // load, for no visible benefit (latency here does not meaningfully change second to second).
  useEffect(() => {
    let active = true;
    let misses = 0;
    const poll = () => analyticsService.getDbHealth()
      .then((res) => {
        if (!active || !res?.data) return;
        misses = 0;
        setDbHealthError(false);
        setDbHealth((prev) => [...prev.slice(-29), { ...res.data, t: Date.now() }]);
      })
      .catch(() => {
        if (!active) return;
        misses += 1;
        if (misses >= 2) setDbHealthError(true);
      });
    // Same offset reasoning as the System Health poll just above.
    const first = setTimeout(poll, 1050);
    const id = setInterval(poll, 10000);
    return () => { active = false; clearTimeout(first); clearInterval(id); };
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
    // The daily rows come from the same records as the cards above, so the report and the screen agree.
    const opened = openAttendanceReport({ rows: dailyRange, days: rangeDays, preparedBy: user?.firstName ? `${user.firstName} ${user.lastName || ''}`.trim() : '' });
    if (!opened) {
      toast.error('Pop-up blocked', 'Allow pop-ups for this site, then try the export again.');
      return;
    }
    setExportOpen(false);
    toast.success('Report ready', `Attendance for the last ${rangeDays} days opened - choose “Save as PDF”.`);
  };

  const kpi = useMemo(() => {
    // Present = everyone who came in, split into On Time and Late. Early Leave is counted on its own.
    const onTimeToday = todaysAttendance.filter((a) => a.status === 'Present').length;
    const presentToday = todaysAttendance.filter((a) => isPresentGroup(a.status)).length;
    const lateToday = todaysAttendance.filter((a) => a.status === 'Late').length;

    return { totalEmployees: employees.length, presentToday, onTimeToday, lateToday };
  }, [employees, todaysAttendance]);

  // Seven days, Monday through Sunday, for whichever week weeksBack points at (0 = current week) -
  // bounded by MAX_WEEKS_BACK since that is as far back as the attendance fetch above actually reaches.
  const attendanceOverview = useMemo(() => {
    const [y, m, d] = weekOf(today).start.split('-').map(Number);
    const monday = new Date(Date.UTC(y, m - 1, d - 7 * weeksBack));
    const weekDays = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86400000).toISOString().slice(0, 10));

    const byDate = new Map();
    attendance.forEach((a) => {
      if (!byDate.has(a.date)) byDate.set(a.date, []);
      byDate.get(a.date).push(a);
    });

    const rows = weekDays.map((key) => {
      const recs = byDate.get(key) || [];
      return {
        key,
        day: dayTick(key),
        onTime: recs.filter((a) => a.status === 'Present').length,
        late: recs.filter((a) => a.status === 'Late').length,
        earlyLeave: recs.filter((a) => a.status === 'Early Leave').length,
        absent: recs.filter((a) => a.status === 'Absent').length,
      };
    });

    return { rows, isCurrentWeek: weeksBack === 0, rangeLabel: weekRangeLabel(weekDays[0], weekDays[6]) };
  }, [attendance, today, weeksBack]);

  const attendanceOverviewData = attendanceOverview.rows;
  const hasAttendanceData = attendanceOverviewData.some((d) => d.onTime || d.late || d.earlyLeave || d.absent);

  const leaveStatisticsData = useMemo(() => {
    const byType = {};
    leaves.forEach((l) => {
      byType[l.leaveType] = (byType[l.leaveType] || 0) + 1;
    });
    return Object.entries(byType).map(([name, value]) => ({
      name,
      value,
      color: leaveTypeChartColorIn(name, isDark),
    }));
  }, [leaves, isDark]);

  const monthlyAttendanceData = useMemo(() => {
    const trend = analytics?.attendanceTrend || [];
    return trend.map((row) => ({ week: row.month, percentage: row.rate ?? 0 }));
  }, [analytics]);

  const attendanceRate = workforceRate?.attendanceRate || null;

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

  const handleLeaveDecision = async (requestId, status, comments) => {
    const approvedBy = user ? `${user.firstName} ${user.lastName}` : 'HR Admin';
    try {
      await leaveService.updateStatus(requestId, status, approvedBy, comments);
      setLeaves((prev) => prev.map((l) => (l.id === requestId ? { ...l, status, approvedBy, comments } : l)));
      toast.success(
        status === 'Approved' ? 'Leave Approved' : 'Leave Rejected',
        `Leave request has been ${status.toLowerCase()}.`
      );
    } catch {
      toast.error('Error', `Failed to ${status === 'Approved' ? 'approve' : 'reject'} leave request.`);
    }
  };

  // Rejecting always needs a reason - same rule as Leave Management, enforced here too so a quick
  // rejection from the Dashboard can never skip it.
  const [rejectTarget, setRejectTarget] = useState(null);
  const [rejectReason, setRejectReason] = useState('');
  const [rejectError, setRejectError] = useState('');
  const openReject = (request) => {
    setRejectTarget(request);
    setRejectReason('');
    setRejectError('');
  };
  const confirmReject = async () => {
    if (rejectReason.trim().length < 5) {
      setRejectError('Please explain why this request is being rejected (at least a few words).');
      return;
    }
    await handleLeaveDecision(rejectTarget.id, 'Rejected', rejectReason.trim());
    setRejectTarget(null);
  };

  // Pending timesheets: a short list with a "View" action, rather than instant accept/reject - a
  // panel review asked for a proper confirmation step before either decision commits.
  const pendingTimesheetsAll = useMemo(() => timesheets.filter((ts) => ts.status === 'Submitted'), [timesheets]);
  const pendingTimesheets = pendingTimesheetsAll.slice(0, 5);
  const approvedTimesheetsCount = useMemo(() => timesheets.filter((ts) => ts.status === 'Approved').length, [timesheets]);

  const [tsViewTarget, setTsViewTarget] = useState(null);
  const [tsRejecting, setTsRejecting] = useState(false);
  const [tsReason, setTsReason] = useState('');
  const [tsReasonError, setTsReasonError] = useState('');
  const [tsBusy, setTsBusy] = useState(false);

  const openTimesheetView = (ts) => {
    setTsViewTarget(ts);
    setTsRejecting(false);
    setTsReason('');
    setTsReasonError('');
  };
  const closeTimesheetView = () => setTsViewTarget(null);

  const approveTimesheet = async () => {
    const approvedBy = user ? `${user.firstName} ${user.lastName}` : 'HR Admin';
    setTsBusy(true);
    try {
      await timesheetService.updateStatus(tsViewTarget.id, 'Approved', approvedBy);
      setTimesheets((prev) => prev.map((ts) => (ts.id === tsViewTarget.id ? { ...ts, status: 'Approved' } : ts)));
      toast.success('Timesheet Approved', `${tsViewTarget.employeeName}'s timesheet has been approved.`);
      closeTimesheetView();
    } catch {
      toast.error('Error', 'Failed to approve timesheet.');
    } finally {
      setTsBusy(false);
    }
  };

  const confirmRejectTimesheet = async () => {
    if (tsReason.trim().length < 5) {
      setTsReasonError('Please explain why this timesheet is being rejected (at least a few words).');
      return;
    }
    setTsBusy(true);
    try {
      await timesheetService.updateStatus(tsViewTarget.id, 'Rejected', undefined, tsReason.trim());
      setTimesheets((prev) => prev.map((ts) => (ts.id === tsViewTarget.id ? { ...ts, status: 'Rejected' } : ts)));
      toast.success('Timesheet Rejected', `${tsViewTarget.employeeName}'s timesheet has been rejected.`);
      closeTimesheetView();
    } catch {
      toast.error('Error', 'Failed to reject timesheet.');
    } finally {
      setTsBusy(false);
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

  // Every active employee's department, as a share of headcount - reuses the roster already loaded
  // for the KPI cards, no new request.
  const departmentDistribution = useMemo(() => {
    const counts = {};
    employees.forEach((e) => {
      if (e.department) counts[e.department] = (counts[e.department] || 0) + 1;
    });
    const total = employees.length || 1;
    return Object.entries(counts)
      .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 1000) / 10 }))
      .sort((a, b) => b.count - a.count);
  }, [employees]);

  // Birthdays and hire-date anniversaries landing in the next two weeks, soonest first.
  const upcomingEvents = useMemo(() => {
    const events = [];
    employees.forEach((e) => {
      const name = `${e.firstName || ''} ${e.lastName || ''}`.trim();
      const birthday = nextAnniversary(e.dateOfBirth, today);
      if (birthday && birthday.days <= 14) {
        events.push({ id: `b-${e.id}`, name, avatar: e.avatar, label: 'Birthday', days: birthday.days });
      }
      const anniversary = nextAnniversary(e.hireDate, today);
      if (anniversary && anniversary.days <= 14 && anniversary.years > 0) {
        events.push({ id: `a-${e.id}`, name, avatar: e.avatar, label: `${anniversary.years}-year anniversary`, days: anniversary.days });
      }
    });
    return events.sort((a, b) => a.days - b.days).slice(0, 5);
  }, [employees, today]);

  // Each card links to the screen the number describes, so the figure and the next action are the
  // same click. Replaces the old Total Employees / Late Employees / Attendance Rate set - a panel
  // review asked these to surface what needs a decision and how healthy the workforce looks right now.
  const kpiCards = [
    { label: 'Pending Leave Requests', value: pendingLeaveRequests.length, icon: Calendar, accent: 'blue', to: '/leave' },
    { label: 'Timesheets Approved', value: approvedTimesheetsCount, icon: FileText, accent: 'emerald', to: '/timesheets?status=Approved' },
    { label: t('dashboard.presentToday'), value: kpi.presentToday, icon: CheckCircle, accent: 'purple', subtext: `${kpi.onTimeToday} on time · ${kpi.lateToday} late`, to: '/attendance' },
    {
      label: 'System Health',
      value: healthScore ? `${healthScore.healthScore}%` : '—',
      icon: Activity,
      accent: healthScoreError ? 'red' : healthScore && healthScore.healthScore < 50 ? 'red' : 'emerald',
      subtext: healthScoreError ? "Couldn't reach the server - retrying" : healthScore ? 'Live · updates every 30s' : 'Loading…',
      to: '/analytics?tab=ai',
    },
  ];

  const attention = [
    { label: 'Leave requests to decide', count: pendingLeaveRequests.length, to: '/leave', icon: Calendar },
    { label: 'Overtime requests to decide', count: waiting.overtime, to: '/attendance?tab=overtime', icon: Clock },
    { label: 'Early clock-outs to review', count: waiting.early, to: '/attendance?view=early', icon: LogOut },
    { label: 'Timesheets to approve', count: waiting.timesheets, to: '/timesheets', icon: FileText },
  ];

  const visibleLeaveRequests = pendingLeaveRequests.slice(0, 5);
  const visibleSchedule = todaySchedule.slice(0, 5);

  // Database Health: colour and label follow the most recent reading, same status-colour convention
  // (emerald/amber/red) used everywhere else on this page.
  const latestDbHealth = dbHealth[dbHealth.length - 1];
  const dbHealthColor = !latestDbHealth || !latestDbHealth.connected
    ? COLORS.red
    : latestDbHealth.latencyMs < 30 ? COLORS.emerald : latestDbHealth.latencyMs < 100 ? COLORS.amber : COLORS.red;
  const dbHealthLabel = dbHealthError && !latestDbHealth
    ? "Can't reach server"
    : !latestDbHealth
      ? 'Measuring…'
      : !latestDbHealth.connected ? 'Disconnected' : latestDbHealth.latencyMs < 30 ? 'Healthy' : latestDbHealth.latencyMs < 100 ? 'Elevated' : 'Slow';
  const dbHealthBadgeVariant = dbHealthError && !latestDbHealth
    ? 'danger'
    : !latestDbHealth
      ? 'default'
      : !latestDbHealth.connected ? 'danger' : latestDbHealth.latencyMs < 30 ? 'success' : latestDbHealth.latencyMs < 100 ? 'warning' : 'danger';

  if (loading) {
    return <SkeletonPage kpiCount={kpiCards.length} />;
  }

  return (
    <div className="space-y-7">
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
          {/* Kiosk status, at a glance - the pulsing dot is the "is it really on" cue, not just the label. */}
          <Link
            to="/kiosk-setup"
            className={`flex items-center gap-2 text-sm px-4 py-2.5 rounded-xl border shadow-sm transition-colors ${
              kioskSettings.active ? 'bg-emerald-50 border-emerald-100 text-emerald-700 hover:bg-emerald-100' : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'
            }`}
          >
            <Smartphone className="w-4 h-4" />
            <span className={`w-1.5 h-1.5 rounded-full ${kioskSettings.active ? 'bg-emerald-500 animate-pulse' : 'bg-gray-400'}`} />
            <span className="font-medium">{kioskSettings.active ? 'Kiosk Active' : 'Kiosk Inactive'}</span>
          </Link>
          <Button variant="outline" size="md" icon={Download} onClick={() => setExportOpen(true)}>
            Export report
          </Button>
        </div>
      </div>

      {/* Row 1: KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiCards.map((card) => (
          <KpiCard key={card.label} {...card} />
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

      {/* Quick actions - the same phone-app-icon tiles the Employee dashboard uses, so Employees,
          Attendance, Schedule, Leave, Timesheets and Reports are each one tap away. */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
        <h2 className="text-base font-semibold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.label}
              to={action.path}
              className="group flex flex-col items-center justify-center gap-1.5 p-3 rounded-2xl border border-gray-100 bg-gray-50/60 hover:bg-white hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all duration-200 text-center"
            >
              <span className={`w-11 h-11 rounded-xl bg-gradient-to-br ${action.tile} shadow-md flex items-center justify-center group-hover:scale-105 transition-transform duration-200`}>
                <action.icon className="w-5 h-5 text-white" />
              </span>
              <span className="text-[13px] font-semibold text-gray-900 leading-tight">{action.label}</span>
              <span className="text-[10px] text-gray-400 leading-tight hidden sm:block">{action.hint}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Row: Attendance Overview (2/3, with a week navigator) + Leave Statistics (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 overflow-hidden h-[380px] flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
            <h3 className="text-base font-semibold text-gray-900 tracking-tight">{t('dashboard.attendanceOverview')}</h3>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                aria-label="Previous week"
                disabled={weeksBack >= MAX_WEEKS_BACK}
                onClick={() => setWeeksBack((w) => w + 1)}
                className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent flex items-center justify-center"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <Badge variant="primary" size="sm">{attendanceOverview.isCurrentWeek ? `${t('dashboard.thisWeek')} · ${attendanceOverview.rangeLabel}` : attendanceOverview.rangeLabel}</Badge>
              <button
                type="button"
                aria-label="Next week"
                disabled={weeksBack === 0}
                onClick={() => setWeeksBack((w) => Math.max(0, w - 1))}
                className="w-7 h-7 rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:hover:bg-transparent flex items-center justify-center"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 min-h-0">
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
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: chart.axis }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: chart.axis }} />
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
        </div>

        <ChartCard title={t('dashboard.leaveStatistics')} badge={t('dashboard.allTypes')} badgeVariant="info" className="h-[380px]">
          <div className="h-[300px]">
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
                    stroke={chart.sliceBorder}
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

      {/* Row: Monthly Trend (text, not a chart) + Attendance Rate ring + Decision Support overview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <ChartCard title="Monthly Attendance Trend" badge={t('dashboard.overall')} badgeVariant="success">
          <div className="h-[320px] overflow-y-auto">
            {monthlyAttendanceData.length === 0 ? (
              <EmptyState message={t('dashboard.noData')} />
            ) : (
              <div className="space-y-4 py-1">
                {monthlyAttendanceData.map((row) => (
                  <div key={row.week} className="flex items-center gap-4">
                    <span className="w-14 text-sm font-medium text-gray-500 shrink-0">{row.week}</span>
                    <div className="flex-1 h-2.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${Math.min(100, row.percentage)}%`,
                          backgroundColor: row.percentage >= 90 ? COLORS.emerald : row.percentage >= 75 ? COLORS.blue : row.percentage >= 50 ? COLORS.amber : COLORS.red,
                        }}
                      />
                    </div>
                    <span className="w-12 text-right text-sm font-bold text-gray-900 tabular-nums">{row.percentage}%</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </ChartCard>

        <ChartCard title={t('dashboard.attendanceRate')} badge={workforceRate?.period?.label || t('dashboard.thisWeek')} badgeVariant="purple">
          <div className="h-[320px]">
            {!attendanceRate || attendanceRate.scheduledDays === 0 ? (
              <EmptyState message={t('dashboard.noData')} />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-3 px-2">
                <ScoreRing score={attendanceRate.rate} size={190} stroke={17} color={COLORS.blue} track={chart.grid} suffix="%" />
                <p className="text-xs text-gray-500">
                  {attendanceRate.presentDays} present of {attendanceRate.scheduledDays} scheduled days
                </p>
                <div className="w-full max-w-sm h-14">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={attendanceRate.trend} margin={{ top: 4, left: 0, right: 0, bottom: 0 }}>
                      <Tooltip cursor={{ stroke: chart.grid }} contentStyle={chart.tooltipStyle} formatter={(v) => [`${v}%`, 'Rate']} />
                      <Line type="monotone" dataKey="rate" stroke={COLORS.blue} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="text-[11px] text-gray-400 text-center max-w-xs">
                  Present days ÷ scheduled days (approved leave excluded) — the same figure Workforce Analytics explains.
                </p>
              </div>
            )}
          </div>
        </ChartCard>

        {/* Decision Support overview - the cheap score plus the top open findings (rule-based
            wording, same facts, no Gemini call), with the AI-written briefing and the full queue
            left to the AI Decision Support tab itself. */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 overflow-hidden h-[386px] flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-4 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                <Sparkles className="w-4.5 h-4.5 text-violet-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 tracking-tight">Decision Support</h3>
            </div>
            <Link to="/analytics?tab=ai" className="text-xs font-semibold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1 shrink-0">
              View all <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>
          {healthScoreError && !healthScore ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center px-4">
              <p className="text-sm font-semibold text-gray-900">Couldn't reach the server</p>
              <p className="text-xs text-gray-400 mt-1">Retrying automatically every 30s.</p>
            </div>
          ) : !healthScore ? (
            <div className="flex-1 flex items-center justify-center">
              <SkeletonLine className="h-24 w-24 rounded-full" />
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 mb-4 shrink-0">
                <ScoreRing score={healthScore.healthScore} size={88} stroke={9} color={healthScore.healthScore < 50 ? COLORS.red : COLORS.emerald} track={chart.grid} suffixLabel="Health" />
                <p className="text-xs text-gray-500 flex-1">{healthScore.summary}</p>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-2">
                {(healthScore.insights || []).filter((i) => i.severity !== 'success').slice(0, 3).map((i) => (
                  <div key={i.id} className="flex items-start gap-2.5 rounded-xl bg-gray-50/70 border border-gray-100 px-3 py-2.5">
                    <Badge variant={i.severity === 'critical' ? 'danger' : i.severity === 'warning' ? 'warning' : 'info'} size="xs">{i.severity}</Badge>
                    <p className="text-xs text-gray-700 leading-snug">{i.title}</p>
                  </div>
                ))}
                {(healthScore.insights || []).filter((i) => i.severity !== 'success').length === 0 && (
                  <p className="text-xs text-gray-400 text-center py-4">Nothing flagged right now.</p>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Row: Pending Leave Requests + Pending Timesheets + Today's Schedule */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* Pending Leave Requests */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[560px]">
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
                    <Button variant="dangerOutline" size="xs" icon={X} onClick={() => openReject(request)}>
                      {t('dashboard.reject')}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Pending Timesheets - View opens a modal with Approve / Reject, rather than deciding instantly */}
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden flex flex-col h-[560px]">
          <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3 flex-shrink-0">
            <h3 className="text-base font-semibold text-gray-900 tracking-tight">Pending Timesheets</h3>
            <div className="flex items-center gap-3">
              {pendingTimesheetsAll.length > 5 && (
                <Link
                  to="/timesheets"
                  className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
                >
                  {t('dashboard.viewAll')}
                  <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              )}
              <Badge variant="warning" size="sm">{pendingTimesheetsAll.length} pending</Badge>
            </div>
          </div>
          <div className="divide-y divide-gray-100/70 flex-1 overflow-y-auto overflow-x-hidden">
            {pendingTimesheets.length === 0 ? (
              <EmptyState message="No timesheets waiting for review." />
            ) : (
              pendingTimesheets.map((ts) => (
                <div key={ts.id} className="px-6 py-4 hover:bg-gray-50 transition-colors flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-gray-900 truncate">{ts.employeeName}</p>
                    <p className="text-xs text-gray-500 mt-1">{formatDate(ts.weekStart)} – {formatDate(ts.weekEnd)}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{Number(ts.totalHours || 0).toFixed(1)}h total</p>
                  </div>
                  <Button variant="outline" size="xs" icon={Eye} onClick={() => openTimesheetView(ts)} className="shrink-0">
                    View
                  </Button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Today's Schedule */}
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

      {/* Row: Database Health (live graph, 2/3) + Department Headcount & Upcoming Events (1/3) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
        {/* h-full, not a fixed height - items-stretch already makes this row as tall as the
            Department Headcount + Upcoming Events column beside it; this card should fill that,
            not stop short of it and leave empty card below the chart. */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-sm p-6 overflow-hidden h-full min-h-[320px] flex flex-col">
          <div className="flex items-center justify-between gap-3 mb-3 shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0">
                <Database className="w-4.5 h-4.5 text-blue-500" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-gray-900 tracking-tight">Database Health</h3>
                <p className="text-xs text-gray-400 mt-0.5">Live Postgres round-trip time</p>
              </div>
            </div>
            <Badge variant={dbHealthBadgeVariant} size="sm" dot>{dbHealthLabel}</Badge>
          </div>
          <div className="flex-1 min-h-0">
            {dbHealth.length < 2 ? (
              <EmptyState message={dbHealthError ? "Couldn't reach the server - retrying automatically." : 'Measuring…'} />
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={dbHealth} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <defs>
                    <linearGradient id="dbHealthFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={dbHealthColor} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={dbHealthColor} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                  <YAxis hide domain={[0, (max) => Math.max(40, Math.ceil(max * 1.2))]} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (active && payload && payload.length) {
                        const p = payload[0].payload;
                        return (
                          <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3">
                            <p className="text-sm font-semibold text-gray-900">{p.connected ? `${p.latencyMs}ms` : 'Disconnected'}</p>
                            <p className="text-xs text-gray-500">{new Date(p.t).toLocaleTimeString()}</p>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area type="monotone" dataKey="latencyMs" stroke={dbHealthColor} strokeWidth={2} fill="url(#dbHealthFill)" dot={false} animationDuration={300} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center shrink-0">
                <Building2 className="w-4.5 h-4.5 text-indigo-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 tracking-tight">Department Headcount</h3>
            </div>
            {departmentDistribution.length === 0 ? (
              <EmptyState message={t('dashboard.noData')} />
            ) : (
              <div className="space-y-3">
                {departmentDistribution.map((d) => (
                  <div key={d.name} className="flex items-center gap-3">
                    <span className="w-24 text-xs text-gray-600 truncate" title={d.name}>{d.name}</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 rounded-full" style={{ width: `${d.pct}%` }} />
                    </div>
                    <span className="w-6 text-right text-xs font-semibold text-gray-900">{d.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-pink-50 flex items-center justify-center shrink-0">
                <Gift className="w-4.5 h-4.5 text-pink-500" />
              </div>
              <h3 className="text-base font-semibold text-gray-900 tracking-tight">Upcoming Birthdays &amp; Anniversaries</h3>
            </div>
            {upcomingEvents.length === 0 ? (
              <EmptyState message="Nothing in the next two weeks." />
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((ev) => (
                  <div key={ev.id} className="flex items-center gap-3">
                    <Avatar firstName={ev.name.split(' ')[0]} lastName={ev.name.split(' ')[1]} src={ev.avatar} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{ev.name}</p>
                      <p className="text-xs text-gray-500">{ev.label}</p>
                    </div>
                    <span className="text-xs font-semibold text-gray-400 shrink-0">{ev.days === 0 ? 'Today' : `${ev.days}d`}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Export report: the range is chosen here and applies to the report only. */}
      <Modal isOpen={exportOpen} onClose={() => setExportOpen(false)} title="Export attendance report" size="md">
        <div className="space-y-5">
          <p className="text-sm text-gray-600">
            Pick how far back the report goes. It opens as a designed PDF with a summary, a daily chart and a day-by-day table.
          </p>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Report range">
            {RANGE_OPTIONS.map((o) => (
              <button
                key={o.days}
                type="button"
                role="radio"
                aria-checked={rangeDays === o.days}
                onClick={() => setRangeDays(o.days)}
                className={`text-left rounded-xl border px-4 py-3 transition-all ${
                  rangeDays === o.days ? 'border-blue-500 bg-blue-50 ring-2 ring-blue-500/20' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                }`}
              >
                <span className={`block text-base font-semibold ${rangeDays === o.days ? 'text-blue-700' : 'text-gray-900'}`}>{o.label}</span>
                <span className="block text-xs text-gray-500">{o.sub}</span>
              </button>
            ))}
          </div>
          <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3 text-sm text-gray-700">
            <span className="text-gray-500">Covers </span>
            <span className="font-semibold">
              {formatDate(toDateKey((() => { const d = new Date(today); d.setDate(d.getDate() - (rangeDays - 1)); return d; })()))}
            </span>
            <span className="text-gray-500"> to </span>
            <span className="font-semibold">{formatDate(today)}</span>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" onClick={() => setExportOpen(false)}>Cancel</Button>
            <Button icon={Download} onClick={exportRange}>Create PDF report</Button>
          </div>
        </div>
      </Modal>

      {/* Reject reason: required, same rule as Leave Management - a rejection must say why. */}
      <Modal isOpen={!!rejectTarget} onClose={() => setRejectTarget(null)} title="Reject leave request" size="sm">
        {rejectTarget && (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Rejecting <span className="font-semibold text-gray-900">{rejectTarget.name}</span>'s {rejectTarget.type} leave request ({rejectTarget.dates}).
            </p>
            <Textarea
              label="Reason for rejection"
              placeholder="Tell the employee why this request is being rejected..."
              rows={3}
              autoFocus
              value={rejectReason}
              onChange={(e) => { setRejectReason(e.target.value); setRejectError(''); }}
              error={rejectError}
            />
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" onClick={() => setRejectTarget(null)}>Cancel</Button>
              <Button variant="danger" icon={X} onClick={confirmReject}>Reject Request</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Timesheet: View opens here, Approve is immediate, Reject reveals the required-reason step
          in place rather than a second modal. */}
      <Modal isOpen={!!tsViewTarget} onClose={closeTimesheetView} title="Timesheet request" size="sm">
        {tsViewTarget && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <Avatar firstName={(tsViewTarget.employeeName || '').split(' ')[0]} lastName={(tsViewTarget.employeeName || '').split(' ')[1]} size="sm" />
              <div>
                <p className="text-sm font-semibold text-gray-900">{tsViewTarget.employeeName}</p>
                <p className="text-xs text-gray-500">{formatDate(tsViewTarget.weekStart)} – {formatDate(tsViewTarget.weekEnd)}</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="rounded-xl bg-gray-50 border border-gray-100 py-3">
                <p className="text-lg font-bold text-gray-900">{Number(tsViewTarget.regularHours || 0).toFixed(1)}h</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Regular</p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 py-3">
                <p className="text-lg font-bold text-gray-900">{Number(tsViewTarget.overtimeHours || 0).toFixed(1)}h</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Overtime</p>
              </div>
              <div className="rounded-xl bg-gray-50 border border-gray-100 py-3">
                <p className="text-lg font-bold text-gray-900">{Number(tsViewTarget.totalHours || 0).toFixed(1)}h</p>
                <p className="text-[11px] text-gray-500 mt-0.5">Total</p>
              </div>
            </div>

            {tsRejecting ? (
              <>
                <Textarea
                  label="Reason for rejection"
                  placeholder="Tell the employee why this timesheet is being rejected..."
                  rows={3}
                  autoFocus
                  value={tsReason}
                  onChange={(e) => { setTsReason(e.target.value); setTsReasonError(''); }}
                  error={tsReasonError}
                />
                <div className="flex justify-end gap-2 pt-1">
                  <Button variant="outline" onClick={() => setTsRejecting(false)} disabled={tsBusy}>Back</Button>
                  <Button variant="danger" icon={X} onClick={confirmRejectTimesheet} loading={tsBusy}>Reject Timesheet</Button>
                </div>
              </>
            ) : (
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="outline" onClick={closeTimesheetView} disabled={tsBusy}>Cancel</Button>
                <Button variant="dangerOutline" icon={X} onClick={() => setTsRejecting(true)} disabled={tsBusy}>Reject</Button>
                <Button variant="success" icon={Check} onClick={approveTimesheet} loading={tsBusy}>Approve</Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
