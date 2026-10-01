/**
 * Chart colours, per theme.
 *
 * The charts draw with Recharts, which takes literal colour values in JavaScript - it
 * cannot read a CSS class, so the utility classes that invert the rest of the app never
 * reach it. Without this, a dark screen keeps the light theme's fully saturated bars and
 * a near-black donut, which glares.
 *
 * The dark palette is the same hues with the saturation and brightness pulled back, so a
 * series is still recognisable (Present is still green, Absent still red) but reads as
 * part of a black-and-gray screen rather than glowing on top of it.
 */
const SERIES_LIGHT = {
  blue: '#3B82F6', emerald: '#10B981', amber: '#F59E0B', red: '#EF4444',
  purple: '#8B5CF6', sky: '#0EA5E9', indigo: '#6366F1', rose: '#F43F5E', teal: '#14B8A6',
  // A deliberately darker purple than 'purple' above - requested for the Overtime Hours chart,
  // which used to be amber ("yellow is ugly") and needed a shade saturated enough to read clearly
  // as its own dotted line rather than a lighter wash.
  purpleDark: '#6D28D9',
};

const SERIES_DARK = {
  blue: '#5B8FD6', emerald: '#3FA98A', amber: '#C99A3F', red: '#D9646B',
  purple: '#8B78D6', sky: '#4E9BC4', indigo: '#6E7BD6', rose: '#D4738A', teal: '#3FA0A8',
  purpleDark: '#9B6FE0',
};

export function chartTheme(isDark) {
  return {
    colors: isDark ? SERIES_DARK : SERIES_LIGHT,
    // Grid lines and axis labels sit on the card, not on the page.
    grid: isDark ? '#232329' : '#F1F5F9',
    axis: isDark ? '#8b8b96' : '#64748B',
    axisStrong: isDark ? '#a3a3ae' : '#94a3b8',
    cursor: isDark ? '#17171c' : '#F1F5F9',
    // The gap drawn between pie/donut segments: white on a white card, near-black here.
    sliceBorder: isDark ? '#101014' : '#FFFFFF',
    tooltipStyle: isDark
      ? {
          borderRadius: '12px',
          border: '1px solid #2e2e36',
          background: '#101014',
          color: '#ececf2',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.7)',
        }
      : {
          borderRadius: '12px',
          border: '1px solid #e2e8f0',
          background: '#ffffff',
          color: '#0f172a',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
        },
  };
}

export default chartTheme;
