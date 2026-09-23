import clsx from 'clsx';
import { ChevronDown } from 'lucide-react';

const COUNTRY_CODES = [
  { code: '+63', label: 'PH +63' },
  { code: '+1', label: 'US +1' },
  { code: '+44', label: 'UK +44' },
  { code: '+61', label: 'AU +61' },
  { code: '+64', label: 'NZ +64' },
  { code: '+65', label: 'SG +65' },
  { code: '+60', label: 'MY +60' },
  { code: '+852', label: 'HK +852' },
  { code: '+853', label: 'MO +853' },
  { code: '+86', label: 'CN +86' },
  { code: '+81', label: 'JP +81' },
  { code: '+82', label: 'KR +82' },
  { code: '+886', label: 'TW +886' },
  { code: '+66', label: 'TH +66' },
  { code: '+84', label: 'VN +84' },
  { code: '+62', label: 'ID +62' },
  { code: '+91', label: 'IN +91' },
  { code: '+971', label: 'AE +971' },
  { code: '+966', label: 'SA +966' },
  { code: '+49', label: 'DE +49' },
  { code: '+33', label: 'FR +33' },
  { code: '+34', label: 'ES +34' },
  { code: '+39', label: 'IT +39' },
  { code: '+55', label: 'BR +55' },
  { code: '+52', label: 'MX +52' },
];

const normalizeCode = (value = '') => {
  const trimmed = String(value).trim();
  if (!trimmed.startsWith('+')) return { code: '+63', local: trimmed };
  for (const { code } of COUNTRY_CODES) {
    if (trimmed.startsWith(code)) {
      return { code, local: trimmed.slice(code.length).replace(/^\s+/, '') };
    }
  }
  return { code: '+63', local: trimmed };
};

export default function PhoneInput({
  label,
  error,
  required,
  icon: Icon,
  value,
  onChange,
  containerClass,
  className,
  placeholder = '9XX XXX XXXX',
  ...props
}) {
  const { code, local } = normalizeCode(value);

  const emit = (nextCode, nextLocal) => {
    const digits = String(nextLocal || '').replace(/\D+/g, '').slice(0, 15);
    onChange?.(`${nextCode}${digits ? ` ${digits}` : ''}`);
  };

  return (
    <div className={clsx('flex flex-col gap-1.5', containerClass)}>
      {label && (
        <label className="text-[13px] font-medium text-gray-700">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}
      <div className="relative">
        {Icon && (
          <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 z-10">
            <Icon className="w-4 h-4" />
          </div>
        )}
        <div className={clsx(
          'flex w-full rounded-xl border border-gray-200 bg-white transition-all duration-200 focus-within:ring-2 focus-within:ring-blue-500/15 focus-within:border-blue-500 hover:border-gray-300 overflow-hidden',
          Icon && 'pl-10',
          error && 'border-red-300 focus-within:ring-red-500/15 focus-within:border-red-500',
          className
        )}>
          <div className="relative shrink-0">
            <select
              aria-label={label ? `${label} country code` : 'Country code'}
              value={code}
              onChange={(e) => emit(e.target.value, local)}
              className="appearance-none bg-gray-50 border-r border-gray-200 pl-3 pr-7 py-2.5 text-sm font-medium text-gray-700 focus:outline-none"
            >
              {COUNTRY_CODES.map((c) => (
                <option key={`${c.code}-${c.label}`} value={c.code}>{c.label}</option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
          <input
            type="tel"
            inputMode="tel"
            className="w-full min-w-0 px-3.5 py-2.5 text-sm focus:outline-none placeholder:text-gray-400"
            value={local}
            onChange={(e) => emit(code, e.target.value)}
            placeholder={placeholder}
            {...props}
          />
        </div>
      </div>
      {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
    </div>
  );
}