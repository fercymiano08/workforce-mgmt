import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import { X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';

const ToastContext = createContext(null);

// Toast component that renders inside the provider
function ToastContainer({ toasts, removeToast }) {
  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 max-w-sm">
      {toasts.map(toast => {
        const icons = {
          success: <CheckCircle className="w-5 h-5 text-emerald-500" />,
          error: <AlertCircle className="w-5 h-5 text-red-500" />,
          warning: <AlertTriangle className="w-5 h-5 text-amber-500" />,
          info: <Info className="w-5 h-5 text-blue-500" />,
        };
        const bgColors = {
          success: 'bg-emerald-50 border-emerald-200',
          error: 'bg-red-50 border-red-200',
          warning: 'bg-amber-50 border-amber-200',
          info: 'bg-blue-50 border-blue-200',
        };
        return (
          <div key={toast.id} className={`animate-slideUp flex items-start gap-3 p-4 rounded-xl border shadow-lg ${bgColors[toast.type || 'info']}`}>
            {icons[toast.type || 'info']}
            <div className="flex-1">
              <p className="font-medium text-sm text-gray-900">{toast.title}</p>
              {toast.message && <p className="text-xs text-gray-600 mt-0.5">{toast.message}</p>}
            </div>
            <button onClick={() => removeToast(toast.id)} className="text-gray-400 hover:text-gray-600">
              <X className="w-4 h-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const removeToast = useCallback((id) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((toast) => {
    const id = Date.now() + Math.random();
    setToasts(prev => [...prev, { ...toast, id }]);
    setTimeout(() => removeToast(id), toast.duration || 4000);
  }, [removeToast]);

  const toast = useMemo(
    () => ({
      success: (title, message) => addToast({ type: 'success', title, message }),
      error: (title, message) => addToast({ type: 'error', title, message }),
      warning: (title, message) => addToast({ type: 'warning', title, message }),
      info: (title, message) => addToast({ type: 'info', title, message }),
    }),
    [addToast]
  );

  return (
    <ToastContext.Provider value={{ toast, toasts, removeToast }}>
      {children}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </ToastContext.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
};
