import { useState, useMemo } from 'react';
import {
  BarChart, Bar, Cell, PieChart, Pie, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import {
  Clock, Percent, TrendingUp, Trophy, AlertTriangle, Gauge
} from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import { analyticsService } from '../../services/api';
import useApiData from '../../hooks/useApiData';
import { SkeletonPage } from '../../components/ui/LoadingSkeleton';

// One fixed color per entity, reused everywhere that entity appears (leave types
// already carry these exact colors on the Leave and Leave Management pages) -
// except 'special', bumped from purple to rose: purple sits too close to
// funeral's indigo once they're adjacent chart segments (validated: ΔE 6.3,
// below the legibility floor of 15), which never happens on the badge-only pages.
const LEAVE_TYPE_COLORS = {
  vacation: '#3B82F6', sick: '#EF4444', emergency: '#F59E0B',
  special: '#F43F5E', funeral: '#6366F1', unpaid: '#14B8A6',
};
const LEAVE_TYPE_LABELS = {
  vacation: 'Vacation', sick: 'Sick', emergency: 'Emergency',
  special: 'Special', funeral: 'Funeral', unpaid: 'Unpaid',
};

const kpiColors = {
  blue: { icon: 'bg-blue-50 text-blue-600', fill: 'bg-blue-500', track: 'bg-blue-100' },
  amber: { icon: 'bg-amber-50 text-amber-600', fill: 'bg-amber-500', track: 'bg-amber-100' },
  emerald: { icon: 'bg-emerald-50 text-emerald-600', fill: 'bg-emerald-500', track: 'bg-emerald-100' },
};

const scoreColor = (value) => (value >= 90 ? '#10B981' : value >= 75 ? '#F59E0B' : '#EF4444');

// One fixed color per department, assigned by alphabetical name order so it never
// shifts with API response order or a re-fetch (identity, not magnitude - the pie's
// job is "which department", so color follows the department, not the score).
const DEPARTMENT_COLOR_ORDER = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#0EA5E9', '#6366F1', '#14B8A6'];
function departmentColorMap(names) {
  const sorted = [...new Set(names)].sort();
  return Object.fromEntries(sorted.map((name, i) => [name, DEPARTMENT_COLOR_ORDER[i % DEPARTMENT_COLOR_ORDER.length]]));
}

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

// A ratio against a limit (e.g. 98.7% attendance) reads as a filled track against
// its own lighter shade, not a flat number - the fill width IS the value.
function MeterTile({ label, value, displayValue, icon: Icon, color }) {
  const c = kpiColors[color];
  const pct = Math.max(0, Math.min(100, value));
  return (
    <Card className="overflow-hidden" hover>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{displayValue}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${c.icon}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <div className={`h-1.5 rounded-full mt-4 ${c.track}`}>
        <div className={`h-1.5 rounded-full ${c.fill} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
    </Card>
  );
}

function StatTile({ label, value, icon: Icon, color }) {
  const c = kpiColors[color];
  return (
    <Card className="overflow-hidden" hover>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
        </div>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${c.icon}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
      <div className={`h-1.5 rounded-full mt-4 ${c.track}`}>
        <div className={`h-1.5 rounded-full ${c.fill}`} style={{ width: '100%' }} />
      </div>
    </Card>
  );
}

// A ranking is read top-to-bottom, not off an axis: name, a value-proportional
// bar, and the score - a leaderboard, not another generic bar chart.
function RankRow({ rank, name, department, score, tone }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-[11px] font-bold ${tone === 'top' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
          <p className="text-sm font-semibold text-gray-900 tabular-nums shrink-0">{score.toFixed(1)}%</p>
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div className="h-1.5 flex-1 rounded-full bg-gray-100">
            <div className="h-1.5 rounded-full" style={{ width: `${score}%`, backgroundColor: scoreColor(score) }} />
          </div>
          {department && <span className="text-[11px] text-gray-400 shrink-0 max-w-[80px] truncate">{department}</span>}
        </div>
      </div>
    </div>
  );
}

export default function Analytics() {
  const [range, setRange] = useState('month');
  const { data: analyticsData, loading } = useApiData(
    () => analyticsService.getAll(),
    []
  );
  const rangeLimit = { month: 1, quarter: 3, year: 12 }[range];
  const attendanceTrend = (analyticsData?.attendanceTrend ?? []).slice(-rangeLimit);
  const departmentProductivity = analyticsData?.departmentProductivity ?? [];
  const leaveTrendFull = analyticsData?.leaveTrend ?? [];
  const leaveTrend = leaveTrendFull.slice(-rangeLimit);
  const overtimeSummary = analyticsData?.overtimeSummary ?? [];
  const punctualityScore = analyticsData?.punctualityScore ?? [];

  const lastRate = attendanceTrend.length > 0 ? attendanceTrend[attendanceTrend.length - 1].rate ?? 0 : 0;
  const overtimeHours = overtimeSummary.reduce((s, d) => s + (d.avgOvertime ?? 0), 0);
  const avgPunctuality = punctualityScore.length > 0
    ? punctualityScore.reduce((s, p) => s + p.score, 0) / punctualityScore.length
    : 0;

  const deptColors = useMemo(
    () => departmentColorMap((analyticsData?.departmentProductivity ?? []).map((d) => d.name)),
    [analyticsData]
  );

  const topPerformers = punctualityScore.slice(0, 5);
  const needsAttention = punctualityScore.slice(-5).reverse().filter((p) => !topPerformers.includes(p));

  // The 6-month trend already holds everything a "right now" composition needs -
  // sum the visible range per leave type instead of a second API call.
  const leaveComposition = useMemo(() => {
    const totals = {};
    for (const type of Object.keys(LEAVE_TYPE_COLORS)) {
      totals[type] = leaveTrend.reduce((s, m) => s + (m[type] ?? 0), 0);
    }
    return Object.entries(totals)
      .filter(([, count]) => count > 0)
      .map(([type, count]) => ({ type, name: LEAVE_TYPE_LABELS[type], value: count, color: LEAVE_TYPE_COLORS[type] }));
  }, [leaveTrend]);
  const leaveTotal = leaveComposition.reduce((s, d) => s + d.value, 0);

  if (loading) {
    return <SkeletonPage kpiCount={3} />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Workforce Analytics</h1>
          <p className="text-[14px] text-gray-500 mt-1">Comprehensive insights into your workforce performance</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex bg-gray-100 rounded-xl p-1">
            {['month', 'quarter', 'year'].map(r => (
              <button key={r} onClick={() => setRange(r)} className={`px-3 sm:px-4 py-1.5 pointer-coarse:py-2.5 text-sm font-medium rounded-lg transition-all ${range === r ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                {r === 'month' ? 'This Month' : r === 'quarter' ? 'This Quarter' : 'This Year'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* KPI Meters */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <MeterTile
          label="Overall Attendance Rate"
          value={lastRate}
          displayValue={attendanceTrend.length > 0 ? `${lastRate.toFixed(1)}%` : '—'}
          icon={Percent}
          color="blue"
        />
        <MeterTile
          label="Overall Punctuality"
          value={avgPunctuality}
          displayValue={punctualityScore.length > 0 ? `${avgPunctuality.toFixed(1)}%` : '—'}
          icon={Gauge}
          color="emerald"
        />
        <StatTile
          label="Total Overtime Hours"
          value={overtimeSummary.length > 0 ? `${overtimeHours.toFixed(0)}h` : '—'}
          icon={Clock}
          color="amber"
        />
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Attendance Trend</CardTitle>
            <CardDescription>Monthly attendance rate over the year</CardDescription>
          </CardHeader>
          {attendanceTrend.length === 0 ? (
            <ChartEmpty />
          ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attendanceTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" domain={[80, 100]} />
                <Tooltip
                  cursor={{ fill: '#f1f5f9' }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }}
                  formatter={(value) => [`${value}%`, 'Attendance Rate']}
                />
                <Bar dataKey="rate" name="Attendance Rate" fill="#3B82F6" radius={[4, 4, 0, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Department Productivity</CardTitle>
            <CardDescription>Productivity scores by department</CardDescription>
          </CardHeader>
          {departmentProductivity.length === 0 ? (
            <ChartEmpty />
          ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={departmentProductivity}
                  cx="50%"
                  cy="40%"
                  outerRadius={72}
                  paddingAngle={2}
                  dataKey="productivity"
                  nameKey="name"
                >
                  {departmentProductivity.map((entry) => (
                    <Cell key={entry.name} fill={deptColors[entry.name]} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      return (
                        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3">
                          <p className="text-sm font-semibold text-gray-900">{payload[0].name}</p>
                          <p className="text-xs text-gray-600">Productivity: {payload[0].value.toFixed(1)}%</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  iconType="square"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 11, paddingTop: 12 }}
                  formatter={(value, entry) => <span className="text-gray-600">{value} · {entry.payload.productivity.toFixed(0)}%</span>}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          )}
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Leave Trends</CardTitle>
            <CardDescription>Leave usage over the past 6 months</CardDescription>
          </CardHeader>
          {leaveTrend.length === 0 ? (
            <ChartEmpty />
          ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={leaveTrend} layout="vertical" margin={{ left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#94a3b8" allowDecimals={false} />
                <YAxis type="category" dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" width={64} />
                <Tooltip cursor={{ fill: '#f1f5f9' }} contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                <Legend />
                {Object.keys(LEAVE_TYPE_COLORS).map((type, i, arr) => (
                  <Bar
                    key={type}
                    dataKey={type}
                    name={LEAVE_TYPE_LABELS[type]}
                    stackId="leave"
                    fill={LEAVE_TYPE_COLORS[type]}
                    radius={i === arr.length - 1 ? [0, 4, 4, 0] : [0, 0, 0, 0]}
                    barSize={24}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overtime by Department</CardTitle>
            <CardDescription>Average overtime hours per department</CardDescription>
          </CardHeader>
          {overtimeSummary.length === 0 ? (
            <ChartEmpty />
          ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={overtimeSummary} margin={{ top: 16, left: 4, right: 16, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="department" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" domain={[0, (max) => Math.ceil(max * 1.4 * 10) / 10]} />
                <Tooltip
                  cursor={{ stroke: '#e2e8f0' }}
                  contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }}
                  formatter={(value) => [`${value}h`, 'Avg Overtime']}
                />
                <Line
                  type="linear"
                  dataKey="avgOvertime"
                  name="Avg Overtime"
                  stroke="#F59E0B"
                  strokeWidth={2}
                  dot={{ r: 4, fill: '#F59E0B', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, strokeWidth: 2, stroke: '#fff' }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          )}
        </Card>
      </div>

      {/* Charts Row 3 - Leaderboard + Composition */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Punctuality Leaderboard</CardTitle>
            <CardDescription>On-time percentage per employee, all-time</CardDescription>
          </CardHeader>
          {punctualityScore.length === 0 ? (
            <ChartEmpty message="Fills in once employees start clocking in." />
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6">
              <div>
                <div className="flex items-center gap-1.5 mb-1 text-emerald-700">
                  <Trophy className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide">Top Performers</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {topPerformers.map((p, i) => (
                    <RankRow key={p.name + i} rank={i + 1} name={p.name} department={p.department} score={p.score} tone="top" />
                  ))}
                </div>
              </div>
              <div className="mt-5 sm:mt-0">
                <div className="flex items-center gap-1.5 mb-1 text-red-700">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide">Needs Attention</span>
                </div>
                <div className="divide-y divide-gray-50">
                  {needsAttention.length === 0 ? (
                    <p className="text-sm text-gray-400 py-2">No one below the top performers yet.</p>
                  ) : needsAttention.map((p, i) => (
                    <RankRow key={p.name + i} rank={needsAttention.length - i} name={p.name} department={p.department} score={p.score} tone="bottom" />
                  ))}
                </div>
              </div>
            </div>
          )}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Leave Type Composition</CardTitle>
            <CardDescription>Share of approved leave by type, {range === 'month' ? 'this month' : range === 'quarter' ? 'this quarter' : 'this year'}</CardDescription>
          </CardHeader>
          {leaveComposition.length === 0 ? (
            <ChartEmpty message="Fills in once leave requests are approved." />
          ) : (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={leaveComposition}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={95}
                  paddingAngle={3}
                  dataKey="value"
                  nameKey="name"
                >
                  {leaveComposition.map((entry) => (
                    <Cell key={entry.type} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  content={({ active, payload }) => {
                    if (active && payload && payload.length) {
                      const pct = leaveTotal > 0 ? ((payload[0].value / leaveTotal) * 100).toFixed(1) : '0.0';
                      return (
                        <div className="bg-white rounded-xl shadow-lg border border-gray-100 p-3">
                          <p className="text-sm font-semibold text-gray-900">{payload[0].name}</p>
                          <p className="text-xs text-gray-600">{payload[0].value} request{payload[0].value === 1 ? '' : 's'} ({pct}%)</p>
                        </div>
                      );
                    }
                    return null;
                  }}
                />
                <Legend
                  iconType="square"
                  iconSize={8}
                  wrapperStyle={{ fontSize: 12, paddingTop: 12 }}
                  formatter={(value) => <span className="text-gray-600">{value}</span>}
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
