import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import SearchBar from '../components/ui/SearchBar';
import EmptyState from '../components/ui/EmptyState';
import { Pagination } from '../components/ui/Table';
import { useNotifications } from '../context/NotificationContext';
import { notificationTypeConfig, notificationPriorityColors } from '../constants/notificationTypes';
import { getRelativeTime, formatDate } from '../utils/helpers';
import { toDateKey } from '../services/attendanceService';

const PER_PAGE = 12;
const TABS = [['all', 'All'], ['unread', 'Unread'], ['important', 'Important']];

// Everything a person was told, in one place: the bell only shows the newest few.
export default function Notifications() {
  const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const navigate = useNavigate();
  const [tab, setTab] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return [...notifications]
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
      .filter((n) => (tab === 'unread' ? !n.read : tab === 'important' ? n.priority === 'high' : true))
      .filter((n) => !q || `${n.title} ${n.message}`.toLowerCase().includes(q));
  }, [notifications, tab, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const current = Math.min(page, pageCount);
  const visible = filtered.slice((current - 1) * PER_PAGE, current * PER_PAGE);

  const dayLabel = (iso) => {
    const key = toDateKey(new Date(iso));
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (key === toDateKey(today)) return 'Today';
    if (key === toDateKey(yesterday)) return 'Yesterday';
    return formatDate(key);
  };
  const groups = visible.reduce((acc, n) => {
    const label = dayLabel(n.timestamp);
    (acc[label] = acc[label] || []).push(n);
    return acc;
  }, {});

  const open = (n) => {
    if (!n.read) markAsRead(n.id);
    if (n.actionUrl) navigate(n.actionUrl);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Notifications</h1>
          <p className="text-sm text-gray-500">{unreadCount > 0 ? `${unreadCount} unread` : 'You are all caught up'} · {notifications.length} in total</p>
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" icon={CheckCheck} onClick={markAllAsRead}>Mark all as read</Button>
        )}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex gap-1 bg-gray-100 rounded-xl p-1 self-start">
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => { setTab(id); setPage(1); }}
              className={clsx('px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-colors', tab === id ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-500 hover:text-gray-700')}
            >
              {label}
            </button>
          ))}
        </div>
        <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search notifications..." className="flex-1" />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <EmptyState icon={Bell} title="Nothing here" description={search || tab !== 'all' ? 'No notification matches this filter.' : 'You are all caught up.'} />
        </Card>
      ) : (
        Object.entries(groups).map(([label, items]) => (
          <div key={label}>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-2 px-1">{label}</p>
            <Card className="!p-0 overflow-hidden divide-y divide-gray-50">
              {items.map((n) => {
                const config = notificationTypeConfig[n.type] || notificationTypeConfig.system;
                const Icon = config.icon;
                return (
                  <div
                    key={n.id}
                    onClick={() => open(n)}
                    className={clsx('group px-5 py-4 flex items-start gap-3 cursor-pointer hover:bg-gray-50/60 border-l-2', !n.read ? 'bg-blue-50/30 border-l-blue-500' : 'border-l-transparent')}
                  >
                    <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', config.bg)}>
                      <Icon className={clsx('w-4 h-4', config.color)} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className={clsx('text-sm', !n.read ? 'font-semibold text-gray-900' : 'font-medium text-gray-700')}>{n.title}</p>
                        {n.priority === 'high' && <span className={clsx('text-[10px] font-medium px-1.5 py-0.5 rounded-full', notificationPriorityColors.high)}>important</span>}
                      </div>
                      <p className="text-[13px] text-gray-500 mt-0.5">{n.message}</p>
                      <p className="text-[11px] text-gray-400 mt-1">{getRelativeTime(n.timestamp)}</p>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteNotification(n.id); }}
                      title="Delete"
                      className="p-1.5 rounded-md text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 pointer-coarse:opacity-100 transition"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                );
              })}
            </Card>
          </div>
        ))
      )}

      {pageCount > 1 && <Pagination currentPage={current} totalPages={pageCount} onPageChange={setPage} />}
    </div>
  );
}
