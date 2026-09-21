import { CheckCircle2, Clock } from 'lucide-react';

const late = (m) => (m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`);

// Scheduled people whose shift has started but who have not clocked in.
export default function KioskWaitingList({ waiting = [], loaded }) {
  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Waiting to clock in</h3>
          <p className="mt-0.5 text-xs text-gray-400">Scheduled today, shift already started, not on leave</p>
        </div>
        {waiting.length > 0 && <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">{waiting.length}</span>}
      </div>

      {!loaded ? (
        <div className="mt-4 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-10 animate-pulse rounded-xl bg-gray-50" />)}</div>
      ) : waiting.length === 0 ? (
        <div className="mt-5 flex items-center gap-3 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
          <CheckCircle2 className="h-5 w-5 shrink-0" /> Everyone whose shift has started is clocked in.
        </div>
      ) : (
        <ul className="mt-4 divide-y divide-gray-50">
          {waiting.slice(0, 8).map((p) => (
            <li key={p.employeeId} className="flex items-center gap-3 py-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-amber-50 text-xs font-bold text-amber-700">
                {(p.name || '?').split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-gray-900">{p.name}</p>
                <p className="text-xs text-gray-400">{p.employeeId} · shift started {p.shiftStart}</p>
              </div>
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600"><Clock className="h-3.5 w-3.5" />{late(p.minutesLate)} late</span>
            </li>
          ))}
          {waiting.length > 8 && <li className="pt-2.5 text-center text-xs text-gray-400">+ {waiting.length - 8} more</li>}
        </ul>
      )}
    </div>
  );
}
