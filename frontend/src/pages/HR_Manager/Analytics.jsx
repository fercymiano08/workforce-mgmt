import { useState } from 'react';
import {
  BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area
} from 'recharts';
import {
  Clock, PhilippinePeso, Download, Award, Percent
} from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription } from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { SkeletonCard, SkeletonTable } from '../../components/ui/LoadingSkeleton';
import { analyticsService } from '../../services/api';
import { formatCurrency } from '../../utils/helpers';
import { downloadCSV } from '../../utils/export';
import useApiData from '../../hooks/useApiData';
import { useToast } from '../../context/ToastContext';

const kpiColors = {
  blue: 'bg-blue-50 text-blue-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  amber: 'bg-amber-50 text-amber-600',
  purple: 'bg-purple-50 text-purple-600',
  red: 'bg-red-50 text-red-600',
};
const kpiBar = { blue: 'bg-blue-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', purple: 'bg-purple-500', red: 'bg-red-500' };

export default function Analytics() {
  const { toast } = useToast();
  const [range, setRange] = useState('month');
  const { data: analyticsData, loading } = useApiData(
    () => analyticsService.getAll(),
    []
  );
  const rangeLimit = { month: 1, quarter: 3, year: 12 }[range];
  const attendanceTrend = (analyticsData?.attendanceTrend ?? []).slice(-rangeLimit);
  const departmentProductivity = analyticsData?.departmentProductivity ?? [];
  const leaveTrend = (analyticsData?.leaveTrend ?? []).slice(-rangeLimit);
  const overtimeSummary = analyticsData?.overtimeSummary ?? [];
  const payrollDiscrepancy = analyticsData?.payrollDiscrepancy ?? [];

  const totalDiscrepancies = payrollDiscrepancy.filter(d => d.status !== 'Correct').length;
  const totalOverpaid = payrollDiscrepancy.filter(d => d.status === 'Overpaid').reduce((s, d) => s + d.difference, 0);
  const totalUnderpaid = payrollDiscrepancy.filter(d => d.status === 'Underpaid').reduce((s, d) => s + Math.abs(d.difference), 0);

  const lastRate = attendanceTrend.length > 0 ? attendanceTrend[attendanceTrend.length - 1].rate ?? 0 : 0;
  const overtimeHours = overtimeSummary.reduce((s, d) => s + (d.avgOvertime ?? 0), 0);

  const kpis = [
    { label: 'Overall Attendance Rate', value: `${lastRate.toFixed(1)}%`, icon: Percent, color: 'blue' },
    { label: 'Total Overtime Hours', value: `${overtimeHours.toFixed(0)}h`, icon: Clock, color: 'amber' },
    { label: 'Discrepancy Records', value: String(totalDiscrepancies), icon: Award, color: 'purple' },
    { label: 'Payroll Discrepancy', value: formatCurrency(totalOverpaid + totalUnderpaid), sub: `${totalDiscrepancies} discrepancies`, icon: PhilippinePeso, color: 'red' },
  ];

  const payrollRows = payrollDiscrepancy.map(d => ({
    Employee: d.employeeName,
    Department: d.department,
    'Expected Pay': d.expectedPay,
    'Actual Pay': d.actualPay,
    Difference: d.difference,
    Status: d.status,
  }));

  const handleExport = () => {
    const rows = kpis.map(k => ({ Metric: k.label, Value: k.value, ...(k.sub ? { Note: k.sub } : {}) }));
    downloadCSV('workforce-analytics.csv', rows);
    toast.success('Export Complete', 'Analytics summary exported to CSV.');
  };

  const handlePayrollExport = () => {
    downloadCSV('payroll-discrepancies.csv', payrollRows);
    toast.success('Export Complete', `Exported ${payrollRows.length} discrepancy records to CSV.`);
  };

  if (loading) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
          <SkeletonCard lines={1} />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <SkeletonCard lines={4} />
          <SkeletonCard lines={4} />
        </div>
        <SkeletonTable rows={5} cols={4} />
      </div>
    );
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
          <Button variant="outline" icon={Download} onClick={handleExport}>Export</Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map(k => (
          <Card key={k.label} className="overflow-hidden" hover>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-500">{k.label}</p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{k.value}</p>
                {k.sub && <p className="text-xs text-gray-400 mt-0.5">{k.sub}</p>}
              </div>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${kpiColors[k.color]}`}>
                <k.icon className="w-6 h-6" />
              </div>
            </div>
            <div className={`h-1 rounded-full mt-4 ${kpiBar[k.color]}`} />
          </Card>
        ))}
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Attendance Trend</CardTitle>
            <CardDescription>Monthly attendance rate over the year</CardDescription>
          </CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={attendanceTrend}>
                <defs>
                  <linearGradient id="attGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" domain={[80, 100]} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' }} />
                <Area type="monotone" dataKey="rate" stroke="#3B82F6" strokeWidth={2.5} fill="url(#attGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Department Productivity</CardTitle>
            <CardDescription>Productivity scores by department</CardDescription>
          </CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={departmentProductivity} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 12 }} stroke="#94a3b8" domain={[0, 100]} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 12 }} stroke="#94a3b8" width={90} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                <Bar dataKey="productivity" radius={[0, 6, 6, 0]} barSize={20}>
                  {departmentProductivity.map((entry, i) => (
                    <Cell key={i} fill={entry.productivity >= 85 ? '#10B981' : entry.productivity >= 70 ? '#F59E0B' : '#EF4444'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Leave Trends</CardTitle>
            <CardDescription>Leave usage over the past 6 months</CardDescription>
          </CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={leaveTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                <Legend />
                <Area type="monotone" dataKey="vacation" stackId="1" stroke="#3B82F6" fill="#3B82F6" fillOpacity={0.6} />
                <Area type="monotone" dataKey="sick" stackId="1" stroke="#EF4444" fill="#EF4444" fillOpacity={0.6} />
                <Area type="monotone" dataKey="emergency" stackId="1" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Overtime by Department</CardTitle>
            <CardDescription>Average overtime hours per department</CardDescription>
          </CardHeader>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={overtimeSummary}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="department" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                <YAxis tick={{ fontSize: 12 }} stroke="#94a3b8" />
                <Tooltip contentStyle={{ borderRadius: '12px', border: '1px solid #e2e8f0' }} />
                <Bar dataKey="avgOvertime" name="Avg Overtime" fill="#F59E0B" radius={[6, 6, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Payroll Discrepancy - ONLY in Analytics */}
      <Card>
        <CardHeader action={
          <div className="flex items-center gap-4">
            <Badge variant="danger" size="sm">{totalDiscrepancies} Discrepancies</Badge>
            <Button variant="outline" size="sm" icon={Download} onClick={handlePayrollExport}>Export</Button>
          </div>
        }>
          <CardTitle className="flex items-center gap-2">
            <PhilippinePeso className="w-5 h-5 text-red-500" />
            Payroll Discrepancy Report
          </CardTitle>
          <CardDescription>Detected payroll discrepancies for the current period</CardDescription>
        </CardHeader>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <div className="bg-red-50 rounded-xl p-4">
            <p className="text-sm text-red-600 font-medium">Total Overpaid</p>
            <p className="text-xl font-bold text-red-700 mt-1">{formatCurrency(totalOverpaid)}</p>
          </div>
          <div className="bg-amber-50 rounded-xl p-4">
            <p className="text-sm text-amber-600 font-medium">Total Underpaid</p>
            <p className="text-xl font-bold text-amber-700 mt-1">{formatCurrency(totalUnderpaid)}</p>
          </div>
          <div className="bg-gray-50 rounded-xl p-4">
            <p className="text-sm text-gray-600 font-medium">Records Checked</p>
            <p className="text-xl font-bold text-gray-700 mt-1">{payrollDiscrepancy.length}</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                {['Employee', 'Department', 'Expected Pay', 'Actual Pay', 'Difference', 'Status'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {payrollDiscrepancy.map((row, i) => (
                <tr key={i} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-4 py-3.5 text-sm font-medium text-gray-900">{row.employeeName}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-600">{row.department}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-700">{formatCurrency(row.expectedPay)}</td>
                  <td className="px-4 py-3.5 text-sm text-gray-700">{formatCurrency(row.actualPay)}</td>
                  <td className={`px-4 py-3.5 text-sm font-medium ${row.difference > 0 ? 'text-red-600' : row.difference < 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                    {row.difference > 0 ? '+' : ''}{formatCurrency(row.difference)}
                  </td>
                  <td className="px-4 py-3.5">
                    <Badge variant={row.status === 'Overpaid' ? 'danger' : row.status === 'Underpaid' ? 'warning' : 'success'} dot size="sm">
                      {row.status}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
