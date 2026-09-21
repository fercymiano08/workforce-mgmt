import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { LogIn, LogOut, KeyRound, ShieldCheck, Power, Wrench, Search, Activity, AlertTriangle } from 'lucide-react';
import { LOG_TYPES } from '../../services/kioskService';

const ICONS = { 'clock-in': LogIn, 'clock-out': LogOut, mode: Power, pin: KeyRound, security: ShieldCheck, maintenance: Wrench };

const FILTERS = [
  { id: 'all', label: 'All', match: () => true },
  { id: 'clock', label: 'Clock-ins & outs', match: (l) => l.type === 'clock-in' || l.type === 'clock-out' },
  { id: 'security', label: 'Security', match: (l) => l.type === 'security' },
  { id: 'system', label: 'System', match: (l) => ['mode', 'pin', 'maintenance'].includes(l.type) },
];

// A wrong PIN or a face that did not match is an alert; a successful unlock is only a security-log entry
const isAlert = (l) => l.type === 'security' && /^(failed|face mismatch)/i.test(l.message || '');

const dayKey = (iso, timezone) => {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
};

const dayLabel = (key, todayKey, yesterdayKey) =>
  key === todayKey ? 'Today' : key === yesterdayKey ? 'Yesterday'
    : new Date(`${key}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

const clock = (iso, timezone) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(iso));
  } catch {
    return '';
  }
};

// The kiosk's activity as a timeline: grouped by day, filterable, searchable. Security events stand out in red.
export default function KioskActivityTimeline({ logs, timezone = 'Asia/Manila', loading }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  // The two day labels are fixed when the timeline opens (it is re-created each time the tab is opened)
  const [dayKeys] = useState(() => {
    const now = new Date();
    return { today: dayKey(now.toISOString(), timezone), yesterday: dayKey(new Date(now.getTime() - 86400000).toISOString(), timezone) };
  });

  const counts = useMemo(() => Object.fromEntries(FILTERS.map((f) => [f.id, logs.filter(f.match).length])), [logs]);

  const groups = useMemo(() => {
    const active = FILTERS.find((f) => f.id === filter);
    const q = search.trim().toLowerCase();
    const shown = logs
      .filter(active.match)
      .filter((l) => !q || `${l.message} ${l.detail || ''}`.toLowerCase().includes(q));
    const map = new Map();
    shown.forEach((l) => {
      const key = dayKey(l.at, timezone);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(l);
    });
    return [...map.entries()].map(([key, items]) => ({ label: dayLabel(key, dayKeys.today, dayKeys.yesterday), items }));
  }, [logs, filter, search, timezone, dayKeys]);

  return (
    <div className="overflow-hidden rounded-2xl bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-gray-100 px-6 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Activity timeline</h2>
          <p className="mt-0.5 text-xs text-gray-400">Latest 200 kiosk events, newest first. Refreshes automatically.</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events..."
            className="h-10 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200 lg:w-64"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-gray-50 px-6 py-3">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={clsx(
              'rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
              filter === f.id ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
          >
            {f.label} <span className={clsx('ml-1', filter === f.id ? 'text-blue-100' : 'text-gray-400')}>{counts[f.id]}</span>
          </button>
        ))}
      </div>

      {loading && logs.length === 0 ? (
        <div className="space-y-3 p-6">{[0, 1, 2, 3].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-gray-50" />)}</div>
      ) : groups.length === 0 ? (
        <div className="py-16 text-center">
          <Activity className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-sm font-medium text-gray-500">{logs.length ? 'No events match this filter' : 'No activity yet'}</p>
          <p className="mt-1 text-xs text-gray-400">{logs.length ? 'Try another filter or clear the search.' : 'Kiosk events will appear here as they happen.'}</p>
        </div>
      ) : (
        <div className="px-6 py-4">
          {groups.map((group) => (
            <section key={group.label} className="mb-5 last:mb-0">
              <h3 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-gray-400">{group.label}</h3>
              <ol className="relative space-y-1 border-l border-gray-100 pl-6">
                {group.items.map((entry) => {
                  const meta = LOG_TYPES[entry.type] || LOG_TYPES.maintenance;
                  const Icon = ICONS[entry.type] || Wrench;
                  const isSecurity = isAlert(entry);
                  return (
                    <li key={entry.id} className={clsx('relative rounded-xl px-3 py-2.5', isSecurity && 'bg-red-50/60')}>
                      <span className={clsx('absolute -left-[37px] top-3 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white', meta.bg)}>
                        <Icon className={clsx('h-3.5 w-3.5', meta.color)} />
                      </span>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900">
                            {isSecurity && <AlertTriangle className="mr-1.5 inline h-3.5 w-3.5 -translate-y-px text-red-500" />}
                            {entry.message}
                          </p>
                          {entry.detail && <p className="mt-0.5 text-xs text-gray-500">{entry.detail}</p>}
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs font-medium tabular-nums text-gray-500">{clock(entry.at, timezone)}</p>
                          <p className={clsx('text-[10px] font-bold uppercase tracking-wider', meta.color)}>{meta.label}</p>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
