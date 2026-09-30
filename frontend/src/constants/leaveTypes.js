// Single source of truth for the color of each leave type in a CHART, so the dashboard pie, the
// analytics donut and the analytics stacked bar cannot drift apart.
//
// 'special' is rose here but purple on its badge. That is deliberate: in a chart the two land as
// adjacent segments, and purple sits too close to funeral's indigo (validated: deltaE 6.3, under the
// legibility floor of 15). Badges never touch, so they keep the nicer purple. The badge variants
// live in pages/Employee/Leave.jsx (leaveTypeVariant) and the badge styles in leaveBalanceStyle.
//
// The six keys here are exactly the six in Employee::defaultLeaveBalances(). An earlier copy of this
// map was missing Funeral and Unpaid and carried a 'Half Day' that does not exist, so both real
// types fell through to the same fallback purple and rendered identically in the pie.
export const LEAVE_TYPE_CHART_COLORS = {
  Vacation: '#3B82F6',
  Sick: '#EF4444',
  Emergency: '#F59E0B',
  Special: '#F43F5E',
  Funeral: '#6366F1',
  Unpaid: '#14B8A6',
};

// A type the map does not know about still has to get its own slice, never a repeat of another
// type's color, so an unmapped value lands on a neutral slate.
export const leaveTypeChartColor = (type) => LEAVE_TYPE_CHART_COLORS[type] ?? '#94A3B8';

// The dark-theme twin of the map above: same hues, saturation and brightness pulled back so a
// pie or donut belongs to a black screen instead of glowing on top of it. The pairs are chosen
// to stay as far apart as the light ones do, so two neighbouring slices remain tellable apart.
const LEAVE_TYPE_CHART_COLORS_DARK = {
  Vacation: '#5B8FD6',
  Sick: '#D9646B',
  Emergency: '#C99A3F',
  Special: '#D4738A',
  Funeral: '#6E7BD6',
  Unpaid: '#3FA0A8',
};

export const leaveTypeChartColorFor = (isDark) => (isDark ? LEAVE_TYPE_CHART_COLORS_DARK : LEAVE_TYPE_CHART_COLORS);

export const leaveTypeChartColorIn = (type, isDark) => leaveTypeChartColorFor(isDark)[type] ?? (isDark ? '#7d7d88' : '#94A3B8');

// The analytics API returns the leave types as lowercase keys ("vacation"), so that page needs the
// same palette re-keyed rather than a second hand-written copy of it.
export const lowercaseLeaveTypeColors = (isDark = false) =>
  Object.fromEntries(Object.entries(leaveTypeChartColorFor(isDark)).map(([type, color]) => [type.toLowerCase(), color]));

export const lowercaseLeaveTypeLabels = () =>
  Object.fromEntries(Object.keys(LEAVE_TYPE_CHART_COLORS).map((type) => [type.toLowerCase(), type]));
