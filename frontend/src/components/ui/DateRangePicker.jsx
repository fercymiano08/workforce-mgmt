import { useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import clsx from 'clsx';
import { todayKey, weekOf } from '../../utils/today';

/*
  A date range, chosen on a calendar.

  This replaces a row of period buttons. The buttons were buckets - "this week", "last 30 days" - and
  the only way to see one specific day was to pick the bucket you hoped was in it and then read past
  everything else. To answer "what happened on the 29th" you had to open the week, scroll to the 29th,
  and find the row. The bucket was never wrong, it was just a bigger question than the one being asked.

  Here the range is the question. Click a start day, click an end day, and the table holds exactly that.
  The presets are kept, because "last 30 days" is a real thing to ask and re-typing it on a calendar
  would be silly, but they are shortcuts into the same control rather than the only way in.

  Everything is a YYYY-MM-DD string, computed in UTC, because that is what record dates are and what
  the server filters on. Building the dates with local-time Date methods is how a range silently shifts
  by a day for anyone east or west of UTC - the calendar would say the 29th and the table would show
  the 30th. todayKey() is the server's own idea of today (Manila), not the phone's.
*/

const DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A YYYY-MM-DD key -> a UTC Date at midnight, so nothing is ever off by a timezone. */
const parse = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const key = (date) => date.toISOString().slice(0, 10);
const shift = (dateKey, days) => key(new Date(parse(dateKey).getTime() + days * 86400000));

/** "Today", "Yesterday", a week, a month, or N weeks back - the shortcuts, all ending on or around today. */
function buildPresets() {
  const t = todayKey();
  const monthStart = `${t.slice(0, 7)}-01`;
  const [y, m] = t.split('-').map(Number);
  // The last day of the previous month: new Date(UTC(year, month, 0)) rolls back to its last day.
  const lastMonthEnd = key(new Date(Date.UTC(y, m - 1, 0)));
  const lastMonthStart = `${lastMonthEnd.slice(0, 7)}-01`;

  return [
    { id: 'today', label: 'Today', from: t, to: t },
    { id: 'yesterday', label: 'Yesterday', from: shift(t, -1), to: shift(t, -1) },
    { id: 'week', label: 'This week', from: weekOf(t).start, to: t },
    { id: 'lastWeek', label: 'Last week', from: shift(weekOf(t).start, -7), to: shift(weekOf(t).start, -1) },
    { id: 'month', label: 'This month', from: monthStart, to: t },
    { id: 'lastMonth', label: 'Last month', from: lastMonthStart, to: lastMonthEnd },
    ...[2, 4, 6, 8, 12].map((n) => ({
      id: `w${n}`,
      label: `${n} weeks`,
      from: shift(t, -(n * 7 - 1)),
      to: t,
    })),
  ];
}

/** What the closed button says: "All time", "Today", "Sep 21 – 27", "Aug 30 – Sep 5". */
const rangeLabel = (range, fallback = 'All time') => {
  const { from, to } = range || {};
  if (!from || !to) return fallback;
  const t = todayKey();
  if (from === to) {
    if (from === t) return 'Today';
    if (from === shift(t, -1)) return 'Yesterday';
  }
  const a = parse(from);
  const b = parse(to);
  const sameYear = a.getUTCFullYear() === b.getUTCFullYear();
  const fmt = (date) => date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
    timeZone: 'UTC',
  });
  if (a.getUTCMonth() === b.getUTCMonth() && sameYear) {
    const month = a.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' });
    return `${month} ${a.getUTCDate()} – ${b.getUTCDate()}`;
  }
  return `${fmt(a)} – ${fmt(b)}`;
}

/** The six weeks of cells a month view draws, Monday-first, padded with the neighbouring months. */
function monthGrid(anchorKey) {
  const a = parse(anchorKey);
  const first = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1));
  const lead = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - lead * 86400000);
  return {
    anchor: a,
    days: Array.from({ length: 42 }, (_, i) => {
      const d = new Date(start.getTime() + i * 86400000);
      return {
        key: key(d),
        day: d.getUTCDate(),
        outside: d.getUTCMonth() !== a.getUTCMonth(),
      };
    }),
  };
}

