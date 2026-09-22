import { kioskService } from '../services/kioskService';

// "Today" for every employee screen: the calendar day in the kiosk's time zone (Manila), the same day the server
// uses for shifts and attendance, whatever the phone or computer's own clock and time zone say.
export const todayKey = () => kioskService.today();

// The highlight for a table row that belongs to today: a soft blue tint and a bar on the left edge.
// (Use together with <TodayBadge /> next to the date so it never relies on colour alone.)
const TODAY_ROW = 'bg-blue-50/70 shadow-[inset_3px_0_0_#3B82F6]';
export const todayRowClass = (dateKey) => (dateKey === todayKey() ? TODAY_ROW : '');

// Whether a date range (inclusive, YYYY-MM-DD) covers today
export const coversToday = (startDate, endDate) => {
  const t = todayKey();
  return startDate <= t && t <= endDate;
};
