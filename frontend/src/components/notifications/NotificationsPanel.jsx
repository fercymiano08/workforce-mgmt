import { useMemo, useState } from 'react';
import { Bell, Trash2, CheckCheck } from 'lucide-react';
import clsx from 'clsx';
import { useNotifications } from '../../context/NotificationContext';
import { getRelativeTime } from '../../utils/helpers';
import { notificationTypeConfig, notificationPriorityColors } from '../../constants/notificationTypes';
import Button from '../ui/Button';
import Card from '../ui/Card';
import EmptyState from '../ui/EmptyState';
import { Pagination } from '../ui/Table';

const ROWS_PER_PAGE = 15;

// Full notification list, identical for HR Managers and Employees - each POV
// gets its own thin page (pages/HR_Manager/Notifications.jsx and
// pages/Employee/Notifications.jsx) that renders this, since the underlying
// data is already scoped to the logged-in user by the API.
export default function NotificationsPanel() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const [filter, setFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);

  const filtered = useMemo(() => {
    if (filter === 'unread') return notifications.filter((n) => !n.read);
    if (filter === 'read') return notifications.filter((n) => n.read);
    return notifications;
  }, [notifications, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ROWS_PER_PAGE));
  const paginated = filtered.slice((currentPage - 1) * ROWS_PER_PAGE, currentPage * ROWS_PER_PAGE);

  const changeFilter = (next) => {
    setFilter(next);
    setCurrentPage(1);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Notifications</h1>
          <p className="text-[14px] text-gray-500 mt-1">Everything that's happened, all in one place</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" icon={CheckCheck} onClick={markAllAsRead}>
            Mark all read
          </Button>
        )}
      </div>

      <div className="flex items-center gap-1">
        {['all', 'unread', 'read'].map((tab) => (
          <button
            key={tab}
            onClick={() => changeFilter(tab)}
            className={clsx(
              'px-3.5 py-1.5 rounded-lg text-xs font-medium transition-all duration-200 capitalize',
              filter === tab ? 'bg-blue-50 text-blue-700' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-100'
            )}
          >
            {tab}
            {tab === 'unread' && unreadCount > 0 && <span className="ml-1 text-[10px]">({unreadCount})</span>}
          </button>
        ))}
      </div>

      <Card padding={false}>
        {paginated.length === 0 ? (
          <div className="py-16 px-4">
            <EmptyState icon={Bell} title="No notifications" description="You're all caught up! Check back later." />
          </div>
        ) : (
          <ul className="divide-y divide-gray-50">
            {paginated.map((notification) => {
              const config = notificationTypeConfig[notification.type] || notificationTypeConfig.system;
              const Icon = config.icon;
              return (
                <li
                  key={notification.id}
                  onClick={() => markAsRead(notification.id)}
                  className={clsx(
                    'group px-5 py-4 flex items-start gap-3.5 cursor-pointer transition-colors border-l-2 hover:bg-gray-50/50',
                    !notification.read ? 'bg-blue-50/30 border-l-blue-500' : 'border-l-transparent'
                  )}
                >
                  <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', config.bg)}>
                    <Icon className={clsx('w-5 h-5', config.color)} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={clsx('text-sm leading-snug', !notification.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700')}>
                        {notification.title}
                      </p>
                      {!notification.read && <span className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0 mt-1.5" />}
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5">{notification.message}</p>
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
                    className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {totalPages > 1 && (
          <div className="px-4 border-t border-gray-100">
            <Pagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} />
          </div>
        )}
      </Card>
    </div>
  );
}
