import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import Button from '../ui/Button';
import { authService } from '../../services/api';

// Employees are signed out after a few minutes without touching the system (the server tells us how many:
// 3 minutes). Real use - mouse, keys, touch, scrolling - resets the clock and keeps the login alive on the
// server; background refreshes (notification polling) do not. A warning with a countdown appears first,
// and any activity, or the button, keeps the session going. Administrators are never timed out.
const WARN_SECONDS = 30;          // the warning shows for the last 30 seconds
const KEEP_ALIVE_EVERY_MS = 10000; // at most one keep-alive call per 10 s of activity
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'];

export default function IdleSessionGuard() {
  const { user, logout } = useAuth();
  const timeoutSeconds = user?.role === 'Employee' ? user?.sessionTimeoutSeconds || 180 : 0;
  const [secondsLeft, setSecondsLeft] = useState(null);   // null = no warning showing
  const lastActivity = useRef(0);
  const lastKeepAlive = useRef(0);

  useEffect(() => {
    if (!timeoutSeconds) return undefined;

    lastActivity.current = Date.now();
    lastKeepAlive.current = Date.now();

    const keepAlive = () => {
      lastKeepAlive.current = Date.now();
      authService.keepAlive().catch(() => { /* an expired login is handled by the 401 handler */ });
    };

    const onActivity = () => {
      lastActivity.current = Date.now();
      if (Date.now() - lastKeepAlive.current > KEEP_ALIVE_EVERY_MS) keepAlive();
    };

    const check = () => {
      const idleMs = Date.now() - lastActivity.current;
      const left = Math.ceil((timeoutSeconds * 1000 - idleMs) / 1000);
      if (left <= 0) {
        try { window.sessionStorage.setItem('workforce_logout_reason', 'idle'); } catch { /* ignore */ }
        logout();
      } else {
        setSecondsLeft(left <= WARN_SECONDS ? left : null);
      }
    };

    EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 1000);
    return () => {
      EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      document.removeEventListener('visibilitychange', check);
      clearInterval(timer);
    };
  }, [timeoutSeconds, logout]);

  if (!timeoutSeconds || secondsLeft === null) return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center">
        <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center mx-auto mb-4">
          <Clock className="w-6 h-6 text-amber-600" />
        </div>
        <h3 className="text-lg font-bold text-gray-900">Are you still there?</h3>
        <p className="text-sm text-gray-500 mt-2">You have been inactive for a while. For your security you will be signed out in</p>
        <p className="text-4xl font-bold text-amber-600 tabular-nums mt-3">{secondsLeft}s</p>
        <Button className="w-full mt-5" size="lg" onClick={() => { lastActivity.current = Date.now(); lastKeepAlive.current = Date.now(); authService.keepAlive().catch(() => {}); setSecondsLeft(null); }}>
          Stay signed in
        </Button>
      </div>
    </div>,
    document.body,
  );
}
