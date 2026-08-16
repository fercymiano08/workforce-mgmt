import clsx from 'clsx';
import { TrendingUp, TrendingDown } from 'lucide-react';

const accentStyles = {
  blue: { iconBg: 'bg-blue-50', iconText: 'text-blue-600', bar: 'bg-blue-500' },
  emerald: { iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', bar: 'bg-emerald-500' },
  amber: { iconBg: 'bg-amber-50', iconText: 'text-amber-600', bar: 'bg-amber-500' },
  red: { iconBg: 'bg-red-50', iconText: 'text-red-600', bar: 'bg-red-500' },
  purple: { iconBg: 'bg-purple-50', iconText: 'text-purple-600', bar: 'bg-purple-500' },
};

export default function KpiCard({ label, value, icon: Icon, change, changeType, accent = 'blue', changeLabel = 'vs last week', noBar = false, subtext }) {
  const style = accentStyles[accent] || accentStyles.blue;
  const isPositive = changeType === 'increase';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5 relative overflow-hidden flex flex-col">
      <div className="flex items-start justify-between gap-3 flex-1">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-gray-400 truncate">{label}</p>
          <p className="text-[30px] font-bold text-gray-900 mt-2 tracking-tight leading-none">{value}</p>
          {subtext && <p className="text-xs text-gray-400 mt-3">{subtext}</p>}
          {change && (
            <div className="flex items-center gap-1.5 mt-3">
              {isPositive ? (
                <TrendingUp className={clsx('w-3 h-3', accent === 'red' ? 'text-red-500' : 'text-emerald-500')} />
              ) : (
                <TrendingDown className="w-3 h-3 text-emerald-500" />
              )}
              <span className={clsx(
                'text-xs font-semibold',
                changeType === 'decrease' ? 'text-emerald-600' : accent === 'red' ? 'text-red-600' : 'text-emerald-600'
              )}>
                {change}
              </span>
              <span className="text-[11px] text-gray-400">{changeLabel}</span>
            </div>
          )}
        </div>
        <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', style.iconBg)}>
          <Icon className={clsx('w-5 h-5', style.iconText)} />
        </div>
      </div>
      {!noBar && <div className={clsx('absolute bottom-0 left-0 right-0 h-[3px]', style.bar)} />}
    </div>
  );
}
