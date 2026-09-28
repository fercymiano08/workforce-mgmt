import { kioskService } from '../services/kioskService';

// "Today" for every employee screen: the calendar day in the kiosk's time zone (Manila), the same day the server
// uses for shifts and attendance, whatever the phone or computer's own clock and time zone say.
export const todayKey = () => kioskService.today();

// The highlight for a table row that belongs to today: a soft blue tint and a bar on the left edge.
// (Use together with <TodayBadge /> next to the date so it never relies on colour alone.)
const TODAY_ROW = 'bg-blue-50/70 shadow-[inset_3px_0_0_#3B82F6]';
export const todayRowClass = (dateKey) => (dateKey === todayKey() ? TODAY_ROW : '');

// "This week" everywhere in the system: Monday to Sunday (ISO 8601, Monday = day 1), around today in Manila.
// Returns YYYY-MM-DD keys, so it can be compared straight against record dates. JavaScript's getDay() counts
// Sunday as 0, which is why every week calculation goes through here instead of using it directly.
export const weekOf = (dateKey = todayKey()) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const monday = new Date(day.getTime() - ((day.getUTCDay() + 6) % 7) * 86400000);
  const key = (date) => date.toISOString().slice(0, 10);
  const days = Array.from({ length: 7 }, (_, i) => key(new Date(monday.getTime() + i * 86400000)));
  return { start: days[0], end: days[6], days };
};
export const thisWeek = () => weekOf(todayKey());

// The Monday-to-Sunday week at or before `from` that actually holds a record, for a chart that must
// always have something to draw. Seven days is the whole point: a chart pinned to the current week
// renders as a completely empty card whenever that week has no clock-ins yet, which is most of the
// time between demos, and a chart built from "the last N records" instead collapses to a handful of
// fat blocks when someone has only attended a day or two.
//
// Returns the seven YYYY-MM-DD keys, which week is safe to compare against record dates directly.
// `weeksBack` is 0 for the current week, so the caller can label the card honestly. Bounded by
// maxWeeksBack so a dataset with no usable dates falls back to the current week instead of looping.
export const weekWithRecords = (recordDates, from = todayKey(), maxWeeksBack = 12) => {
  const has = new Set(recordDates);
  const current = weekOf(from);
  for (let back = 0; back <= maxWeeksBack; back += 1) {
    const [y, m, d] = current.start.split('-').map(Number);
    const monday = new Date(Date.UTC(y, m - 1, d - 7 * back));
    const days = Array.from({ length: 7 }, (_, i) => new Date(monday.getTime() + i * 86400000).toISOString().slice(0, 10));
    if (days.some((key) => has.has(key))) {
      return { days, weeksBack: back, start: days[0], end: days[6] };
    }
  }
  return { days: current.days, weeksBack: 0, start: current.start, end: current.end };
};

// "Mon 21" for a YYYY-MM-DD key: the weekday plus the date, so a week that is not the current one
// still says which week it is on the axis.
export const dayTick = (dateKey) => {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return `${date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' })} ${date.getUTCDate()}`;
};

// "Sep 21 – Sep 27" for a week returned by weekWithRecords, used as the chart's badge.
export const weekRangeLabel = (startKey, endKey) => {
  const parse = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d));
  };
  const fmt = (date) => date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(parse(startKey))} – ${fmt(parse(endKey))}`;
};

// Whether a date range (inclusive, YYYY-MM-DD) covers today
export const coversToday = (startDate, endDate) => {
  const t = todayKey();
  return startDate <= t && t <= endDate;
};
