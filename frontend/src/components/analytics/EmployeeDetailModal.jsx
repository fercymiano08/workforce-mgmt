import { useMemo } from 'react';
import { LineChart, Line, Tooltip, ResponsiveContainer } from 'recharts';
import { Percent, Clock3, CalendarDays, Info, AlertTriangle } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../ui/Card';
import Badge from '../ui/Badge';
import Avatar from '../ui/Avatar';
import Modal from '../ui/Modal';
import useApiData from '../../hooks/useApiData';
import { analyticsService } from '../../services/api';
import { useTheme } from '../../context/ThemeContext';
import { chartTheme } from '../../constants/chartTheme';

const LEAVE_TYPE_SHORT = {
  Vacation: 'Vacation', Sick: 'Sick', Special: 'Special', Bereavement: 'Bereavement',
  Maternity: 'Maternity', Paternity: 'Paternity', Unpaid: 'Unpaid',
};

function ScoreRing({ score, size = 110, stroke = 10, color = '#3B82F6', track = '#F1F5F9' }) {
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
        <span className="text-xl font-bold text-gray-900 tabular-nums">{pct}%</span>
      </div>
    </div>
  );
}

/**
 * One employee's own cards (attendance, punctuality, leave, overtime), as a popup rather than a
 * separate "By Employee" tab - opened from a click in the Top Performer list (or the "Look up an
 * employee" search), so moving between people never means leaving the Overview page.
 */
export default function EmployeeDetailModal({ employeeId, period, isOpen, onClose }) {
  const { isDark } = useTheme();
  const chart = chartTheme(isDark);

  const { data, loading } = useApiData(
    () => (employeeId ? analyticsService.getEmployeeCard(employeeId, period) : Promise.resolve(null)),
    [employeeId, period]
  );

  const leaveRows = useMemo(() => {
    const balances = data?.leave?.balances || [];
    const used = data?.leave?.byType || {};
    return balances.map((b) => ({ ...b, usedThisPeriod: used[b.type] || 0 }));
  }, [data]);

  const emp = data?.employee;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={emp?.name || 'Employee'} size="wide">
      {!employeeId ? null : loading || !data ? (
        <div className="h-72 flex items-center justify-center text-sm text-gray-400">Loading...</div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3 min-w-0">
            <Avatar firstName={emp?.name?.split(' ')[0]} lastName={emp?.name?.split(' ')[1]} src={emp?.avatar} size="lg" />
            <div className="min-w-0">
              <p className="text-base font-bold text-gray-900 truncate flex items-center gap-2">
                {emp?.name || employeeId}
                {emp?.probationary && <Badge variant="warning" size="xs">Probationary</Badge>}
              </p>
              <p className="text-xs text-gray-500 truncate">{[emp?.position, emp?.department].filter(Boolean).join(' · ') || employeeId} · {data.period.label}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardHeader><CardTitle>Attendance Rate</CardTitle><CardDescription>Present vs. scheduled</CardDescription></CardHeader>
              <div className="flex flex-col items-center gap-2 py-2">
                <ScoreRing score={data.attendance.rate} color={chart.colors.blue} track={chart.grid} />
                <p className="text-xs text-gray-500 text-center">{data.attendance.presentDays} present of {data.attendance.scheduledDays} scheduled days</p>
              </div>
            </Card>

            <Card>
              <CardHeader><CardTitle>Punctuality</CardTitle><CardDescription>On-time share of days present</CardDescription></CardHeader>
              <div className="flex flex-col items-center gap-2 py-2">
                <ScoreRing score={data.punctuality.rate} color={chart.colors.emerald} track={chart.grid} />
                <div className="w-full h-12 px-2">
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
              <div className="space-y-2.5 py-1">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center shrink-0"><AlertTriangle className="w-3.5 h-3.5 text-amber-500" /></div>
                  <div><p className="text-sm font-semibold text-gray-900">{data.attendance.late}</p><p className="text-[11px] text-gray-500">Late</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center shrink-0"><Percent className="w-3.5 h-3.5 text-red-500" /></div>
                  <div><p className="text-sm font-semibold text-gray-900">{data.attendance.absent}</p><p className="text-[11px] text-gray-500">Absent</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 flex items-center justify-center shrink-0"><Clock3 className="w-3.5 h-3.5 text-purple-500" /></div>
                  <div><p className="text-sm font-semibold text-gray-900">{data.overtime.hours}h</p><p className="text-[11px] text-gray-500">Overtime</p></div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center shrink-0"><CalendarDays className="w-3.5 h-3.5 text-blue-500" /></div>
                  <div><p className="text-sm font-semibold text-gray-900">{data.leave.daysUsed}d</p><p className="text-[11px] text-gray-500">Leave taken</p></div>
                </div>
              </div>
            </Card>
          </div>

          {/* Deliberately not called "performance evaluation": one signal (attendance + punctuality),
              and the note says so plainly. */}
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
            <CardHeader><CardTitle>Leave Balances & Usage</CardTitle></CardHeader>
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
        </div>
      )}
    </Modal>
  );
}
