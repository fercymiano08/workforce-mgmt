import { useEffect, useRef, useState } from 'react';
import { BellRing, Clock, Hourglass } from 'lucide-react';
import { attendanceService } from '../../services/api';
import { formatTime } from '../../utils/helpers';

function toMinutes(value) {
  const parts = String(value || '').split(':').map(Number);
  if (parts.length < 2 || parts.some(Number.isNaN)) return null;
  return parts[0] * 60 + parts[1];
}

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatRemaining(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export default function ShiftTimer({ activeAttendance, shiftStartTime = '08:00', shiftEndTime = '17:00', shiftName = '', overtimeHours = 0 }) {
  const [now, setNow] = useState(() => new Date());
  const [reminderSent, setReminderSent] = useState(false);
  const sentRef = useRef(false);

  const clockedIn = Boolean(activeAttendance?.clockIn && !activeAttendance?.clockOut);

  useEffect(() => {
    if (!clockedIn) return;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [clockedIn]);

  const remainingSeconds = (() => {
    if (!clockedIn) return null;
    const startMin = toMinutes(shiftStartTime);
    const endMin = toMinutes(shiftEndTime);
    if (startMin == null || endMin == null) return 0;
    const target = new Date(now);
    target.setHours(Math.floor(endMin / 60), endMin % 60, 0, 0);
    if (endMin <= startMin) target.setDate(target.getDate() + 1);
    return Math.max(0, Math.floor((target - now) / 1000));
  })();

  useEffect(() => {
    if (!clockedIn || remainingSeconds !== 0 || sentRef.current) return;
    sentRef.current = true;
    (async () => {
      try {
        await attendanceService.remindClockOut();
        setReminderSent(true);
      } catch {
        sentRef.current = false;
      }
    })();
  }, [remainingSeconds, clockedIn]);

  const active = clockedIn && remainingSeconds !== null;
  const ended = active && remainingSeconds === 0;

  return (
    <div className={`bg-white rounded-2xl border shadow-sm p-5 flex items-center justify-between flex-wrap gap-4 transition-colors ${
      ended ? 'border-amber-300 bg-amber-50' : 'border-gray-100'
    }`}>
      <div className="flex items-center gap-4">
        <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${
          ended ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-blue-600'
        }`}>
          {ended ? <BellRing className="w-5 h-5" /> : active ? <Hourglass className="w-5 h-5" /> : <Clock className="w-5 h-5" />}
        </div>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Shift Timer</p>
          {!clockedIn ? (
            <p className="text-sm font-medium text-gray-500">Not clocked in yet — the countdown starts on clock-in</p>
          ) : ended ? (
            <div>
              <p className="text-sm font-semibold text-amber-700">Shift ended — clock out now</p>
              {reminderSent && <p className="text-xs text-amber-600 mt-0.5">Clock-out reminder sent to your notifications</p>}
            </div>
          ) : (
            <p className="text-sm font-medium text-gray-700">
              {shiftName ? `${shiftName} ends at ` : 'Shift ends at '}
              <span className="font-semibold text-gray-900">{formatTime(shiftEndTime)}</span>
              {overtimeHours > 0 && (
                <span className="text-blue-600 font-medium"> · +{overtimeHours}h overtime</span>
              )}
            </p>
          )}
        </div>
      </div>
      <div className="text-right">
        <p className={`font-mono text-3xl font-bold tabular-nums ${ended ? 'text-amber-600' : 'text-blue-600'}`}>
          {active ? formatRemaining(remainingSeconds) : '--:--:--'}
        </p>
        <p className="text-[11px] uppercase tracking-wider text-gray-400 mt-1">
          {ended ? 'Overtime started' : 'until shift end'}
        </p>
      </div>
    </div>
  );
}
