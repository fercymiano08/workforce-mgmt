import clsx from 'clsx';

export function SkeletonLine({ className }) {
  return <div className={clsx('skeleton h-4', className)} />;
}

export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-3">
      <SkeletonLine className="w-1/3 h-5" />
      {Array.from({ length: lines }).map((_, i) => (
        <SkeletonLine key={i} className={i === lines - 1 ? 'w-2/3' : 'w-full'} />
      ))}
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
      {Array.from({ length: rows }).map((_, row) => (
        <div key={row} className="flex gap-4">
          {Array.from({ length: cols }).map((_, col) => (
            <SkeletonLine key={col} className={clsx('h-8', col === 0 ? 'w-1/4' : 'flex-1')} />
          ))}
        </div>
      ))}
    </div>
  );
}
