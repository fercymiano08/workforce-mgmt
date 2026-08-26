import { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { notificationService } from '../services/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

// How long a new-notification popup stays on screen (ms).
const TOAST_LIFETIME = 6000;

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [toasts, setToasts] = useState([]);

  // Tracks which notification ids have already been seen so that only
  // genuinely NEW arrivals pop up. The first load after login never pops -
  // it just seeds the set - otherwise every login would replay old items.
  const seenIdsRef = useRef(new Set());
  const initializedRef = useRef(false);
  const toastSeqRef = useRef(0);

  const refresh = useCallback(async () => {
    try {
      if (!user) {
        setNotifications([]);
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
      setNotifications([]);
    }
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resets popups/seen-set immediately on logout or account switch
    seenIdsRef.current = new Set();
    initializedRef.current = false;
    setToasts([]);
    refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
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

  const unreadCount = notifications.filter(n => !n.read).length;

  const markAsRead = useCallback(async (id) => {
    try {
      const updated = await notificationService.markAsRead(id);
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, ...updated } : n));
    } catch {
      setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    }
  }, []);

  const markAllAsRead = useCallback(async () => {
    try {
      await notificationService.markAllAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }
  }, []);

  const addNotification = useCallback(async (notification) => {
    try {
      const created = await notificationService.create(notification);
      setNotifications(prev => [created, ...prev]);
      return created;
    } catch {
      return null;
    }
  }, []);

  const deleteNotification = useCallback(async (id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
    try {
      await notificationService.remove(id);
    } catch {
      /* optimistic removal already applied */
    }
  }, []);

  return (
    <NotificationContext.Provider value={{
      notifications, unreadCount, toasts, dismissToast,
      markAsRead, markAllAsRead, addNotification, deleteNotification, refresh,
    }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
};
