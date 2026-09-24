import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { Power, Lock, CheckCircle2, Timer } from 'lucide-react';
import Button from '../ui/Button';

const pad = (n) => String(n).padStart(2, '0');

// "5h 12m" / "42m 10s" until the given moment
function countdown(ms) {
  if (ms <= 0) return 'turning off now';
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

// The big card at the top of Kiosk Management: enabled (green) or disabled (red), and the one action that
// matters. Kiosk mode lasts for the day it is switched on and turns itself off at midnight.
export default function KioskStatusHero({ settings, overview, onEnable, onDisable }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const endsAt = overview?.sessionEndsAt ? new Date(overview.sessionEndsAt).getTime() : null;
  // Show "disabled" the moment midnight passes instead of waiting for the next refresh
  const enabled = settings.active === true && (!endsAt || endsAt > now);
  const tz = settings.timezone || 'Asia/Manila';

  return (
    <section
      className={clsx(
        'relative overflow-hidden rounded-2xl p-6 sm:p-7 text-white shadow-lg',
        enabled ? 'bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800' : 'bg-gradient-to-br from-red-600 via-red-700 to-red-800'
      )}
    >
      <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-white/10 blur-2xl" />
      <div className="relative flex flex-col lg:flex-row lg:items-center lg:justify-between gap-6">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
            {enabled ? <CheckCircle2 className="h-7 w-7 text-white" /> : <Power className="h-7 w-7 text-white" />}
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">{enabled ? 'Kiosk is enabled' : 'Kiosk is disabled'}</h2>
              {enabled && (
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-white" />
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-white/80">
              {settings.deviceName} · {settings.location}
              {enabled && settings.enabledAt ? ` · enabled today at ${format(settings.enabledAt, tz, { hour: 'numeric', minute: '2-digit' })}` : ''}
            </p>
            {enabled ? (
              <p className="mt-4 inline-flex items-center gap-2 text-sm text-white/90">
                <Timer className="h-4 w-4" />
                Turns off automatically {endsAt ? `at ${format(endsAt, tz, { hour: 'numeric', minute: '2-digit' })}` : 'at midnight'}
                {endsAt && <strong className="font-semibold text-white tabular-nums">· in {countdown(endsAt - now)}</strong>}
              </p>
            ) : (
              <p className="mt-4 max-w-xl text-sm text-white/85">
                Clock-ins are off. Kiosk mode turns off every midnight, so enable it each morning before people arrive.
              </p>
            )}
          </div>
        </div>

        {enabled ? (
          <Button variant="outline" icon={Power} onClick={onDisable} className="!border-white/40 !bg-white/10 !text-white hover:!bg-white/20">
            Disable kiosk mode
          </Button>
        ) : (
          <Button icon={Lock} size="lg" onClick={onEnable} className="!bg-white !text-red-700 hover:!bg-red-50">Enable kiosk mode</Button>
        )}
      </div>
    </section>
  );
}
