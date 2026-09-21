import clsx from 'clsx';
import { LogIn, LogOut, UserX, ShieldAlert } from 'lucide-react';

const TONES = {
  blue: { chip: 'bg-blue-50 text-blue-600', bar: 'bg-blue-500' },
  emerald: { chip: 'bg-emerald-50 text-emerald-600', bar: 'bg-emerald-500' },
  amber: { chip: 'bg-amber-50 text-amber-600', bar: 'bg-amber-500' },
  red: { chip: 'bg-red-50 text-red-600', bar: 'bg-red-500' },
  gray: { chip: 'bg-gray-100 text-gray-500', bar: 'bg-gray-300' },
};

function Tile({ icon: Icon, label, value, sub, tone, progress }) {
  const t = TONES[tone];
  return (
    <div className="rounded-2xl bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">{label}</p>
          <p className="mt-1.5 text-3xl font-bold tabular-nums text-gray-900">{value}</p>
        </div>
        <div className={clsx('flex h-10 w-10 items-center justify-center rounded-xl', t.chip)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
      {progress != null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
          <div className={clsx('h-full rounded-full transition-all duration-700', t.bar)} style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
      ) : null}
      <p className="mt-2 text-xs text-gray-500">{sub}</p>
    </div>
  );
}

// Today at the door, in four numbers. Everything comes from the server's overview.
export default function KioskStatTiles({ overview }) {
  const o = overview;
  const scheduled = o?.scheduledToday ?? 0;
  const pct = scheduled ? Math.round(((o?.clockIns ?? 0) / scheduled) * 100) : null;
  const waiting = o?.waiting?.length ?? 0;
  const failed = o?.failedAttempts ?? 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Tile icon={LogIn} label="Clocked in today" tone="emerald" value={o ? o.clockIns : '–'}
        progress={pct} sub={scheduled ? `${pct}% of ${scheduled} scheduled` : 'Nobody is scheduled today'} />
      <Tile icon={LogOut} label="Clocked out" tone="blue" value={o ? o.clockOuts : '–'}
        progress={o?.clockIns ? Math.round((o.clockOuts / o.clockIns) * 100) : null}
        sub={o?.clockIns ? `${o.clockIns - o.clockOuts} still in` : 'No clock-ins yet'} />
      <Tile icon={UserX} label="Not clocked in" tone={waiting ? 'amber' : 'gray'} value={o ? waiting : '–'}
        sub={waiting ? 'Shift started, no clock-in yet' : 'Everyone whose shift started is in'} />
      <Tile icon={ShieldAlert} label="Security alerts" tone={failed ? 'red' : 'gray'} value={o ? failed : '–'}
        sub={failed ? 'Wrong PIN or face mismatch today' : 'No failed attempts today'} />
    </div>
  );
}
