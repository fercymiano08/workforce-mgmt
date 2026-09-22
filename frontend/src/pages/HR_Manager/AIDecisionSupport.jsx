import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Brain, AlertTriangle, AlertCircle, Info, CheckCircle2, XCircle,
  CalendarCheck, Clock, Timer, Palmtree, CalendarDays, Users,
  Sparkles, RefreshCw, Inbox, ShieldAlert, Lock, WifiOff,
  Zap, LayoutDashboard, ListFilter,
} from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { SkeletonCard } from '../../components/ui/LoadingSkeleton';
import { analyticsService } from '../../services/api';
import useApiData from '../../hooks/useApiData';
import useNetworkStatus from '../../hooks/useNetworkStatus';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';
import { useInsights } from '../../context/InsightsContext';

const RADIUS = 54;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

const severityStyles = {
  critical: { label: 'Critical', icon: AlertTriangle, chip: 'bg-red-50 text-red-600', badge: 'bg-red-100 text-red-700', border: 'border-l-red-500' },
  warning: { label: 'Warning', icon: AlertCircle, chip: 'bg-amber-50 text-amber-600', badge: 'bg-amber-100 text-amber-700', border: 'border-l-amber-500' },
  info: { label: 'Info', icon: Info, chip: 'bg-blue-50 text-blue-600', badge: 'bg-blue-100 text-blue-700', border: 'border-l-blue-500' },
  success: { label: 'Healthy', icon: CheckCircle2, chip: 'bg-emerald-50 text-emerald-600', badge: 'bg-emerald-100 text-emerald-700', border: 'border-l-emerald-500' },
};

const categoryIcons = {
  Attendance: CalendarCheck,
  Punctuality: Clock,
  Overtime: Timer,
  Leave: Palmtree,
  Scheduling: CalendarDays,
  Workforce: Users,
  Security: ShieldAlert,
};

function scoreMeta(score) {
  if (score >= 90) return { color: '#10b981', text: 'text-emerald-600', bg: 'bg-emerald-50', label: 'Excellent' };
  if (score >= 75) return { color: '#3b82f6', text: 'text-blue-600', bg: 'bg-blue-50', label: 'Good' };
  if (score >= 50) return { color: '#f59e0b', text: 'text-amber-600', bg: 'bg-amber-50', label: 'Needs Attention' };
  return { color: '#ef4444', text: 'text-red-600', bg: 'bg-red-50', label: 'Critical' };
}

const filters = [
  { key: 'all', label: 'All' },
  { key: 'critical', label: 'Critical' },
  { key: 'warning', label: 'Warnings' },
  { key: 'info', label: 'Info' },
  { key: 'success', label: 'Healthy' },
];

