import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { LineChart, Line, Tooltip, ResponsiveContainer } from 'recharts';
import { Search, UserRound, Percent, Clock3, CalendarDays, Info, X, AlertTriangle } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../ui/Card';
import Badge from '../ui/Badge';
import Avatar from '../ui/Avatar';
import EmployeePicker from '../scheduling/EmployeePicker';
import Modal from '../ui/Modal';
import useApiData from '../../hooks/useApiData';
import { employeeService, analyticsService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { chartTheme } from '../../constants/chartTheme';

const PERIODS = [
  { key: 'week', label: 'This Week' },
  { key: 'month', label: 'This Month' },
  { key: 'year', label: 'This Year' },
];

const LEAVE_TYPE_SHORT = {
  Vacation: 'Vacation', Sick: 'Sick', Special: 'Special', Bereavement: 'Bereavement',
  Maternity: 'Maternity', Paternity: 'Paternity', Unpaid: 'Unpaid',
};

function ScoreRing({ score, size = 120, stroke = 11, color = '#3B82F6', track = '#F1F5F9' }) {
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
        <span className="text-2xl font-bold text-gray-900 tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}

const EmptyPicker = ({ onPick }) => (
  <Card>
    <div className="py-14 flex flex-col items-center text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center">
        <UserRound className="w-7 h-7 text-blue-500" />
      </div>
      <div>
        <p className="text-sm font-semibold text-gray-900">Pick an employee to drill into</p>
        <p className="text-xs text-gray-500 mt-1 max-w-sm">
          Their own attendance, punctuality, leave usage and overtime for the period - the same
          cards as Overview, read for one person instead of the whole company.
        </p>
      </div>
      <button
        type="button"
        onClick={onPick}
        className="mt-1 inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-blue-600 bg-blue-50 rounded-xl hover:bg-blue-100 transition-colors"
      >
        <Search className="w-4 h-4" /> Choose Employee
      </button>
    </div>
  </Card>
);

/**
 * The "By Employee" tab: the Overview tab's own cards, read for one person. A panel review asked
 * Workforce Analytics for exactly this - "from a single employee to the entire system."
 */
export default function EmployeeAnalytics() {
  const { isDark } = useTheme();
  const chart = chartTheme(isDark);
  // Lets Employees' detail panel deep-link straight here ("View Analytics" on one person).
  const [searchParams] = useSearchParams();
  const [employeeId, setEmployeeId] = useState(() => searchParams.get('employeeId') || '');
  const [period, setPeriod] = useState('week');
  const [pickerOpen, setPickerOpen] = useState(false);

  const { data: employees } = useApiData(() => employeeService.getAll(), []);
  const { data, loading } = useApiData(
    () => (employeeId ? analyticsService.getEmployeeCard(employeeId, period) : Promise.resolve(null)),
    [employeeId, period]
  );

  const leaveRows = useMemo(() => {
    const balances = data?.leave?.balances || [];
    const used = data?.leave?.byType || {};
    return balances.map((b) => ({ ...b, usedThisPeriod: used[b.type] || 0 }));
  }, [data]);

  if (!employeeId) {
    return (
      <>
        <EmptyPicker onPick={() => setPickerOpen(true)} />
        <Modal isOpen={pickerOpen} onClose={() => setPickerOpen(false)} title="Choose an employee" size="lg">
          <EmployeePicker mode="single" employees={employees || []} value="" onChange={(id) => { setEmployeeId(id); setPickerOpen(false); }} />
        </Modal>
      </>
    );
  }

  const emp = data?.employee;

  return (
    <div className="space-y-6">
      {/* Who, and a way to switch - the period picker mirrors Overview's. */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Avatar firstName={emp?.name?.split(' ')[0]} lastName={emp?.name?.split(' ')[1]} src={emp?.avatar} size="lg" />
          <div className="min-w-0">
            <p className="text-base font-bold text-gray-900 truncate flex items-center gap-2">
              {emp?.name || employeeId}
              {emp?.probationary && <Badge variant="warning" size="xs">Probationary</Badge>}
            </p>
            <p className="text-xs text-gray-500 truncate">{[emp?.position, emp?.department].filter(Boolean).join(' · ') || employeeId}</p>
          </div>
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="ml-1 shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50"
            title="Choose a different employee"
          >
            <Search className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => setEmployeeId('')}
            className="shrink-0 p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50"
            title="Clear"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex bg-gray-100 rounded-xl p-1">
          {PERIODS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setPeriod(key)}
              className={`px-3 sm:px-4 py-1.5 text-sm font-medium rounded-lg transition-all ${period === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading || !data ? (
        <Card><div className="h-72 flex items-center justify-center text-sm text-gray-400">Loading...</div></Card>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card>
              <CardHeader><CardTitle>Attendance Rate</CardTitle><CardDescription>Present days vs. scheduled days · {data.period.label}</CardDescription></CardHeader>
              <div className="flex flex-col items-center gap-2 py-2">
                <ScoreRing score={data.attendance.rate} color={chart.colors.blue} track={chart.grid} />
                <p className="text-xs text-gray-500">{data.attendance.presentDays} present of {data.attendance.scheduledDays} scheduled days</p>
              </div>
            </Card>

            <Card>
              <CardHeader><CardTitle>Punctuality</CardTitle><CardDescription>On-time share of days present · {data.period.label}</CardDescription></CardHeader>
              <div className="flex flex-col items-center gap-2 py-2">
                <ScoreRing score={data.punctuality.rate} color={chart.colors.emerald} track={chart.grid} />
                <div className="w-full h-14 px-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={data.punctuality.trend} margin={{ top: 4, left: 0, right: 0, bottom: 0 }}>
                      <Tooltip cursor={{ stroke: chart.grid }} contentStyle={chart.tooltipStyle} formatter={(v) => [`${v}%`, 'On-time']} />
                      <Line type="monotone" dataKey="rate" stroke={chart.colors.blue} strokeWidth={2} dot={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader><CardTitle>This Period</CardTitle><CardDescription>At a glance</CardDescription></CardHeader>
              <div className="space-y-3 py-1">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-50 flex items-center justify-center shrink-0"><AlertTriangle className="w-4 h-4 text-amber-500" /></div>
                  <div><p className="text-sm font-semibold text-gray-900">{data.attendance.late}</p><p className="text-xs text-gray-500">Late</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center shrink-0"><Percent className="w-4 h-4 text-red-500" /></div>
                  <div><p className="text-sm font-semibold text-gray-900">{data.attendance.absent}</p><p className="text-xs text-gray-500">Absent</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-50 flex items-center justify-center shrink-0"><Clock3 className="w-4 h-4 text-purple-500" /></div>
                  <div><p className="text-sm font-semibold text-gray-900">{data.overtime.hours}h</p><p className="text-xs text-gray-500">Overtime</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center shrink-0"><CalendarDays className="w-4 h-4 text-blue-500" /></div>
                  <div><p className="text-sm font-semibold text-gray-900">{data.leave.daysUsed}d</p><p className="text-xs text-gray-500">Leave taken</p></div>
                </div>
              </div>
            </Card>
          </div>

          {/* The punctuality-based read - deliberately not called "performance evaluation": it is
              one signal (attendance + punctuality), and the note says so plainly. */}
          <Card>
            <CardHeader><CardTitle>Punctuality-Based Read</CardTitle></CardHeader>
            <div className="flex items-start gap-3">
              <Badge variant={data.performance.tone} size="md">{data.performance.label}</Badge>
              {data.performance.score != null && <span className="text-xs text-gray-400">score {data.performance.score}</span>}
            </div>
            <p className="text-xs text-gray-400 mt-2 flex items-start gap-1.5">
              <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" /> {data.performance.note}
            </p>
          </Card>

          <Card>
            <CardHeader><CardTitle>Leave Balances & Usage</CardTitle><CardDescription>{data.period.label}</CardDescription></CardHeader>
            {leaveRows.length === 0 ? (
              <p className="text-sm text-gray-400 py-6 text-center">No leave balance is set up for this employee.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-b border-gray-100">
                      <th className="py-2 pr-4">Type</th>
                      <th className="py-2 pr-4">Used this period</th>
                      <th className="py-2 pr-4">Remaining / Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {leaveRows.map((r) => (
                      <tr key={r.type}>
                        <td className="py-2.5 pr-4 font-medium text-gray-800">{LEAVE_TYPE_SHORT[r.type] || r.type}</td>
                        <td className="py-2.5 pr-4 text-gray-600">{r.usedThisPeriod}d</td>
                        <td className="py-2.5 pr-4 text-gray-600">{r.remaining} / {r.total}d</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Modal isOpen={pickerOpen} onClose={() => setPickerOpen(false)} title="Choose an employee" size="lg">
        <EmployeePicker mode="single" employees={employees || []} value={employeeId} onChange={(id) => { setEmployeeId(id); setPickerOpen(false); }} />
      </Modal>
    </div>
  );
}
