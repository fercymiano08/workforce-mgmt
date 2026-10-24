// Philippine semi-monthly pay periods: the 1st-15th, or the 16th through the end of the month.
// Mirrors TimesheetGenerationService::periodStart()/periodEnd() on the backend exactly - both sides
// have to agree on where a period starts, or "this period" would mean different dates to each.
import { toDateKey } from '../services/attendanceService';

export const periodStartOf = (date) => {
  const d = new Date(date);
  return d.getDate() <= 15 ? new Date(d.getFullYear(), d.getMonth(), 1) : new Date(d.getFullYear(), d.getMonth(), 16);
};

export const periodEndOf = (start) => {
  const d = new Date(start);
  return d.getDate() === 1 ? new Date(d.getFullYear(), d.getMonth(), 15) : new Date(d.getFullYear(), d.getMonth() + 1, 0);
};

/** Step `offset` periods away from today's period (0 = current, -1 = previous, +1 = next). */
export const periodByOffset = (offset) => {
  let start = periodStartOf(new Date());
  if (offset > 0) {
    for (let i = 0; i < offset; i++) start = periodStartOf(new Date(periodEndOf(start).getTime() + 86400000));
  } else if (offset < 0) {
    for (let i = 0; i < -offset; i++) start = periodStartOf(new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1));
  }
  return { start, end: periodEndOf(start) };
};

/** Every date key (YYYY-MM-DD) in [start, end], inclusive. */
export const daysInPeriod = (start, end) => {
  const days = [];
  for (let d = new Date(start); toDateKey(d) <= toDateKey(end); d.setDate(d.getDate() + 1)) {
    days.push(toDateKey(d));
  }
  return days;
};

export const periodLabel = (start, end) => {
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const fmt = (d, withMonth) => d.toLocaleDateString('en-US', { month: withMonth ? 'short' : undefined, day: 'numeric' });
  const year = end.getFullYear();
  return sameMonth
    ? `${fmt(start, true)} – ${fmt(end, false)}, ${year}`
    : `${fmt(start, true)} – ${fmt(end, true)}, ${year}`;
};

/** The deadline a period's timesheet is auto-submitted at, if nobody does it first: 8am the day after it ends. */
export const periodDueAt = (end) => {
  const d = new Date(end);
  d.setDate(d.getDate() + 1);
  d.setHours(12, 0, 0, 0);
  return d;
};