function fmtShort(iso) {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function fmtFull(iso) {
  if (!iso) return '—';
  return new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function fmtTime(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AIDecisionSupport() {
  const { t } = useLanguage();
  const { toast } = useToast();
  const navigate = useNavigate();
  const isOnline = useNetworkStatus();
  const insightsCtx = useInsights();
  const [filter, setFilter] = useState('all');
  const [catFilter, setCatFilter] = useState('all');
  const [tab, setTab] = useState('overview');
  const [queueFilter, setQueueFilter] = useState('all');
  const [pending, setPending] = useState(null);
  const [running, setRunning] = useState(false);
  const [showHandled, setShowHandled] = useState(false);
  const [applyPending, setApplyPending] = useState(null);
  const { data, loading, error, refresh, setData } = useApiData(() => analyticsService.getAiInsights(), []);

  const insights = data?.insights ?? [];
  const queue = data?.queue ?? { leave: [], overtime: [], security: [] };
  const leaveItems = queue.leave ?? [];
  const overtimeItems = queue.overtime ?? [];
  const securityItems = queue.security ?? [];
  const totalPending = leaveItems.length + overtimeItems.length + securityItems.length;

  const counts = {};
  insights.forEach((i) => { if (!i.resolved) counts[i.severity] = (counts[i.severity] ?? 0) + 1; });
  const handledCount = insights.filter((i) => i.resolved).length;
  const shown = filter === 'all' ? insights : insights.filter((i) => i.severity === filter);
  const catShown = catFilter === 'all' ? shown : shown.filter((i) => i.category === catFilter);
  const visible = catShown.filter((i) => !i.resolved || showHandled);

  const categoryCounts = {};
  insights.forEach((i) => { if (!i.resolved) categoryCounts[i.category] = (categoryCounts[i.category] ?? 0) + 1; });

  const queueGroups = {
    security: securityItems,
    leave: leaveItems,
    overtime: overtimeItems,
  };
  const queueVisible = queueFilter === 'all' ? queueGroups : { [queueFilter]: queueGroups[queueFilter] };

  const tabs = [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard },
    { key: 'queue', label: 'Decision Queue', icon: Inbox, count: totalPending },
    { key: 'insights', label: 'AI Insights', icon: Sparkles, count: insights.filter((i) => !i.resolved).length },
  ];
  const queueFilters = [
    { key: 'all', label: 'All', count: totalPending },
    { key: 'security', label: 'Security', count: securityItems.length },
    { key: 'leave', label: 'Leave', count: leaveItems.length },
    { key: 'overtime', label: 'Overtime', count: overtimeItems.length },
  ];
  const categoryFilters = ['all', ...Object.keys(categoryIcons)];

  // "Do this first": the few things that matter most right now, most urgent first
  const severityRank = { critical: 0, warning: 1, info: 2 };
  const doFirst = insights
    .filter((i) => !i.resolved && i.severity in severityRank)
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
    .slice(0, 3);

  const score = data?.healthScore ?? 0;
  const meta = scoreMeta(score);
  const ringOffset = CIRCUMFERENCE * (1 - Math.min(100, Math.max(0, score)) / 100);

  const queueDecision = (kind, category, item) => {
    const approve = kind === 'approve';
    const verb = approve ? 'Approve' : 'Reject';
    const isLeave = category === 'leave';
    const subject = isLeave ? `${item.type} leave` : 'overtime';
    const range = isLeave ? `${fmtShort(item.start)} – ${fmtShort(item.end)}` : `${fmtShort(item.date)} (${item.hours}h)`;

    return {
      title: `${verb} ${isLeave ? 'Leave' : 'Overtime'} Request`,
      body: `${verb} ${item.employee}'s ${subject} (${range})?`,
      detail: `${item.employee} · ${subject} · applied ${fmtShort(item.applied)}`,
      note: 'The employee will be notified of your decision automatically.',
      confirmLabel: verb,
      confirmVariant: approve ? 'success' : 'danger',
      action: `${kind}_${category}`,
      payload: { id: item.id },
      successTitle: approve ? 'Request Approved' : 'Request Rejected',
      successMessage: `${item.employee}'s request was ${approve ? 'approved' : 'rejected'}.`,
    };
  };

  const securityDecision = (action, item) => {
    const escalate = action === 'flag_security_event';

    return {
      title: escalate ? 'Escalate Security Event' : 'Resolve Security Event',
      body: `${escalate ? 'Escalate' : 'Mark as resolved'} "${item.message}"?`,
      detail: `${item.label} · ${item.employee ?? 'Unknown person'} · ${fmtTime(item.time)}`,
      note: escalate
        ? 'All administrators will be notified immediately.'
        : 'The event will be removed from the decision queue.',
      confirmLabel: escalate ? 'Escalate' : 'Mark Resolved',
      confirmVariant: escalate ? 'warning' : 'success',
      action,
      payload: { id: item.id },
      successTitle: escalate ? 'Security Event Escalated' : 'Security Event Resolved',
      successMessage: escalate ? 'All administrators have been notified.' : 'The event was marked resolved.',
    };
  };

  const insightDecision = (insight, resolve) => ({
    title: resolve ? 'Mark as Handled' : 'Restore Insight',
    body: resolve ? `Mark "${insight.title}" as handled?` : `Restore "${insight.title}"?`,
    detail: `${insight.category}${insight.metric ? ` · ${insight.metric}` : ''}`,
    note: resolve
      ? 'Handled insights stay out of the way until you restore them.'
      : 'This insight will show up again in the list.',
    confirmLabel: resolve ? 'Mark Handled' : 'Restore',
    confirmVariant: resolve ? 'success' : 'outline',
    action: resolve ? 'resolve_insight' : 'unresolve_insight',
    payload: { key: insight.resolveKey },
    resolveKey: insight.resolveKey,
    successTitle: resolve ? 'Insight Handled' : 'Insight Restored',
    successMessage: resolve ? 'This problem is marked as handled.' : 'The insight is visible again.',
  });

  const handleAction = async () => {
    if (!pending) return;
    const { action, payload, resolveKey, successTitle, successMessage } = pending;
    setRunning(true);
    try {
      const res = await analyticsService.runAiAction(action, payload);
      if (res.queue) {
        setData((prev) => (prev ? { ...prev, queue: res.queue } : prev));
      } else if (resolveKey) {
        setData((prev) => prev ? {
          ...prev,
          insights: prev.insights.map((i) => (
            i.resolveKey === resolveKey ? { ...i, resolved: res.resolved } : i
          )),
        } : prev);
      }
      toast.success(successTitle, successMessage);
      setPending(null);
      insightsCtx?.refresh();
    } catch (err) {
      toast.error('Action Failed', err?.response?.data?.message || 'The request could not be completed.');
      setPending(null);
    } finally {
      setRunning(false);
    }
  };

  const applyDecision = (insight) => {
    const action = insight.applyAction;
    const label = insight.applyLabel || 'Apply';
    const payload = insight.applyPayload || {};

    if (action === 'navigate_attendance') {
      const params = new URLSearchParams();
      if (payload.employeeId) params.set('employee', payload.employeeId);
      if (payload.filter) params.set('filter', payload.filter);
      if (payload.date) params.set('date', payload.date);
      const qs = params.toString();
      return {
        title: label,
        body: `Open the Attendance page${payload.employeeId ? ' for this employee' : ''}?`,
        detail: insight.category,
        note: 'You will be redirected to take action on this recommendation.',
        confirmLabel: 'Open Attendance',
        confirmVariant: 'primary',
        action: 'navigate',
        navigateTo: `/attendance${qs ? '?' + qs : ''}`,
      };
    }

    if (action === 'navigate_overtime') {
      return {
        title: label,
        body: `Open the Attendance page to review overtime?`,
        detail: insight.category,
        note: 'Navigate to the overtime tab to review and approve/reject requests.',
        confirmLabel: 'Open Overtime',
        confirmVariant: 'primary',
        action: 'navigate',
        navigateTo: `/attendance?tab=overtime${payload.employeeId ? '&employee=' + payload.employeeId : ''}`,
      };
    }

    if (action === 'navigate_leave') {
      return {
        title: label,
        body: 'Open the Leave Management page?',
        detail: insight.category,
        note: 'Review and manage leave requests.',
        confirmLabel: 'Open Leave',
        confirmVariant: 'primary',
        action: 'navigate',
        navigateTo: '/leave',
      };
    }

    if (action === 'navigate_shifts') {
      return {
        title: label,
        body: 'Open the Shift Scheduling page?',
        detail: insight.category,
        note: 'View and manage shift schedules.',
        confirmLabel: 'Open Shifts',
        confirmVariant: 'primary',
        action: 'navigate',
        navigateTo: '/shifts',
      };
    }

    if (action === 'resolve_all_security') {
      return {
        title: label,
        body: `Resolve all ${payload.count || ''} open security event${(payload.count || 0) === 1 ? '' : 's'}?`,
        detail: 'All open face mismatch and failed PIN events will be marked as resolved.',
        note: 'This action will be logged. You can review resolved events in the Security page.',
        confirmLabel: 'Resolve All',
        confirmVariant: 'success',
        action: 'resolve_all_security',
        payload: {},
        successTitle: 'Security Events Resolved',
        successMessage: 'All open security events have been resolved.',
        resolveKey: insight.resolveKey,
      };
    }

    if (action === 'scroll_to_queue') {
      return {
        title: label,
        body: 'Scroll to the Decision Queue?',
        detail: `${payload.pendingLeave || 0} leave + ${payload.pendingOvertime || 0} overtime pending.`,
        note: 'The queue is shown above this insight section.',
        confirmLabel: 'Scroll Up',
        confirmVariant: 'primary',
        action: 'scroll_to_queue',
      };
    }

    return null;
  };

  const handleApplyAction = async () => {
    if (!applyPending) return;
    const { action, payload, resolveKey, navigateTo, successTitle, successMessage } = applyPending;

    if (action === 'navigate' && navigateTo) {
      setApplyPending(null);
      navigate(navigateTo);
      return;
    }

    if (action === 'scroll_to_queue') {
      setApplyPending(null);
      setTab('queue');
      return;
    }

    setRunning(true);
    try {
      const res = await analyticsService.runAiAction(action, payload || {});
      if (res.queue) {
        setData((prev) => (prev ? { ...prev, queue: res.queue } : prev));
      }
      if (resolveKey) {
        setData((prev) => prev ? {
          ...prev,
          insights: prev.insights.map((i) => (
            i.resolveKey === resolveKey ? { ...i, resolved: true } : i
          )),
        } : prev);
      }
      toast.success(successTitle, successMessage);
      setApplyPending(null);
      insightsCtx?.refresh();
    } catch (err) {
      toast.error('Action Failed', err?.response?.data?.message || 'The request could not be completed.');
      setApplyPending(null);
    } finally {
      setRunning(false);
    }
  };

  const renderApprovalCard = (item, category) => {
    const isLeave = category === 'leave';
    const CategoryIcon = isLeave ? Palmtree : Timer;
    const iconTone = isLeave ? 'bg-sky-50 text-sky-600' : 'bg-violet-50 text-violet-600';
    const badge = isLeave
      ? `${item.days} day${item.days === 1 ? '' : 's'}`
      : `${item.hours}h`;

    return (
      <div
        key={`${category}-${item.id}`}
        className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 animate-fadeIn"
      >
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconTone}`}>
              <CategoryIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[14px] font-semibold text-gray-900">{item.employee}</span>
                <span className="text-[11px] font-semibold text-gray-400">
                  {isLeave ? `${item.type} leave` : 'Overtime'}
                </span>
                <span className="text-[11px] font-semibold text-gray-600 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5">
                  {badge}
                </span>
              </div>
              <p className="text-[13px] text-gray-600 mt-1">
                {isLeave
                  ? `${fmtFull(item.start)} → ${fmtFull(item.end)}`
                  : `${fmtFull(item.date)} · ${item.hours}h expected`}
              </p>
              {item.reason ? (
                <p className="text-[12px] text-gray-400 mt-0.5 truncate">Reason: {item.reason}</p>
              ) : null}
              <p className="text-[11px] text-gray-400 mt-1">Applied {fmtFull(item.applied)}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:shrink-0">
            <Button
              variant="success"
              size="sm"
              icon={CheckCircle2}
              onClick={() => setPending(queueDecision('approve', category, item))}
              disabled={running}
            >
              Approve
            </Button>
            <Button
              variant="dangerOutline"
              size="sm"
              icon={XCircle}
              onClick={() => setPending(queueDecision('reject', category, item))}
              disabled={running}
            >
              Reject
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderSecurityCard = (item) => {
    const isFaceMismatch = item.type === 'face_mismatch';
    const CategoryIcon = isFaceMismatch ? ShieldAlert : Lock;
    const iconTone = isFaceMismatch ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600';
    const badge = isFaceMismatch ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700';

    return (
      <div
        key={`security-${item.id}`}
        className="bg-white rounded-2xl border border-gray-100 border-l-4 border-l-red-500 shadow-sm p-5 animate-fadeIn"
      >
        <div className="flex flex-col md:flex-row md:items-center gap-4">
          <div className="flex items-start gap-4 flex-1 min-w-0">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${iconTone}`}>
              <CategoryIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${badge}`}>
                  <ShieldAlert className="w-3 h-3" />
                  {item.label}
                </span>
                <span className="text-[11px] font-semibold text-gray-400">Security event</span>
                <span className="text-[11px] font-medium text-gray-500 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5">
                  {item.id}
                </span>
              </div>
              <p className="text-[13px] text-gray-600 mt-2 leading-relaxed">{item.message}</p>
              <p className="text-[11px] text-gray-400 mt-1">
                {item.employee ?? 'Unknown person'} · {fmtTime(item.time)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 md:shrink-0">
            <Button
              variant="success"
              size="sm"
              icon={CheckCircle2}
              onClick={() => setPending(securityDecision('resolve_security_event', item))}
              disabled={running}
            >
              Resolve
            </Button>
            <Button
              variant="warning"
              size="sm"
              icon={ShieldAlert}
              onClick={() => setPending(securityDecision('flag_security_event', item))}
              disabled={running}
            >
              Escalate
            </Button>
          </div>
        </div>
      </div>
    );
  };

  const renderQueueCard = (item, category) => (
    category === 'security' ? renderSecurityCard(item) : renderApprovalCard(item, category)
  );

  const renderQueueGroup = (label, items, category) => (
    <div className="space-y-3">
      {items.length > 0 ? (
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
      ) : null}
      {items.map((item) => renderQueueCard(item, category))}
    </div>
  );

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
            <Brain className="w-5 h-5 text-blue-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('aiDecisionSupport.title')}</h1>
            <p className="text-[14px] text-gray-500 mt-1">{t('aiDecisionSupport.subtitle')}</p>
          </div>
        </div>
        <Button
          variant="outline"
          onClick={() => { refresh(); insightsCtx?.refresh(); }}
          disabled={loading}
          className="sm:self-start"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Analyzing...' : 'Regenerate'}
        </Button>
      </div>

      {!isOnline && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-50 border border-red-200 animate-fadeIn">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <WifiOff className="w-5 h-5 text-red-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">No internet connection detected</p>
            <p className="text-sm text-red-600 mt-0.5">
              AI-powered insights require an active internet connection. Rule-based fallback insights are shown below instead. Connect to Wi-Fi or mobile data to enable full Gemini AI analysis.
            </p>
          </div>
          <WifiOff className="w-5 h-5 text-red-300 shrink-0 mt-0.5" />
        </div>
      )}

      {isOnline && data?.source !== 'ai' && !loading && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 animate-fadeIn">
          <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-800">Gemini AI unavailable</p>
            <p className="text-sm text-amber-600 mt-0.5">
              Connected to the internet, but Gemini AI could not be reached. This may be due to an invalid API key or a temporary service issue. Rule-based insights are shown below.
            </p>
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="grid md:grid-cols-2 gap-4">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
      ) : error ? (
        <Card className="flex flex-col items-center justify-center text-center py-16">
          <AlertCircle className="w-8 h-8 text-red-500 mb-3" />
          <p className="text-sm font-medium text-gray-700">{error}</p>
          <Button variant="outline" size="sm" className="mt-4" onClick={refresh}>
            Try again
          </Button>
        </Card>
      ) : (
        <>
          <div className="sticky -top-4 -mx-4 sm:-mx-6 lg:-mx-8 px-4 sm:px-6 lg:px-8 pt-4 pb-0 z-20 bg-[#F8FAFC]">
            <div className="flex items-center gap-1 overflow-x-auto pb-3 -mb-1 border-b border-gray-200">
              {tabs.map((tb) => {
                const Icon = tb.icon;
                const active = tab === tb.key;
                return (
                  <button
                    key={tb.key}
                    type="button"
                    onClick={() => setTab(tb.key)}
                    className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-[13px] font-semibold whitespace-nowrap transition-colors ${
                      active ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    {tb.label}
                    {tb.count > 0 ? (
                      <span className={`rounded-full px-1.5 text-[11px] font-bold ${active ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>
                        {tb.count}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {tab === 'overview' && (
            <>
              <div className="grid lg:grid-cols-3 gap-4 items-stretch">
                <Card className="p-6 flex flex-col items-center justify-center text-center">
                  <div className="relative shrink-0">
                    <svg width="150" height="150" viewBox="0 0 140 140" className="-rotate-90">
                      <circle cx="70" cy="70" r={RADIUS} fill="none" stroke="#E2E8F0" strokeWidth="12" />
                      <circle
                        cx="70" cy="70" r={RADIUS} fill="none" stroke={meta.color} strokeWidth="12"
                        strokeLinecap="round" strokeDasharray={CIRCUMFERENCE} strokeDashoffset={ringOffset}
                        className="transition-all duration-700"
                      />
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold text-gray-900">{score}</span>
                      <span className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">/ 100</span>
                    </div>
                  </div>
                  <h2 className="text-[14px] font-semibold text-gray-900 mt-4">Workforce Health Score</h2>
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold mt-1.5 ${meta.bg} ${meta.text}`}>
                    <Brain className="w-3.5 h-3.5" />
                    {meta.label}
                  </span>
                  <div className="flex items-center gap-2 mt-4">
                    {data?.source === 'ai' ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700">
                        <Sparkles className="w-3.5 h-3.5" />
                        Powered by Gemini AI
                      </span>
                    ) : !isOnline ? (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-red-50 text-red-700">
                        <WifiOff className="w-3.5 h-3.5" />
                        Offline
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Rule-based
                      </span>
                    )}
                    <span className="text-[11px] text-gray-400">
                      Generated{' '}
                      {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : 'just now'}
                    </span>
                  </div>
                </Card>

                <Card className="p-6 lg:col-span-2 flex flex-col justify-center">
                  <div className="flex items-center gap-2 mb-3">
                    <LayoutDashboard className="w-4.5 h-4.5 text-blue-500" />
                    <h2 className="text-[15px] font-semibold text-gray-900">At a glance</h2>
                  </div>
                  <p className="text-[14px] text-gray-600 leading-relaxed max-w-2xl">{data?.summary}</p>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
                    <div className="rounded-xl bg-gray-50 border border-gray-100 px-4 py-3">
                      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">Insights</p>
                      <p className="text-2xl font-bold text-gray-900 mt-1">{insights.length}</p>
                    </div>
                    <div className="rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                      <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide">Need attention</p>
                      <p className="text-2xl font-bold text-amber-700 mt-1">{insights.length - handledCount}</p>
                    </div>
                    <div className="rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
                      <p className="text-[11px] font-semibold text-blue-600 uppercase tracking-wide">Awaiting decision</p>
                      <p className="text-2xl font-bold text-blue-700 mt-1">{totalPending}</p>
                    </div>
                    <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                      <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wide">Handled</p>
                      <p className="text-2xl font-bold text-emerald-700 mt-1">{handledCount}</p>
                    </div>
                  </div>
                </Card>
              </div>

              <div className="grid md:grid-cols-2 gap-4">
                <Card className="p-5">
                  <h3 className="text-[13px] font-semibold text-gray-900 mb-3">Severity breakdown</h3>
                  {(() => {
                    const totalUnresolved = counts.critical + counts.warning + counts.info + counts.success;
                    const segments = [
                      { key: 'critical', label: 'Critical', color: 'bg-red-500', value: counts.critical },
                      { key: 'warning', label: 'Warning', color: 'bg-amber-400', value: counts.warning },
                      { key: 'info', label: 'Info', color: 'bg-blue-500', value: counts.info },
                      { key: 'success', label: 'Healthy', color: 'bg-emerald-500', value: counts.success },
                    ];
                    if (totalUnresolved === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                          <p className="text-[13px] font-medium text-gray-700">No open issues</p>
                          <p className="text-[12px] text-gray-400 mt-0.5">Everything is healthy right now.</p>
                        </div>
                      );
                    }
                    return (
                      <>
                        <div className="flex h-3 w-full overflow-hidden rounded-full bg-gray-100">
                          {segments.filter((s) => s.value > 0).map((s) => (
                            <div key={s.key} className={`${s.color} h-full`} style={{ width: `${(s.value / totalUnresolved) * 100}%` }} />
                          ))}
                        </div>
                        <div className="flex flex-wrap items-center gap-3 mt-3">
                          {segments.map((s) => (
                            <span key={s.key} className="inline-flex items-center gap-1.5 text-[12px] text-gray-600">
                              <span className={`w-2 h-2 rounded-full ${s.color}`} />
                              {s.label}
                              <span className="font-semibold text-gray-900">{s.value}</span>
                            </span>
                          ))}
                        </div>
                      </>
                    );
                  })()}
                </Card>

                <Card className="p-5">
                  <h3 className="text-[13px] font-semibold text-gray-900 mb-3">Where the problems are</h3>
                  {(() => {
                    const categories = Object.keys(categoryIcons);
                    const maxCount = Math.max(1, ...categories.map((c) => categoryCounts[c] ?? 0));
                    if (Object.keys(categoryCounts).length === 0) {
                      return (
                        <div className="flex flex-col items-center justify-center py-6 text-center">
                          <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                          <p className="text-[13px] font-medium text-gray-700">All clear</p>
                          <p className="text-[12px] text-gray-400 mt-0.5">No unresolved insights in any category.</p>
                        </div>
                      );
                    }
                    return (
                      <div className="space-y-2.5">
                        {categories.map((c) => {
                          const CategoryIcon = categoryIcons[c];
                          const value = categoryCounts[c] ?? 0;
                          return (
                            <div key={c} className="flex items-center gap-3">
                              <span className="w-7 h-7 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
                                <CategoryIcon className="w-3.5 h-3.5 text-gray-500" />
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <span className="text-[12px] font-medium text-gray-700">{c}</span>
                                  <span className={`text-[12px] font-bold ${value > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>{value}</span>
                                </div>
                                <div className="h-1.5 mt-1 w-full overflow-hidden rounded-full bg-gray-100">
                                  <div className={`h-full rounded-full ${value > 0 ? 'bg-amber-400' : 'bg-emerald-400'}`} style={{ width: `${(value / maxCount) * 100}%` }} />
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })()}
                </Card>
              </div>

              {(doFirst.length > 0 || totalPending > 0) && (
                <Card className="border-l-4 border-l-blue-500">
                  <div className="flex items-center gap-2 mb-3">
                    <Zap className="w-4.5 h-4.5 text-blue-500" />
                    <h2 className="text-[15px] font-semibold text-gray-900">Do this first</h2>
                    <span className="text-[12px] text-gray-400">The most important things right now</span>
                  </div>
                  <ol className="space-y-2.5">
                    {totalPending > 0 && (
                      <li className="flex items-start gap-3 text-[13px]">
                        <span className="mt-0.5 w-5 h-5 shrink-0 rounded-full bg-amber-100 text-amber-700 text-[11px] font-bold flex items-center justify-center">1</span>
                        <span className="text-gray-700">
                          <strong>Decide the {totalPending} waiting request{totalPending === 1 ? '' : 's'}</strong>
                          {' '}({[securityItems.length && `${securityItems.length} security`, leaveItems.length && `${leaveItems.length} leave`, overtimeItems.length && `${overtimeItems.length} overtime`].filter(Boolean).join(', ')}).{' '}
                          <a
                            href="#queue"
                            onClick={(e) => { e.preventDefault(); setTab('queue'); }}
                            className="text-blue-600 font-medium hover:underline"
                          >Go to the queue</a>
                        </span>
                      </li>
                    )}
                    {doFirst.map((i, idx) => {
                      const step = idx + (totalPending > 0 ? 2 : 1);
                      return (
                        <li key={i.id} className="flex items-start gap-3 text-[13px]">
                          <span className={`mt-0.5 w-5 h-5 shrink-0 rounded-full text-[11px] font-bold flex items-center justify-center ${i.severity === 'critical' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{step}</span>
                          <span className="text-gray-700"><strong>{i.title}.</strong> {i.recommendation || i.message}</span>
                        </li>
                      );
                    })}
                  </ol>
                </Card>
              )}
            </>
          )}

          {tab === 'queue' && (
            <div id="decision-queue">
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Inbox className="w-4.5 h-4.5 text-gray-400" />
                  <h2 className="text-[15px] font-semibold text-gray-900">Decision Queue</h2>
                  {totalPending > 0 ? (
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
                      {totalPending} pending
                    </span>
                  ) : null}
                </div>
                <span className="text-[12px] text-gray-400">
                  {totalPending > 0 ? 'Problems waiting for your decision' : 'All caught up'}
                </span>
              </div>

              {totalPending > 0 && (
                <div className="flex flex-wrap items-center gap-2 mb-4">
                  {queueFilters.map((qf) => (
                    <button
                      key={qf.key}
                      type="button"
                      onClick={() => setQueueFilter(qf.key)}
                      className={`px-3 py-1.5 pointer-coarse:py-2.5 rounded-full text-[12px] font-semibold border transition-colors ${
                        queueFilter === qf.key
                          ? 'bg-gray-900 text-white border-gray-900'
                          : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      {qf.label}
                      {qf.count ? <span className="ml-1 opacity-70">{qf.count}</span> : null}
                    </button>
                  ))}
                </div>
              )}

              {totalPending === 0 ? (
                <Card className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    <div>
                      <p className="text-[14px] font-semibold text-gray-900">All caught up</p>
                      <p className="text-[12px] text-gray-500">No leave, overtime, or security events require your decision.</p>
                    </div>
                  </div>
                </Card>
              ) : (
                <div className="space-y-5">
                  {queueVisible.security?.length > 0 && renderQueueGroup('Security events', queueVisible.security, 'security')}
                  {queueVisible.leave?.length > 0 && renderQueueGroup('Leave requests', queueVisible.leave, 'leave')}
                  {queueVisible.overtime?.length > 0 && renderQueueGroup('Overtime requests', queueVisible.overtime, 'overtime')}
                </div>
              )}
            </div>
          )}

          {tab === 'insights' && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4.5 h-4.5 text-purple-500" />
                  <h2 className="text-[15px] font-semibold text-gray-900">AI Insights & Recommendations</h2>
                </div>
                <div className="flex items-center gap-3">
                  {handledCount > 0 ? (
                    <button
                      type="button"
                      onClick={() => setShowHandled((s) => !s)}
                      className="text-[12px] font-semibold text-gray-500 hover:text-gray-900 transition-colors"
                    >
                      {showHandled ? 'Hide handled' : `Show handled (${handledCount})`}
                    </button>
                  ) : null}
                  <span className="text-[12px] text-gray-400 hidden sm:block">
                    Analysis of the last 30 days of workforce data
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 mb-2">
                {filters.map((f) => (
                  <button
                    key={f.key}
                    type="button"
                    onClick={() => setFilter(f.key)}
                    className={`px-3 py-1.5 pointer-coarse:py-2.5 rounded-full text-[12px] font-semibold border transition-colors ${
                      filter === f.key
                        ? 'bg-gray-900 text-white border-gray-900'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    {f.label}
                    {counts[f.key] ? <span className="ml-1 opacity-70">{counts[f.key]}</span> : null}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-1.5 mb-4">
                <ListFilter className="w-3.5 h-3.5 text-gray-400" />
                {categoryFilters.map((c) => {
                  const label = c === 'all' ? 'All categories' : c;
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCatFilter(c)}
                      className={`px-2.5 py-1 rounded-lg text-[12px] font-medium border transition-colors ${
                        catFilter === c
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300 hover:text-gray-700'
                      }`}
                    >
                      {label}
                      {categoryCounts[c] ? <span className="ml-1 opacity-60">{categoryCounts[c]}</span> : null}
                    </button>
                  );
                })}
              </div>

              {visible.length === 0 ? (
                <Card className="flex flex-col items-center justify-center text-center py-16">
                  <CheckCircle2 className="w-10 h-10 text-emerald-500 mb-3" />
                  <h3 className="text-[15px] font-semibold text-gray-900">Nothing here</h3>
                  <p className="text-[13px] text-gray-400 mt-1">No insights match this filter.</p>
                </Card>
              ) : (
                <div className="grid gap-4">
                  {visible.map((insight, idx) => {
                    const sev = severityStyles[insight.severity] ?? severityStyles.info;
                    const Icon = sev.icon;
                    const CategoryIcon = categoryIcons[insight.category] ?? Users;
                    return (
                      <div
                        key={insight.id}
                        className={`bg-white rounded-2xl border border-gray-100 border-l-4 ${sev.border} p-5 shadow-sm animate-fadeIn ${insight.resolved ? 'opacity-70' : ''}`}
                        style={{ animationDelay: `${Math.min(idx * 40, 400)}ms` }}
                      >
                        <div className="flex items-start gap-4">
                          <div className={`w-10 h-10 rounded-xl ${sev.chip} flex items-center justify-center shrink-0`}>
                            <CategoryIcon className="w-5 h-5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${sev.badge}`}>
                                <Icon className="w-3 h-3" />
                                {sev.label}
                              </span>
                              {insight.resolved ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700">
                                  <CheckCircle2 className="w-3 h-3" />
                                  Handled
                                </span>
                              ) : null}
                              <span className="text-[11px] font-semibold text-gray-400">{insight.category}</span>
                              {insight.metric ? (
                                <span className="text-[11px] font-medium text-gray-500 bg-gray-50 border border-gray-100 rounded-full px-2 py-0.5">
                                  {insight.metric}
                                </span>
                              ) : null}
                            </div>
                            <h3 className="text-[15px] font-semibold text-gray-900 mt-2">{insight.title}</h3>
                            <p className="text-[13px] text-gray-500 mt-1 leading-relaxed">{insight.message}</p>
                            <div className="mt-3 flex items-start gap-2 rounded-xl bg-blue-50/70 px-3 py-2.5 border border-blue-100">
                              <Sparkles className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                              <div>
                                <p className="text-[11px] font-semibold text-blue-700 uppercase tracking-wide">Recommended action</p>
                                <p className="text-[13px] text-blue-800 mt-0.5">{insight.recommendation}</p>
                              </div>
                            </div>
                            <div className="mt-2 flex items-center justify-end gap-2">
                              {insight.applyAction && !insight.resolved ? (
                                <Button
                                  variant="primary"
                                  size="xs"
                                  icon={Zap}
                                  onClick={() => {
                                    const decision = applyDecision(insight);
                                    if (decision) setApplyPending(decision);
                                  }}
                                  disabled={running}
                                >
                                  {insight.applyLabel || 'Apply'}
                                </Button>
                              ) : null}
                              <Button
                                variant={insight.resolved ? 'outline' : 'ghost'}
                                size="xs"
                                icon={insight.resolved ? RefreshCw : CheckCircle2}
                                onClick={() => setPending(insightDecision(insight, !insight.resolved))}
                                disabled={running}
                              >
                                {insight.resolved ? 'Restore' : 'Mark as handled'}
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <Modal
        isOpen={!!pending}
        onClose={() => { if (!running) setPending(null); }}
        title={pending?.title ?? ''}
        size="sm"
      >
        {pending && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                pending.confirmVariant === 'danger'
                  ? 'bg-red-50'
                  : pending.confirmVariant === 'warning'
                    ? 'bg-amber-50'
                    : 'bg-emerald-50'
              }`}>
                {pending.confirmVariant === 'danger' ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : pending.confirmVariant === 'warning' ? (
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                ) : (
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                )}
              </div>
              <div>
                <p className="text-sm text-gray-700">{pending.body}</p>
                <p className="text-xs text-gray-500 mt-1">{pending.detail}</p>
                <p className="text-xs text-gray-500 mt-1">{pending.note}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button variant="outline" onClick={() => setPending(null)} disabled={running}>Cancel</Button>
              <Button
                variant={pending.confirmVariant}
                onClick={handleAction}
                loading={running}
              >
                {pending.confirmLabel}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={!!applyPending}
        onClose={() => { if (!running) setApplyPending(null); }}
        title={applyPending?.title ?? ''}
        size="sm"
      >
        {applyPending && (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                applyPending.confirmVariant === 'danger'
                  ? 'bg-red-50'
                  : applyPending.confirmVariant === 'warning'
                    ? 'bg-amber-50'
                    : 'bg-blue-50'
              }`}>
                {applyPending.confirmVariant === 'danger' ? (
                  <XCircle className="w-5 h-5 text-red-500" />
                ) : applyPending.confirmVariant === 'warning' ? (
                  <ShieldAlert className="w-5 h-5 text-amber-600" />
                ) : (
                  <Zap className="w-5 h-5 text-blue-600" />
                )}
              </div>
              <div>
                <p className="text-sm text-gray-700">{applyPending.body}</p>
                <p className="text-xs text-gray-500 mt-1">{applyPending.detail}</p>
                <p className="text-xs text-gray-500 mt-1">{applyPending.note}</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
              <Button variant="outline" onClick={() => setApplyPending(null)} disabled={running}>Cancel</Button>
              <Button
                variant={applyPending.confirmVariant}
                onClick={handleApplyAction}
                loading={running}
                icon={Zap}
              >
                {applyPending.confirmLabel}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
