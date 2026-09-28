import clsx from 'clsx';
import { Eye, EyeOff, Lock } from 'lucide-react';
import { useState } from 'react';

// Chrome draws its own reveal button inside every type="password" field, on top of ours, so the
// form ends up showing two eyes. Keeping the input on type="password" cannot suppress it, so where
// -webkit-text-security is available the field is a type="text" input that is masked with CSS and
// Chrome never adds its own button. Browsers without that property (Firefox) have no native reveal
// either, so they fall back to a real type="password" and still show exactly one eye.
// The trade-off is that browsers treat a type="text" input as an ordinary field, so the "save this
// password?" prompt does not appear. Everything else - autoComplete, spellcheck, the toggle - is
// unchanged.
const CAN_MASK_WITH_CSS =
  typeof CSS !== 'undefined' && CSS.supports('-webkit-text-security', 'disc');

export default function PasswordInput({
  label,
  value,
  onChange,
  placeholder = '••••••••',
  autoComplete = 'current-password',
  minLength,
  required = true,
  className,
}) {
  const [visible, setVisible] = useState(false);

  const inputType = CAN_MASK_WITH_CSS || visible ? 'text' : 'password';
  const maskStyle = CAN_MASK_WITH_CSS && !visible ? { WebkitTextSecurity: 'disc' } : undefined;

  return (
    <div className={clsx('flex flex-col gap-1.5', className)}>
      {label && (
        <label className="block text-[13px] font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        <input
          type={inputType}
          value={value}
          onChange={onChange}
          required={required}
          minLength={minLength}
          placeholder={placeholder}
          autoComplete={autoComplete}
          spellCheck="false"
          autoCapitalize="none"
          autoCorrect="off"
          style={maskStyle}
          className="w-full pl-10 pr-10 py-2.5 text-sm rounded-xl border border-gray-200 bg-white transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500 placeholder:text-gray-400 hover:border-gray-300"
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500/30"
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
