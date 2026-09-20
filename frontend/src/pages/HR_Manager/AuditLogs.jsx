import { useMemo, useState } from 'react';
import { Search, Filter, RefreshCw, Download, ChevronLeft, ChevronRight, ScrollText, Eye } from 'lucide-react';
import { useToast } from '../../context/ToastContext';
import Badge from '../../components/ui/Badge';
import Button from '../../components/ui/Button';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonTable } from '../../components/ui/LoadingSkeleton';
import useApiData from '../../hooks/useApiData';
import { auditService } from '../../services/api';
import { downloadCsv } from '../../utils/export';
import { formatDate, formatTime } from '../../utils/helpers';

const SERVICE_COLORS = {
  attendance: 'blue',
  timeoff: 'emerald',
  payroll: 'purple',
  core: 'amber',
  configuration: 'cyan',
};

export default function AuditLogs() {
  const { toast } = useToast();

  const [filters, setFilters] = useState({
    search: '',
    service: '',
    event: '',
    entityType: '',
    entityId: '',
    from: '',
    to: '',
    perPage: 25,
    page: 1,
  });

  const [showDetail, setShowDetail] = useState(null);

  const params = useMemo(() => {
    const p = {};
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) p[k] = v;
    });
    return p;
  }, [filters]);

  const res = useApiData(() => auditService.getLogs(params), [params]);
  const logs = useMemo(() => res?.data || [], [res]);
  const meta = useMemo(() => res?.meta || {}, [res]);

  const setField = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  };

  const jumpTo = (page) => {
    setFilters((f) => ({ ...f, page }));
  };

  const handleExport = () => {
    if (!logs.length) {
      toast.error('Nothing to export', 'No matching audit events.');
      return;
    }
    const rows = logs.map((e) => ({
      ID: e.id,
      Service: e.service,
      Event: e.event,
      'Entity Type': e.entityType,
      'Entity ID': e.entityId,
      Actor: e.actor,
      'Actor ID': e.actorId,
      'Performed At': e.createdAt,
    }));
    downloadCsv(`audit-log-export-${Date.now()}.csv`, rows);
    toast.success('Export ready', `Exported ${rows.length} audit events as CSV.`);
  };

  const formatWhen = (iso) =>
    iso ? `${formatDate(iso.slice(0, 10))} ${formatTime(iso.slice(11, 19))}` : '—';

  const diffSummary = (before, after) => {
    const b = before || {};
    const a = after || {};
    const keys = new Set([...Object.keys(b), ...Object.keys(a)]);
    const changed = [];
    keys.forEach((k) => {
      if (JSON.stringify(b[k] ?? null) !== JSON.stringify(a[k] ?? null)) changed.push(k);
    });
    return changed.length ? changed.join(', ') : 'No field change';
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Logs</h1>
          <p className="text-[14px] text-gray-500 mt-1">Immutable trail of HR actions across all services</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" size="md" icon={RefreshCw} onClick={() => window.location.reload()}>Refresh</Button>
          <Button variant="outline" size="md" icon={Download} onClick={handleExport}>Export CSV</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 space-y-3">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-700">
          <Filter className="w-4 h-4 text-blue-500" /> Filters
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              value={filters.search}
              onChange={(e) => setField('search', e.target.value)}
              placeholder="Search event, entity, actor..."
              className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
            />
          </div>
          <select
            value={filters.service}
            onChange={(e) => setField('service', e.target.value)}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value="">All services</option>
            {(meta.services || []).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            value={filters.event}
            onChange={(e) => setField('event', e.target.value)}
            placeholder="Event (e.g. leave.status_changed)"
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <input
            value={filters.entityType}
            onChange={(e) => setField('entityType', e.target.value)}
            placeholder="Entity type (e.g. EarlyClockOut)"
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <input
            value={filters.entityId}
            onChange={(e) => setField('entityId', e.target.value)}
            placeholder="Entity ID"
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setField('from', e.target.value)}
            title="From date"
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setField('to', e.target.value)}
            title="To date"
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          />
          <select
            value={filters.perPage}
            onChange={(e) => setField('perPage', Number(e.target.value))}
            className="px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30"
          >
            <option value={25}>25 / page</option>
            <option value={50}>50 / page</option>
            <option value={100}>100 / page</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {!res ? (
        <SkeletonTable rows={8} cols={6} />
      ) : logs.length ? (
        <div className="overflow-hidden rounded-xl border border-gray-100 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                  <th className="py-2.5 px-4 font-semibold">ID</th>
                  <th className="py-2.5 px-2 font-semibold">Service</th>
                  <th className="py-2.5 px-2 font-semibold">Event</th>
                  <th className="py-2.5 px-2 font-semibold">Entity</th>
                  <th className="py-2.5 px-2 font-semibold">Actor</th>
                  <th className="py-2.5 px-2 font-semibold">Change</th>
                  <th className="py-2.5 px-2 font-semibold">When</th>
                  <th className="py-2.5 px-4 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((e) => (
                  <tr key={e.id} className="border-t border-gray-50 hover:bg-blue-50/40 transition-colors">
                    <td className="py-2.5 px-4 font-mono text-xs text-gray-500">#{e.id}</td>
                    <td className="py-2.5 px-2">
                      <Badge variant={SERVICE_COLORS[e.service] || 'default'} size="sm">{e.service}</Badge>
                    </td>
                    <td className="py-2.5 px-2">
                      <p className="font-semibold text-gray-900">{e.event}</p>
                    </td>
                    <td className="py-2.5 px-2">
                      <p className="text-gray-700">{e.entityType}</p>
                      {e.entityId && <p className="text-xs font-mono text-gray-400">{e.entityId}</p>}
                    </td>
                    <td className="py-2.5 px-2">
                      <p className="font-medium text-gray-800">{e.actor || 'System'}</p>
                      {e.actorId && <p className="text-xs text-gray-400">{e.actorId}</p>}
                    </td>
                    <td className="py-2.5 px-2 text-xs text-gray-500 max-w-[220px] truncate">
                      {diffSummary(e.before, e.after)}
                    </td>
                    <td className="py-2.5 px-2 text-xs text-gray-500 whitespace-nowrap">{formatWhen(e.createdAt)}</td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        onClick={() => setShowDetail(e)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      >
                        <Eye className="w-3.5 h-3.5" /> View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
            <p className="text-xs text-gray-500">
              Page {meta.page || 1} of {meta.lastPage || 1} · {meta.total || 0} events
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                icon={ChevronLeft}
                disabled={!meta.page || meta.page <= 1}
                onClick={() => jumpTo(meta.page - 1)}
              >
                Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!meta.lastPage || meta.page >= meta.lastPage}
                onClick={() => jumpTo(meta.page + 1)}
              >
                Next <ChevronRight className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={ScrollText}
          title="No audit events"
          description="Adjust your filters or perform an HR action to generate audit entries."
        />
      )}

      {/* Detail modal */}
      {showDetail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setShowDetail(null)}>
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-white rounded-2xl shadow-xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4 mb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant={SERVICE_COLORS[showDetail.service] || 'default'} size="sm">{showDetail.service}</Badge>
                  <h3 className="text-lg font-bold text-gray-900">{showDetail.event}</h3>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  #{showDetail.id} · {showDetail.entityType}{showDetail.entityId ? ` ${showDetail.entityId}` : ''} · {formatWhen(showDetail.createdAt)}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  Actor: {showDetail.actor || 'System'}{showDetail.actorId ? ` (${showDetail.actorId})` : ''}
                </p>
              </div>
              <button
                onClick={() => setShowDetail(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              {((showDetail.meta && Object.keys(showDetail.meta).length) || null) && (
                <div>
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Meta</p>
                  <pre className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(showDetail.meta, null, 2)}
                  </pre>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Before</p>
                <pre className="bg-gray-50 border border-gray-100 rounded-lg p-3 text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {JSON.stringify(showDetail.before ?? {}, null, 2)}
                </pre>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">After</p>
                <pre className="bg-emerald-50 border border-emerald-100 rounded-lg p-3 text-xs text-emerald-800 overflow-x-auto whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {JSON.stringify(showDetail.after ?? {}, null, 2)}
                </pre>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}