export default function DateRangePicker({ value, onChange, className, allTimeLabel = 'All time' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const today = todayKey();

  // While the calendar is open it holds a half-made range: the first click sets a start and leaves the
  // end open. Committing on the second click is what makes "just the 29th" two clicks, not two controls.
  const [pending, setPending] = useState(null);
  const [anchor, setAnchor] = useState(() => (value?.from || today).slice(0, 7) + '-01');

  const range = pending || value || {};
  const presets = useMemo(() => buildPresets(), []);

  useEffect(() => {
    if (!open) return undefined;
    const onClickAway = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) {
        setOpen(false);
        setPending(null);
      }
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpen(false);
        setPending(null);
      }
    };
    document.addEventListener('mousedown', onClickAway);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClickAway);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const commit = (next) => {
    setPending(null);
    onChange(next);
  };

  const pickDay = (dayKey) => {
    // No range yet, or a finished one: this click starts a new range.
    if (!pending || (pending.from && pending.to)) {
      setPending({ from: dayKey, to: null });
      return;
    }
    // Second click. Tapping a day before the start swaps them rather than returning an empty range,
    // which is what a drag from right to left does and what people expect.
    if (dayKey < pending.from) {
      commit({ from: dayKey, to: pending.from });
    } else {
      commit({ from: pending.from, to: dayKey });
    }
  };

  const grid = monthGrid(anchor);
  const active = range.from && range.to;
  const anchorMonth = `${grid.anchor.getUTCFullYear()}-${String(grid.anchor.getUTCMonth() + 1).padStart(2, '0')}`;
  const thisMonth = today.slice(0, 7);

  const moveMonth = (delta) => {
    const a = grid.anchor;
    setAnchor(key(new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + delta, 1))));
  };

  return (
    <div ref={rootRef} className={clsx('relative', className)}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setPending(null);
          // Reopening lands the calendar on the month the current range starts in, so "change the end
          // date" does not also mean finding September again.
          if (value?.from) setAnchor(`${value.from.slice(0, 7)}-01`);
        }}
        aria-expanded={open}
        className={clsx(
          'w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 pointer-coarse:py-3 text-sm cursor-pointer transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-blue-500/15 focus:border-blue-500',
          value?.from && value?.to
            ? 'border-blue-300 bg-blue-50/60 font-medium text-blue-800'
            : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
        )}
      >
        <CalendarDays className="w-4 h-4 shrink-0" />
        <span className="truncate">{rangeLabel(value, allTimeLabel)}</span>
        {value?.from && value?.to && (
          <span
            role="button"
            tabIndex={0}
            aria-label="Clear the date range"
            onClick={(e) => {
              e.stopPropagation();
              commit({ from: null, to: null });
              setOpen(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                e.stopPropagation();
                commit({ from: null, to: null });
                setOpen(false);
              }
            }}
            className="-mr-1 ml-0.5 rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute z-50 mt-2 right-0 sm:left-0 sm:right-auto w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-gray-200 bg-white p-3 shadow-xl animate-fadeIn"
          role="dialog"
          aria-label="Choose a date range"
        >
          {/* Presets. The first row is the answers people actually give; the weeks are the
              "give me N weeks" case, which a calendar alone makes tedious. */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {presets.map((p) => {
              const selected = value?.from === p.from && value?.to === p.to;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => {
                    commit({ from: p.from, to: p.to });
                    setOpen(false);
                  }}
                  className={clsx(
                    'rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors',
                    selected
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200 hover:text-gray-900'
                  )}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between mb-2">
            <button
              type="button"
              onClick={() => moveMonth(-1)}
              aria-label="Previous month"
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <p className="text-sm font-semibold text-gray-800">
              {MONTHS[grid.anchor.getUTCMonth()]} {grid.anchor.getUTCFullYear()}
            </p>
            <button
              type="button"
              onClick={() => moveMonth(1)}
              aria-label="Next month"
              className="rounded-lg p-2 text-gray-400 hover:bg-gray-100 hover:text-gray-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 mb-1">
            {DOW.map((d) => (
              <div key={d} className="py-1 text-center text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                {d[0]}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-0.5">
            {grid.days.map((d) => {
              const inRange = active && range.from <= d.key && d.key <= range.to;
              const isEdge = active && (d.key === range.from || d.key === range.to);
              // After the first click the start day needs to be visible while the end day is still
              // being chosen, or the reader has no idea what the second click will finish.
              const isStart = pending && !pending.to && d.key === pending.from;
              const isToday = d.key === today;
              return (
                <button
                  key={d.key}
                  type="button"
                  onClick={() => pickDay(d.key)}
                  aria-pressed={isEdge}
                  className={clsx(
                    'relative h-9 rounded-lg text-[13px] transition-colors',
                    d.outside && !inRange && 'text-gray-300',
                    !d.outside && !inRange && 'text-gray-700 hover:bg-gray-100',
                    inRange && !isEdge && 'bg-blue-50 text-blue-900',
                    isEdge && 'bg-blue-600 font-semibold text-white hover:bg-blue-600',
                    isStart && 'ring-2 ring-inset ring-blue-600 font-semibold text-blue-800',
                    isToday && !isEdge && 'ring-1 ring-inset ring-blue-400 font-semibold text-blue-700'
                  )}
                >
                  {d.day}
                </button>
              );
            })}
          </div>

          <p className="mt-2 text-[11px] text-gray-500 min-h-[1rem]" aria-live="polite">
            {pending && !pending.to
              ? `Start ${pending.from} — now pick the end day`
              : active
                ? `${range.from} to ${range.to}`
                : 'Pick a start day, then an end day'}
          </p>

          <div className="flex items-center justify-between gap-2 mt-2 pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={() => {
                setAnchor(`${today.slice(0, 7)}-01`);
                commit({ from: today, to: today });
                setOpen(false);
              }}
              className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 transition-colors"
            >
              Just today
            </button>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  commit({ from: null, to: null });
                  setOpen(false);
                }}
                className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors"
              >
                All time
              </button>
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setPending(null);
                }}
                className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-gray-800 transition-colors"
              >
                Done
              </button>
            </div>
          </div>

          {anchorMonth !== thisMonth && (
            <button
              type="button"
              onClick={() => setAnchor(`${thisMonth}-01`)}
              className="mt-2 w-full rounded-lg py-1.5 text-xs font-medium text-gray-500 hover:bg-gray-100 transition-colors"
            >
              Back to this month
            </button>
          )}
        </div>
      )}
    </div>
  );
}
