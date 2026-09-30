import { createContext, useContext, useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { notificationService } from '../services/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

// How long a new-notification popup stays on screen (ms).
const TOAST_LIFETIME = 6000;

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toasts, setToasts] = useState([]);

  // Tracks which notification ids have already been seen so that only
  // genuinely NEW arrivals pop up. The first load after login never pops -
  // it just seeds the set - otherwise every login would replay old items.
  const seenIdsRef = useRef(new Set());
  const initializedRef = useRef(false);
  const toastSeqRef = useRef(0);

  // The red badge is the server's count of EVERY unread row, not a local count
  // over the fetched list - that list is the newest 200 only, so beyond that it
  // undercounts, and it lags a just-arrived item between polls. The server count
  // is the same source the badge claims to show, so it can never disagree with
  // itself.
  const refreshUnread = useCallback(async () => {
    if (!user) {
      setUnreadCount(0);
      return;
    }
    try {
      setUnreadCount(await notificationService.getUnreadCount());
    } catch {
      // A failed fetch keeps the last known number rather than pretending it is zero.
    }
  }, [user]);

  const refresh = useCallback(async () => {
    try {
      if (!user) {
        setNotifications([]);
        setUnreadCount(0);
        return;
      }
      const isEmployee = user.role === 'Employee';
      const data = isEmployee
        ? await notificationService.getByEmployeeId(user.id)
        : await notificationService.getAll();
      const list = data || [];
      setNotifications(list);

      if (!initializedRef.current) {
        list.forEach((n) => seenIdsRef.current.add(n.id));
        initializedRef.current = true;
        return;
      }

      const fresh = list.filter((n) => !seenIdsRef.current.has(n.id) && !n.read).slice(0, 3);
      list.forEach((n) => seenIdsRef.current.add(n.id));

      if (fresh.length > 0) {
        setToasts((prev) => [
          ...prev,
          ...fresh.map((n) => ({ key: `t${++toastSeqRef.current}`, ...n })),
        ].slice(-4));
      }
    } catch {
      // A failed poll (server busy, brief network drop) keeps the list already on screen instead of emptying the bell.
    } finally {
      refreshUnread();
    }
  }, [user, refreshUnread]);

  useEffect(() => {
    seenIdsRef.current = new Set();
    initializedRef.current = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets popups immediately on logout or account switch
    setToasts([]);
    refresh();
  }, [refresh]);

  useEffect(() => {
    // Poll only while the tab is visible - background tabs would otherwise keep
    // hitting the (single-threaded) services all day - and catch up as soon as
    // the tab is shown again.
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, 30000);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  useEffect(() => {
    if (toasts.length === 0) return undefined;
    const timer = setTimeout(() => {
      setToasts((prev) => prev.slice(1));
    }, TOAST_LIFETIME);
    return () => clearTimeout(timer);
  }, [toasts]);

  const dismissToast = useCallback((key) => {
    setToasts((prev) => prev.filter((t) => t.key !== key));
  }, []);

  const markAsRead = useCallback(async (id) => {
    try {
      await notificationService.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    } catch {
      // Do NOT pretend a failed write succeeded: the server still has it unread,
      // and the next poll would silently bring it back - the "I read it, but after
      // a refresh the same number is back" effect. Keep it unread on screen too.
    } finally {
      refreshUnread();
    }
  }, [refreshUnread]);

  const markAllAsRead = useCallback(async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {
      // Same honesty rule as markAsRead: leave the list and the badge alone.
    } finally {
      refreshUnread();
    }
  }, [refreshUnread]);

  const addNotification = useCallback(async (notification) => {
    try {
      const created = await notificationService.create(notification);
      setNotifications(prev => [created, ...prev]);
      refreshUnread();
      return created;
    } catch {
      return null;
    }
  }, [refreshUnread]);

  const deleteNotification = useCallback(async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    try {
      await notificationService.remove(id);
    } catch {
      /* optimistic removal already applied */
    } finally {
      refreshUnread();
    }
  }, [refreshUnread]);

  // Memoized so every useNotifications() consumer app-wide (not just the
  // bell icon) doesn't re-render on every 30-second poll unless something
  // actually changed.
  const value = useMemo(() => ({
    notifications, unreadCount, toasts, dismissToast,
    markAsRead, markAllAsRead, addNotification, deleteNotification, refresh,
  }), [notifications, unreadCount, toasts, dismissToast, markAsRead, markAllAsRead, addNotification, deleteNotification, refresh]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
};