import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useNotifications } from '../../context/NotificationContext';
import { notificationTypeConfig } from '../../constants/notificationTypes';
import clsx from 'clsx';

// Popups for notifications that arrive while the app is open. Clicking one
// marks it read and jumps to its actionUrl (e.g. the approval page). They
// also auto-dismiss after a few seconds (timer lives in NotificationContext).
export default function NotificationToasts() {
  const { toasts, dismissToast, markAsRead } = useNotifications();
  const navigate = useNavigate();

  if (toasts.length === 0) return null;

  const handleClick = (toast) => {
    markAsRead(toast.id);
    dismissToast(toast.key);
    if (toast.actionUrl) navigate(toast.actionUrl);
  };

  return (
    <div className="fixed top-20 right-4 sm:right-6 z-[60] flex flex-col gap-3 w-[min(360px,calc(100vw-2rem))] pointer-events-none">
      {toasts.map((toast) => {
        const config = notificationTypeConfig[toast.type] || notificationTypeConfig.system;
        const Icon = config.icon;
        return (
          <div
            key={toast.key}
            className="pointer-events-auto bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 flex items-start gap-3 animate-scaleIn"
          >
            <div className={clsx('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', config.bg)}>
              <Icon className={clsx('w-5 h-5', config.color)} />
            </div>
            <button
              onClick={() => handleClick(toast)}
              className="flex-1 min-w-0 text-left cursor-pointer group"
            >
              <p className="text-[13px] font-semibold text-gray-900 leading-snug group-hover:text-blue-700 transition-colors">
                {toast.title}
              </p>
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{toast.message}</p>
            </button>
            <button
              onClick={() => dismissToast(toast.key)}
              className="p-1 rounded-md text-gray-300 hover:text-gray-600 hover:bg-gray-100 transition-colors flex-shrink-0"
              aria-label="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
