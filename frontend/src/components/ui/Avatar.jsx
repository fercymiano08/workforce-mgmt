import clsx from 'clsx';

const sizeMap = {
  xs: 'w-6 h-6 text-[10px]',
  sm: 'w-8 h-8 text-[11px]',
  md: 'w-9 h-9 text-xs',
  lg: 'w-11 h-11 text-sm',
  xl: 'w-14 h-14 text-base',
  '2xl': 'w-20 h-20 text-xl',
};

const colors = [
  'bg-blue-500',
  'bg-emerald-500',
  'bg-purple-500',
  'bg-amber-500',
  'bg-rose-500',
  'bg-cyan-500',
  'bg-indigo-500',
  'bg-pink-500',
];

export default function Avatar({ src, firstName = '', lastName = '', size = 'md', className, online }) {
  const first = firstName.trim();
  const last = lastName.trim();
  const initials = last
    ? `${first[0] || ''}${last[0] || ''}`.toUpperCase()
    : first.slice(0, 2).toUpperCase();
  const colorIndex = (first.charCodeAt(0) || 0) % colors.length;

  return (
    <div className={clsx('relative inline-flex items-center justify-center rounded-full flex-shrink-0', sizeMap[size], className)}>
      {src ? (
        <img src={src} alt={`${first} ${last}`} className="w-full h-full rounded-full object-cover" />
      ) : (
        <div className={clsx('w-full h-full rounded-full flex items-center justify-center text-white font-semibold', colors[colorIndex])}>
          {initials}
        </div>
      )}
      {online !== undefined && (
        <span
          className={clsx(
            'absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-[2px] border-white',
            online ? 'bg-emerald-400' : 'bg-gray-300'
          )}
        />
      )}
    </div>
  );
}
