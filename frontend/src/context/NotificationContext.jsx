import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { notificationService } from '../services/api';
import { useAuth } from './AuthContext';

const NotificationContext = createContext(null);

export function NotificationProvider({ children }) {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState([]);

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
      setNotifications(data || []);
    } catch {
      setNotifications([]);
    }
  }, [user]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clears notifications immediately when logged out
    refresh();
  }, [refresh]);

  useEffect(() => {
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);

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
    <NotificationContext.Provider value={{ notifications, unreadCount, markAsRead, markAllAsRead, addNotification, deleteNotification, refresh }}>
      {children}
    </NotificationContext.Provider>
  );
}

export const useNotifications = () => {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider');
  return ctx;
};
