import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Bell, CheckCheck, X } from 'lucide-react';
import clsx from 'clsx';
import { useNotifications } from '../../context/NotificationContext';
import { getRelativeTime } from '../../utils/helpers';
import { notificationTypeConfig, notificationPriorityColors } from '../../constants/notificationTypes';
import EmptyState from '../ui/EmptyState';

// Note: outside-click-to-close is handled by the parent (Topbar), which wraps
// both the bell trigger button and this panel in a single ref. Handling it
// here too (against a ref covering only the panel) previously caused a race:
// the panel's own "click outside" listener and the trigger button's onClick
// toggle both fired on the same click, so closing via the bell button would
// instantly reopen the dropdown.
export default function NotificationDropdown({ isOpen, onClose }) {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [filter, setFilter] = useState('all');

  if (!isOpen) return null;

  const filtered = filter === 'unread'
    ? notifications.filter(n => !n.read)
    : filter === 'read'
      ? notifications.filter(n => n.read)
      : notifications;

  const displayNotifications = filtered.slice(0, 8);

  return (
    <div className="absolute right-0 top-full mt-2 w-[min(420px,calc(100vw-1.5rem))] bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 animate-scaleIn overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <h3 className="text-[15px] font-semibold text-gray-900">Notifications</h3>
          {unreadCount > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold">
              {unreadCount}
            </span>
          )}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllAsRead}
            className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1 transition-colors"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all read
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div className="px-5 py-2.5 border-b border-gray-50 flex items-center gap-1">
        {['all', 'unread', 'read'].map(tab => (
          <button
            key={tab}
            onClick={() => setFilter(tab)}
            className={clsx(
              'px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 capitalize',
              filter === tab
                ? 'bg-blue-50 text-blue-700'
                : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
            )}
          >
            {tab}
            {tab === 'unread' && unreadCount > 0 && (
              <span className="ml-1 text-[10px]">({unreadCount})</span>
            )}
          </button>
        ))}
      </div>

      {/* Notification List */}
      <div className="max-h-[400px] overflow-y-auto">
        {displayNotifications.length === 0 ? (
          <div className="py-8 px-4">
            <EmptyState
              icon={Bell}
              title="No notifications"
              description="You're all caught up! Check back later."
            />
          </div>
        ) : (
          displayNotifications.map(notification => {
            const config = notificationTypeConfig[notification.type] || notificationTypeConfig.system;
            const Icon = config.icon;
            return (
              <div
                key={notification.id}
                onClick={() => markAsRead(notification.id)}
                className={clsx(
                  'group px-5 py-3.5 flex items-start gap-3 cursor-pointer transition-colors border-l-2 hover:bg-gray-50/50',
                  !notification.read ? 'bg-blue-50/30 border-l-blue-500' : 'border-l-transparent'
                )}
              >
                <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0', config.bg)}>
                  <Icon className={clsx('w-4 h-4', config.color)} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <p className={clsx(
                      'text-[13px] leading-snug',
                      !notification.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'
                    )}>
                      {notification.title}
                    </p>
                    {!notification.read && (
                      <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notification.message}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[11px] text-gray-400">{getRelativeTime(notification.timestamp)}</span>
                    {notification.priority && (
                      <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full', notificationPriorityColors[notification.priority])}>
                        {notification.priority}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteNotification(notification.id); }}
                  className="p-1 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* Footer */}
      {displayNotifications.length > 0 && (
        <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50">
          <Link
            to="/notifications"
            onClick={onClose}
            className="block w-full text-center text-xs font-medium text-blue-600 hover:text-blue-700 transition-colors py-1"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
