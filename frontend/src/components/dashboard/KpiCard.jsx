import clsx from 'clsx';
import { Link } from 'react-router-dom';
import { TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';

const accentStyles = {
  blue: { iconBg: 'bg-blue-50', iconText: 'text-blue-600', bar: 'bg-blue-500', arrow: 'text-blue-500' },
  emerald: { iconBg: 'bg-emerald-50', iconText: 'text-emerald-600', bar: 'bg-emerald-500', arrow: 'text-emerald-500' },
  amber: { iconBg: 'bg-amber-50', iconText: 'text-amber-600', bar: 'bg-amber-500', arrow: 'text-amber-500' },
  red: { iconBg: 'bg-red-50', iconText: 'text-red-600', bar: 'bg-red-500', arrow: 'text-red-500' },
  purple: { iconBg: 'bg-purple-50', iconText: 'text-purple-600', bar: 'bg-purple-500', arrow: 'text-purple-500' },
};

/*
  A statistic you can act on.

  Given a `to`, the whole card becomes the link to the screen the number is about. Previously these
  were display-only boxes, so seeing "3 leave requests to decide" meant then hunting through the menu
  for where to go - the number and the action were in two different places. A card is a big, obvious
  target, which is worth more on a phone than on a desktop where the sidebar is always in view.

  Without `to` it renders exactly as before, so nothing changes for a card that has nowhere to send you.
*/
export default function KpiCard({ label, value, icon: Icon, change, changeType, accent = 'blue', changeLabel = 'vs last week', noBar = false, subtext, to }) {
  const style = accentStyles[accent] || accentStyles.blue;
  const isPositive = changeType === 'increase';

  const body = (
    <>
      <div className="flex items-start justify-between gap-3 flex-1">
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-medium text-gray-400 truncate">{label}</p>
          {/* A long value (e.g. "4122.46h" on a 2-up mobile grid) used to overflow this box and render
              straight through the icon next to it - unreadable, not just cramped. Smaller on a narrow
              screen first, so it rarely even needs to, and truncate as the backstop for whatever still
              doesn't fit, so it ellipsizes instead of colliding with anything. */}
          <p className="text-2xl sm:text-[30px] font-bold text-gray-900 mt-2 tracking-tight leading-none tabular-nums truncate" title={typeof value === 'string' || typeof value === 'number' ? String(value) : undefined}>{value}</p>
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
        <div className="flex items-start gap-2 shrink-0">
          {/* Sits between the icon and the edge, so the "this goes somewhere" cue is visible without
              moving the number. Hidden until hover/focus on a device that has a pointer, always shown
              on touch where there is no hover to discover it. */}
          {to && (
            <ArrowRight
              className={clsx(
                'w-4 h-4 mt-3.5 hidden sm:block opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100',
                style.arrow
              )}
            />
          )}
          <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center shrink-0', style.iconBg)}>
            <Icon className={clsx('w-5 h-5', style.iconText)} />
          </div>
        </div>
      </div>
      {!noBar && <div className={clsx('absolute bottom-0 left-0 right-0 h-[3px]', style.bar)} />}
    </>
  );

  const shell = 'bg-white rounded-2xl border border-gray-100 shadow-sm p-5 relative overflow-hidden flex flex-col';

  if (to) {
    return (
      <Link
        to={to}
        className={clsx(
          shell,
          'group transition-all duration-200 cursor-pointer',
          'hover:shadow-md hover:shadow-gray-900/[0.06] hover:border-gray-200 hover:-translate-y-0.5',
          'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40 focus-visible:border-blue-300',
          'active:translate-y-0 active:shadow-sm',
          // A whole card is a tap target on a phone, so give it a thumb-sized minimum.
          'min-h-[104px] sm:min-h-0'
        )}
      >
        {body}
      </Link>
    );
  }

  return <div className={shell}>{body}</div>;
}
