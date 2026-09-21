import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Power, Lock, CheckCircle2, Timer, ShieldCheck } from 'lucide-react';
import Button from '../ui/Button';

const pad = (n) => String(n).padStart(2, '0');

// "5h 12m" / "42m 10s" until the given moment
function countdown(ms) {
  if (ms <= 0) return 'ending now';
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h ${pad(m)}m` : `${m}m ${pad(total % 60)}s`;
}

function format(iso, timezone, options) {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone, ...options }).format(new Date(iso));
  } catch {
    return '';
  }
}

// The big card at the top of Kiosk Management: is the kiosk on, when does today's session end,
// and the one action that matters (enable or disable).
export default function KioskStatusHero({ settings, overview, onEnable, onDisable }) {
  const active = settings.active === true;
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const endsAt = overview?.sessionEndsAt ? new Date(overview.sessionEndsAt).getTime() : null;
  const tz = settings.timezone || 'Asia/Manila';

  return (
    <section
      className={clsx(
        'relative overflow-hidden rounded-2xl p-6 sm:p-7 text-white shadow-lg',
        active ? 'bg-gradient-to-br from-[#0B1F3A] via-[#12305a] to-[#0B1F3A]' : 'bg-gradient-to-br from-slate-700 via-slate-800 to-slate-700'
      )}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-blue-400/10 blur-2xl" />
      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className={clsx('flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl', active ? 'bg-emerald-400/15' : 'bg-amber-400/15')}>
            {active ? <CheckCircle2 className="h-7 w-7 text-emerald-300" /> : <Power className="h-7 w-7 text-amber-300" />}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{active ? 'Kiosk is live' : 'Kiosk is in setup mode'}</h2>
              {active && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-blue-100/80">
              {settings.deviceName} · {settings.location}
              {active && settings.enabledAt ? ` · enabled ${format(settings.enabledAt, tz, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
            </p>
            {active ? (
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                <span className="inline-flex items-center gap-2 text-blue-100">
                  <Timer className="h-4 w-4 text-blue-300" />
                  Today&apos;s session ends {endsAt ? `at ${format(endsAt, tz, { hour: 'numeric', minute: '2-digit' })}` : 'at midnight'}
                  {endsAt && <strong className="font-semibold text-white tabular-nums">· in {countdown(endsAt - now)}</strong>}
                </span>
                <span className="inline-flex items-center gap-2 text-blue-100/80">
                  <ShieldCheck className="h-4 w-4 text-blue-300" />
                  PIN needed again tomorrow
                </span>
              </div>
            ) : (
              <p className="mt-4 max-w-xl text-sm text-slate-300">
                Enabling locks the entrance device to the clock-in terminal behind a secret 4-digit PIN.
              </p>
            )}
          </div>
        </div>

        {active ? (
          <Button variant="outline" icon={Power} onClick={onDisable} className="!border-white/25 !bg-white/5 !text-white hover:!bg-white/10">
            Disable kiosk mode
          </Button>
        ) : (
          <Button icon={Lock} size="lg" onClick={onEnable}>Enable kiosk mode</Button>
        )}
      </div>
    </section>
  );
}
