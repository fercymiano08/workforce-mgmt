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

export function SkeletonList({ rows = 5, className }) {
  return (
    <div className={clsx('bg-white rounded-2xl border border-gray-100 p-4 space-y-4', className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <SkeletonLine className="w-9 h-9 rounded-lg" />
          <div className="flex-1 space-y-2">
            <SkeletonLine className="w-2/3 h-3" />
            <SkeletonLine className="w-1/3 h-3" />
          </div>
          <SkeletonLine className="w-16 h-5 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function SkeletonChart({ className }) {
  return (
    <div className={clsx('bg-white rounded-2xl border border-gray-100 p-6 space-y-4', className)}>
      <div className="flex items-center justify-between">
        <SkeletonLine className="w-40 h-5" />
        <SkeletonLine className="w-20 h-6 rounded-full" />
      </div>
      <SkeletonLine className="w-full h-60" />
      <div className="flex gap-5 justify-center">
        <SkeletonLine className="w-16 h-3" />
        <SkeletonLine className="w-16 h-3" />
        <SkeletonLine className="w-16 h-3" />
      </div>
    </div>
  );
}

export function SkeletonPage({ kpiCount = 5 }) {
  const cols = kpiCount <= 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-5';
  return (
    <div className="max-w-7xl mx-auto space-y-7">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="space-y-2">
          <SkeletonLine className="w-48 h-7" />
          <SkeletonLine className="w-72 h-3.5" />
        </div>
        <SkeletonLine className="w-36 h-10 rounded-xl" />
      </div>
      <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols} gap-6`}>
        {Array.from({ length: kpiCount }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <SkeletonLine className="w-11 h-11 rounded-xl" />
              <SkeletonLine className="w-14 h-8" />
            </div>
            <div className="space-y-2">
              <SkeletonLine className="w-2/3 h-3" />
              <SkeletonLine className="w-1/2 h-3" />
            </div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SkeletonChart className="lg:col-span-2" />
        <SkeletonList rows={5} />
      </div>
      <SkeletonTable rows={4} />
    </div>
  );
}
