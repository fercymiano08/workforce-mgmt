import clsx from 'clsx';

const variants = {
  default: 'bg-gray-100 text-gray-600',
  primary: 'bg-blue-50 text-blue-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  info: 'bg-sky-50 text-sky-700',
  purple: 'bg-purple-50 text-purple-700',
  pink: 'bg-pink-50 text-pink-700',
};

const dotVariants = {
  default: 'bg-gray-500',
  primary: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
  info: 'bg-sky-500',
  purple: 'bg-purple-500',
  pink: 'bg-pink-500',
};

export default function Badge({ children, variant = 'default', dot = false, className, size = 'sm' }) {
  const sizeClasses = {
    xs: 'px-2 py-0.5 text-[10px]',
    sm: 'px-2.5 py-1 text-[11px]',
    md: 'px-3 py-1.5 text-xs',
  };

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 font-semibold rounded-full whitespace-nowrap',
        variants[variant],
        sizeClasses[size],
        className
      )}
    >
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', dotVariants[variant])} />}
      {children}
    </span>
  );
}
