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

// Whether a date range (inclusive, YYYY-MM-DD) covers today
export const coversToday = (startDate, endDate) => {
  const t = todayKey();
  return startDate <= t && t <= endDate;
};
