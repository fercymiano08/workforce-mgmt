import clsx from 'clsx';

export default function Card({ children, className, padding = true, hover = false, onClick, ...props }) {
  return (
    <div
      onClick={onClick}
      className={clsx(
        'bg-white rounded-2xl border border-gray-100/80 shadow-sm',
        padding && 'p-6',
        hover && 'hover:bg-gray-50/50 transition-colors cursor-pointer',
        onClick && 'cursor-pointer',
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className, action }) {
  return (
    <div className={clsx('flex items-center justify-between mb-5', className)}>
      <div>{children}</div>
      {action && <div>{action}</div>}
    </div>
  );
}

export function CardTitle({ children, className }) {
  return <h3 className={clsx('text-[15px] font-semibold text-gray-900', className)}>{children}</h3>;
}

export function CardDescription({ children, className }) {
  return <p className={clsx('text-[13px] text-gray-500 mt-0.5', className)}>{children}</p>;
}
