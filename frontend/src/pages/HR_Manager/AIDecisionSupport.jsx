import { useState } from 'react';
import {
  Brain, AlertTriangle, AlertCircle, Info, CheckCircle2, XCircle,
  CalendarCheck, Clock, Timer, Palmtree, CalendarDays, Users,
  Sparkles, RefreshCw, Inbox, ShieldAlert, Lock,
} from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import { SkeletonCard } from '../../components/ui/LoadingSkeleton';
import { analyticsService } from '../../services/api';
import useApiData from '../../hooks/useApiData';
import { useLanguage } from '../../context/LanguageContext';
import { useToast } from '../../context/ToastContext';

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
  const [filter, setFilter] = useState('all');
  const [pending, setPending] = useState(null);
  const [running, setRunning] = useState(false);
  const [showHandled, setShowHandled] = useState(false);
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
  const visible = shown.filter((i) => !i.resolved || showHandled);

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
    } catch (err) {
      toast.error('Action Failed', err?.response?.data?.message || 'The request could not be completed.');
      setPending(null);
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
          onClick={refresh}
          disabled={loading}
          className="sm:self-start"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          {loading ? 'Analyzing...' : 'Regenerate'}
        </Button>
      </div>

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
          <Card className="p-6">
            <div className="flex flex-col md:flex-row md:items-center gap-6">
              <div className="relative shrink-0 mx-auto md:mx-0">
                <svg width="140" height="140" viewBox="0 0 140 140" className="-rotate-90">
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
              <div className="flex-1 text-center md:text-left">
                <div className="flex items-center justify-center md:justify-start gap-2">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[12px] font-semibold ${meta.bg} ${meta.text}`}>
                    <Brain className="w-3.5 h-3.5" />
                    Workforce Health Score
                  </span>
                  <span className={`text-[12px] font-semibold ${meta.text}`}>{meta.label}</span>
                </div>
                <p className="text-[14px] text-gray-600 mt-3 leading-relaxed max-w-xl">
                  {data?.summary}
                </p>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-3">
                  {data?.source === 'ai' ? (
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-purple-50 text-purple-700">
                      <Sparkles className="w-3.5 h-3.5" />
                      Powered by Gemini AI
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Offline rules fallback
                    </span>
                  )}
                  {totalPending > 0 ? (
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700">
                      <Inbox className="w-3.5 h-3.5" />
                      {totalPending} item{totalPending === 1 ? '' : 's'} awaiting decision
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Decision queue is clear
                    </span>
                  )}
                </div>
                <p className="text-[12px] text-gray-400 mt-3">
                  Generated {data?.generatedAt ? new Date(data.generatedAt).toLocaleString() : 'just now'}
                  {' · '}{insights.length} insight{insights.length === 1 ? '' : 's'}
                </p>
              </div>
            </div>
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-2">
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
              {renderQueueGroup('Security events', securityItems, 'security')}
              {renderQueueGroup('Leave requests', leaveItems, 'leave')}
              {renderQueueGroup('Overtime requests', overtimeItems, 'overtime')}
            </div>
          )}

          <div className="flex items-center justify-between">
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

          <div className="flex flex-wrap items-center gap-2">
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
                        <div className="mt-2 flex items-center justify-end">
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
    </div>
  );
}
