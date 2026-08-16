import clsx from 'clsx';
import Badge from '../ui/Badge';

export default function ChartCard({ title, badge, badgeVariant = 'primary', children, className }) {
  return (
    <div className={clsx('bg-white rounded-2xl border border-gray-100 shadow-sm p-6 overflow-hidden', className)}>
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-base font-semibold text-gray-900 tracking-tight">{title}</h3>
        {badge && <Badge variant={badgeVariant} size="sm">{badge}</Badge>}
      </div>
      {children}
    </div>
  );
}
