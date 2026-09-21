import { useEffect, useState } from 'react';
import { ScanFace } from 'lucide-react';

const clockOf = (timezone) => {
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date());
  } catch {
    return '';
  }
};

// A miniature of the clock-in screen that follows the form as it is edited, so the device name,
// location and time zone can be checked before saving.
export default function KioskPreview({ deviceName, location, timezone }) {
  const [time, setTime] = useState(() => clockOf(timezone));

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- refresh immediately when the time zone changes, then tick
    setTime(clockOf(timezone));
    const timer = setInterval(() => setTime(clockOf(timezone)), 1000);
    return () => clearInterval(timer);
  }, [timezone]);

  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-400">Live preview</p>
      <div className="overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B1F3A] via-[#0E2747] to-[#0B1F3A] p-5 text-center shadow-lg ring-1 ring-black/5">
        <p className="truncate text-[11px] font-medium text-blue-200/70">
          WorkForce Pro Attendance Terminal · {deviceName || 'Device name'}
        </p>
        <p className="mt-4 text-4xl font-bold tabular-nums tracking-tight text-white">{time}</p>
        <p className="mt-1 text-xs text-blue-200/70">{timezone}</p>
        <div className="mx-auto mt-5 grid max-w-[260px] grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-emerald-500 py-3 text-xs font-bold text-white">Clock In</div>
          <div className="rounded-xl bg-white/10 py-3 text-xs font-bold text-white">Clock Out</div>
        </div>
        <p className="mt-4 inline-flex items-center gap-1.5 text-[11px] text-blue-200/70">
          <ScanFace className="h-3.5 w-3.5" /> Verified with facial recognition · {location || 'Location'}
        </p>
      </div>
    </div>
  );
}
