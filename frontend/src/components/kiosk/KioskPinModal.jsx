import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import clsx from 'clsx';
import { X, Delete, Lock } from 'lucide-react';
import Button from '../ui/Button';

// Reusable 4-digit PIN entry with an on-screen numeric keypad (designed for
// touch tablets) plus physical keyboard support. Used both when the Admin
// creates the kiosk PIN and when the PIN is required to unlock the kiosk.
export default function KioskPinModal({
  isOpen,
  onClose,
  title = 'Enter PIN',
  subtitle = 'Enter your 4-digit PIN to continue.',
  onSubmit,
  submitting = false,
  error,
  allowCancel = true,
}) {
  const [pin, setPin] = useState('');
  const keypadRef = useRef(null);
  const [prevOpen, setPrevOpen] = useState(isOpen);
  const [prevError, setPrevError] = useState(error);

  if (isOpen && !prevOpen) {
    setPrevOpen(true);
    setPin('');
  }
  if (!isOpen && prevOpen) {
    setPrevOpen(false);
  }
  if (error !== prevError) {
    setPrevError(error);
    if (error) setPin('');
  }

  useEffect(() => {
    if (isOpen) keypadRef.current?.focus();
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e) => {
      if (/^[0-9]$/.test(e.key)) {
        setPin((prev) => (prev.length < 4 ? prev + e.key : prev));
      } else if (e.key === 'Backspace') {
        setPin((prev) => prev.slice(0, -1));
      } else if (e.key === 'Escape') {
        if (allowCancel) onClose();
      } else if (e.key === 'Enter' && pin.length === 4 && !submitting) {
        onSubmit?.(pin);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, pin, onSubmit, onClose, allowCancel, submitting]);

  useEffect(() => {
    if (isOpen && !submitting && pin.length === 4) {
      const timer = setTimeout(() => onSubmit?.(pin), 150);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isOpen, pin, onSubmit, submitting]);

  if (!isOpen) return null;

  const press = (digit) => setPin((prev) => (prev.length < 4 ? prev + digit : prev));
  const backspace = () => setPin((prev) => prev.slice(0, -1));

  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back'];

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm animate-fadeIn" onClick={() => allowCancel && onClose()} />
      <div
        ref={keypadRef}
        tabIndex={-1}
        onKeyDown={() => {}}
        className="relative w-full max-w-xs bg-white rounded-3xl shadow-2xl animate-[scaleIn_0.2s_ease-out] outline-none"
      >
        <div className="flex items-center justify-between px-5 pt-5">
          <div className="w-10 h-10 rounded-2xl bg-blue-50 flex items-center justify-center">
            <Lock className="w-5 h-5 text-blue-600" />
          </div>
          {allowCancel && (
            <button
              onClick={onClose}
              className="p-2 rounded-xl hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="px-5 pb-5 text-center">
          <h2 className="text-lg font-bold text-gray-900 mt-3">{title}</h2>
          <p className="text-xs text-gray-500 mt-1">{subtitle}</p>

          <div className="flex justify-center gap-3 mt-6">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={clsx(
                  'w-4 h-4 rounded-full border-2 transition-all duration-150',
                  pin.length > i ? 'bg-blue-600 border-blue-600 scale-110' : 'border-gray-300'
                )}
              />
            ))}
          </div>

          {error && (
            <p className="text-xs font-medium text-red-600 bg-red-50 rounded-xl px-3 py-2 mt-4 animate-fadeIn">
              {error}
            </p>
          )}

          <div className="grid grid-cols-3 gap-2.5 mt-6 select-none">
            {keys.map((key, idx) => {
              if (key === '') return <div key={idx} />;
              if (key === 'back') {
                return (
                  <button
                    key={idx}
                    type="button"
                    disabled={submitting}
                    onClick={backspace}
                    className="h-14 rounded-2xl bg-gray-50 hover:bg-gray-100 active:bg-gray-200 transition-colors flex items-center justify-center text-gray-500"
                  >
                    <Delete className="w-5 h-5" />
                  </button>
                );
              }
              return (
                <button
                  key={idx}
                  type="button"
                  disabled={submitting}
                  onClick={() => press(key)}
                  className="h-14 rounded-2xl bg-gray-100 hover:bg-gray-200 active:bg-blue-600 active:text-white transition-all text-lg font-semibold text-gray-900"
                >
                  {key}
                </button>
              );
            })}
          </div>

          <Button
            variant="primary"
            size="lg"
            className="w-full mt-5"
            loading={submitting}
            disabled={pin.length !== 4}
            onClick={() => onSubmit?.(pin)}
          >
            {submitting ? 'Verifying...' : 'Unlock'}
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
