import { useMemo, useState } from 'react';
import {
  BarChart, Bar, Cell, PieChart, Pie, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { Printer, TrendingUp, Percent, Clock, Trophy, CalendarDays } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import FormulaInfo from '../../components/analytics/FormulaInfo';
import {
  lowercaseLeaveTypeColors, lowercaseLeaveTypeLabels,
} from '../../constants/leaveTypes';
import { analyticsService } from '../../services/api';
import useApiData from '../../hooks/useApiData';
import { SkeletonPage } from '../../components/ui/LoadingSkeleton';
import { useTheme } from '../../context/ThemeContext';
import { chartTheme } from '../../constants/chartTheme';

// Re-keyed from the shared palette rather than hand-written here, so this page, the dashboard
// pie and the leave badges cannot drift apart. The API returns these types as lowercase keys.
const LEAVE_TYPE_LABELS = lowercaseLeaveTypeLabels();

const PERIODS = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
];

// A ranked bar is read green/amber/red the same way everywhere this app ranks a percentage -
// 90+ is strong, 75+ is fine, below that needs a look.
const scoreColor = (value, colors) => (value >= 90 ? colors.emerald : value >= 75 ? colors.amber : colors.red);

// Charts only ever show real recorded activity. Until employees start clocking
// in, filing leave, etc., each chart shows this honest placeholder instead of
// an empty axis frame.
function ChartEmpty({ message }) {
  return (
    <div className="h-72 flex flex-col items-center justify-center text-center px-4">
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
        <TrendingUp className="w-7 h-7 text-gray-300" />
      </div>
      <p className="text-sm font-semibold text-gray-900">No data yet</p>
      <p className="text-xs text-gray-500 mt-1 max-w-xs leading-relaxed">
        {message || 'This chart fills in automatically as attendance and leave activity are recorded in the system.'}
      </p>
    </div>
  );
}

// A single value as a ring, not a bar: the number in the middle IS the point. A plain SVG circle
// rather than a Recharts radial bar, measured against a fixed circumference so the stroke never
// scales with the text.
function ScoreRing({ score, size = 140, stroke = 12, color = '#3B82F6', track = '#F1F5F9', suffix = '%' }) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(100, Number(score) || 0));

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circumference}
          strokeDashoffset={circumference - (pct / 100) * circumference}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-gray-900 tabular-nums">{pct}{suffix}</span>
      </div>
    </div>
  );
}

const kpiTone = {
  blue: 'bg-blue-50 text-blue-600',
  purple: 'bg-purple-50 text-purple-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
};

// The at-a-glance strip: four numbers pulled from the very cards below, not a second calculation -
// so there is never a question this page answers two different ways. Each one names which card
// to point at for "where did that come from?".
function KpiTile({ label, value, icon: Icon, tone, hint }) {
  return (
    <Card className="!p-4 overflow-hidden" hover>
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${kpiTone[tone]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold text-gray-900 tabular-nums truncate">{value}</p>
          <p className="text-xs text-gray-500 truncate">{label}</p>
        </div>
      </div>
      {hint && <p className="text-[11px] text-gray-400 mt-2 truncate">{hint}</p>}
    </Card>
  );
}

/**
 * Time & Attendance's "explain yourself" page: every card carries its own data source and
 * formula (the ⓘ, top right of each card - see FormulaInfo), so nobody showing this page has to
 * remember a rule the code already states. One filter - This Week / This Month / This Year -
 * drives all 6 cards together, and the printer button turns this same page into a self-contained
 * handout (every formula prints inline, see MainLayout's print:hidden chrome).
 */
export default function Analytics() {
  const { isDark } = useTheme();
  const chart = chartTheme(isDark);
  const LEAVE_TYPE_COLORS = lowercaseLeaveTypeColors(isDark);
  const [period, setPeriod] = useState('month');

  const { data, loading } = useApiData(() => analyticsService.getWorkforce(period), [period]);

  const periodMeta = data?.period ?? null;
  const summary = data?.attendanceSummary ?? null;
  const rate = data?.attendanceRate ?? null;
  const leaveTrend = data?.leaveTrend ?? null;
  const overtime = data?.overtimeHours ?? null;
  const punctuality = data?.departmentPunctuality ?? null;
  const composition = data?.leaveComposition ?? null;

  const summarySlices = useMemo(
    () => (summary?.slices ?? []).map((s) => ({ ...s, fill: chart.colors[s.color] || chart.colors.blue })),
    [summary, chart]
  );

  const compositionSlices = useMemo(
    () => (composition?.slices ?? []).map((s) => ({
      ...s,
      name: LEAVE_TYPE_LABELS[s.type] || s.type,
      color: LEAVE_TYPE_COLORS[s.type] || '#94A3B8',
    })),
    [composition, LEAVE_TYPE_COLORS]
  );

  const leaveTypeKeys = useMemo(() => [...(leaveTrend?.types ?? []), 'other'], [leaveTrend]);

  // Every value here is read straight off a card below, never recomputed - this row is a faster
  // way to see them, not a second source that could ever disagree with the card it summarises.
  const topDept = punctuality?.departments?.[0] ?? null;
  const leaveDaysTotal = useMemo(
    () => (leaveTrend?.buckets ?? []).reduce((sum, b) => sum + (b.total || 0), 0),
    [leaveTrend]
  );

  if (loading) {
    return <SkeletonPage kpiCount={3} />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workforce Analytics</h1>
          <p className="text-[14px] text-gray-500 mt-1">
            {periodMeta ? periodMeta.label : 'Comprehensive insights into your workforce performance'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-gray-100 rounded-xl p-1">
            {PERIODS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setPeriod(key)}
                className={`px-3 sm:px-4 py-1.5 pointer-coarse:py-2.5 text-sm font-medium rounded-lg transition-all ${period === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <Button variant="outline" icon={Printer} onClick={() => window.print()}>
            Export / Print
          </Button>
        </div>
      </div>

      {/* The screen header above is print:hidden (it holds buttons) - print gets its own plain line. */}
      <div className="hidden print:block">
        <h1 className="text-xl font-bold text-gray-900">Workforce Analytics</h1>
        <p className="text-sm text-gray-600">{periodMeta?.label} &middot; Printed {new Date().toLocaleString()}</p>
      </div>

      {/* At-a-glance strip - the same four numbers the cards below already explain, just faster to read. */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 print:hidden">
        <KpiTile
          label="Attendance Rate"
          value={rate ? `${rate.rate}%` : '—'}
          icon={Percent}
          tone="blue"
          hint="See Attendance Rate below"
        />
        <KpiTile
          label="Overtime Logged"
          value={overtime ? `${overtime.totalHours}h` : '—'}
          icon={Clock}
          tone="purple"
          hint="See Overtime Hours below"
        />
        <KpiTile
          label="Best On-Time Dept."
          value={topDept ? `${topDept.rate}%` : '—'}
          icon={Trophy}
          tone="emerald"
          hint={topDept ? topDept.department : 'See Department Punctuality below'}
        />
        <KpiTile
          label="Approved Leave Days"
          value={leaveTrend ? leaveDaysTotal : '—'}
          icon={CalendarDays}
          tone="amber"
          hint="See Leave Trends below"
        />
      </div>

      {/* Row 1: Attendance Summary + Attendance Rate */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-1">
        <Card>
          <CardHeader action={<FormulaInfo dataSource={summary?.meta?.dataSource} formula={summary?.meta?.formula} />}>
            <CardTitle>Attendance Summary</CardTitle>
            <CardDescription>Present, late, early leave and absent &middot; {periodMeta?.label}</CardDescription>
          </CardHeader>
          {!summary || summary.total === 0 ? (
            <ChartEmpty />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={summarySlices} cx="50%" cy="45%" outerRadius={95} paddingAngle={3} dataKey="value" nameKey="label">
                    {summarySlices.map((s) => (
                      <Cell key={s.key} fill={s.fill} stroke={chart.sliceBorder} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => (active && payload?.length ? (
                      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3">
                        <p className="text-sm font-semibold text-gray-900">{payload[0].payload.label}</p>
                        <p className="text-xs text-gray-600">
                          {payload[0].value} record{payload[0].value === 1 ? '' : 's'} ({payload[0].payload.pct}%)
                        </p>
                      </div>
                    ) : null)}
                  />
                  <Legend
                    iconType="square"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                    formatter={(_, entry) => <span className="text-gray-600">{entry?.payload?.label}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader action={<FormulaInfo dataSource={rate?.meta?.dataSource} formula={rate?.meta?.formula} />}>
            <CardTitle>Attendance Rate</CardTitle>
            <CardDescription>Out of all scheduled workdays, what % did employees show up for? &middot; {periodMeta?.label}</CardDescription>
          </CardHeader>
          {!rate || rate.scheduledDays === 0 ? (
            <ChartEmpty message="Fills in once shifts are scheduled and attendance is recorded." />
          ) : (
            <div className="h-72 flex flex-col items-center justify-center gap-2">
              <ScoreRing score={rate.rate} color={chart.colors.blue} track={chart.grid} />
              <p className="text-xs text-gray-500">{rate.presentDays} present of {rate.scheduledDays} scheduled days</p>
              <div className="w-full h-16 px-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rate.trend} margin={{ top: 4, left: 0, right: 0, bottom: 0 }}>
                    <Tooltip
                      cursor={{ stroke: chart.grid }}
                      contentStyle={chart.tooltipStyle}
                      formatter={(v) => [`${v}%`, 'Rate']}
                    />
                    <Line type="monotone" dataKey="rate" stroke={chart.colors.blue} strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Row 2: Leave Trends + Overtime Hours */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-1">
        <Card>
          <CardHeader action={<FormulaInfo dataSource={leaveTrend?.meta?.dataSource} formula={leaveTrend?.meta?.formula} />}>
            <CardTitle>Leave Trends</CardTitle>
            <CardDescription>Approved leave days by type &middot; {periodMeta?.label}</CardDescription>
          </CardHeader>
          {!leaveTrend || leaveTrend.buckets.every((b) => b.total === 0) ? (
            <ChartEmpty />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={leaveTrend.buckets}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke={chart.axisStrong} />
                  <YAxis tick={{ fontSize: 12 }} stroke={chart.axisStrong} allowDecimals={false} />
                  <Tooltip cursor={{ fill: chart.cursor }} contentStyle={chart.tooltipStyle} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  {leaveTypeKeys.map((type, i, arr) => (
                    <Bar
                      key={type}
                      dataKey={type}
                      name={LEAVE_TYPE_LABELS[type] || type}
                      stackId="leave"
                      fill={LEAVE_TYPE_COLORS[type]}
                      radius={i === arr.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                      barSize={28}
                    />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader action={<FormulaInfo dataSource={overtime?.meta?.dataSource} formula={overtime?.meta?.formula} />}>
            <CardTitle>Overtime Hours</CardTitle>
            <CardDescription>Total overtime logged &middot; {periodMeta?.label}</CardDescription>
          </CardHeader>
          {!overtime || overtime.totalHours === 0 ? (
            <ChartEmpty />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overtime.buckets} margin={{ top: 16, left: 4, right: 16, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke={chart.axisStrong} />
                  <YAxis tick={{ fontSize: 12 }} stroke={chart.axisStrong} />
                  <Tooltip
                    cursor={{ stroke: chart.grid }}
                    contentStyle={chart.tooltipStyle}
                    formatter={(value) => [`${value}h`, 'Overtime']}
                  />
                  <Line
                    type="linear"
                    dataKey="hours"
                    name="Overtime Hours"
                    stroke={chart.colors.purpleDark}
                    strokeWidth={2}
                    dot={{ r: 4, fill: chart.colors.purpleDark, strokeWidth: 2, stroke: chart.sliceBorder }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: chart.sliceBorder }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>

      {/* Row 3: Department Punctuality + Leave Type Composition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:grid-cols-1">
        <Card>
          <CardHeader action={<FormulaInfo dataSource={punctuality?.meta?.dataSource} formula={punctuality?.meta?.formula} />}>
            <CardTitle>Department Punctuality</CardTitle>
            <CardDescription>Which department clocks in on time the most? &middot; {periodMeta?.label}</CardDescription>
          </CardHeader>
          {!punctuality || punctuality.departments.length === 0 ? (
            <ChartEmpty message="Fills in once employees start clocking in." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={punctuality.departments} layout="vertical" margin={{ left: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chart.grid} horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 12 }} stroke={chart.axisStrong} />
                  <YAxis type="category" dataKey="department" tick={{ fontSize: 12 }} stroke={chart.axisStrong} width={110} />
                  <Tooltip
                    cursor={{ fill: chart.cursor }}
                    contentStyle={chart.tooltipStyle}
                    formatter={(value, _name, item) => [`${value}%`, `${item.payload.onTime}/${item.payload.totalClockIns} on time`]}
                  />
                  <Bar dataKey="rate" name="On-time rate" radius={[0, 4, 4, 0]} barSize={22}>
                    {punctuality.departments.map((d) => (
                      <Cell key={d.department} fill={scoreColor(d.rate, chart.colors)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader action={<FormulaInfo dataSource={composition?.meta?.dataSource} formula={composition?.meta?.formula} />}>
            <CardTitle>Leave Type Composition</CardTitle>
            <CardDescription>Share of approved leave by type &middot; {periodMeta?.label}</CardDescription>
          </CardHeader>
          {!composition || composition.total === 0 ? (
            <ChartEmpty message="Fills in once leave requests are approved." />
          ) : (
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={compositionSlices} cx="50%" cy="45%" innerRadius={68} outerRadius={100} paddingAngle={3} dataKey="count" nameKey="name">
                    {compositionSlices.map((s) => (
                      <Cell key={s.type} fill={s.color} stroke={chart.sliceBorder} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => (active && payload?.length ? (
                      <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3">
                        <p className="text-sm font-semibold text-gray-900">{payload[0].payload.name}</p>
                        <p className="text-xs text-gray-600">
                          {payload[0].value} request{payload[0].value === 1 ? '' : 's'} ({payload[0].payload.pct}%)
                        </p>
                      </div>
                    ) : null)}
                  />
                  <Legend
                    iconType="square"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                    formatter={(_, entry) => <span className="text-gray-600">{entry?.payload?.name}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
