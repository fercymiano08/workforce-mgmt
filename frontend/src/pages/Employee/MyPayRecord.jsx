import { useMemo, useRef } from 'react';
import {
  Wallet, Download, Printer, TrendingUp, TrendingDown, Banknote, Receipt,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import KpiCard from '../../components/dashboard/KpiCard';
import EmptyState from '../../components/ui/EmptyState';
import { SkeletonCard, SkeletonTable } from '../../components/ui/LoadingSkeleton';
import useApiData from '../../hooks/useApiData';
import { payRecordService } from '../../services/api';
import { downloadCsv, formatPhp, printElementAsPdf } from '../../utils/export';
import { formatDate } from '../../utils/helpers';

const STATUS_VARIANT = {
  Approved: 'success',
  Submitted: 'warning',
  Draft: 'default',
};

export default function MyPayRecord() {
  const { user } = useAuth();
  const { toast } = useToast();
  const employeeId = user?.id || 'EMP001';
  const printRef = useRef(null);

  const { data, loading } = useApiData(
    () => payRecordService.getByEmployeeId(employeeId),
    [employeeId]
  );

  const statements = useMemo(() => data?.statements || [], [data]);
  const totals = useMemo(
    () => data?.totals || { regularPay: 0, otPay: 0, gross: 0, deductions: 0, net: 0 },
    [data]
  );

  const handleExport = () => {
    if (!statements.length) {
      toast.error('Nothing to export', 'No pay statements available yet.');
      return;
    }
    const rows = statements.map((s) => ({
      'Week Start': s.weekStart,
      'Week End': s.weekEnd,
      'Regular Hours': s.regularHours,
      'OT Hours': s.otHours,
      'Regular Pay': formatPhp(s.regularPay),
      'OT Pay': formatPhp(s.otPay),
      Gross: formatPhp(s.gross),
      SSS: formatPhp(s.deductions?.sss ?? 0),
      PhilHealth: formatPhp(s.deductions?.philhealth ?? 0),
      PagIBIG: formatPhp(s.deductions?.pagibig ?? 0),
      Tax: formatPhp(s.deductions?.tax ?? 0),
      'Total Deductions': formatPhp(s.deductions?.total ?? 0),
      Net: formatPhp(s.net),
      Status: s.status,
    }));
    downloadCsv(`pay-record-${employeeId}.csv`, rows);
    toast.success('Export ready', 'Pay record exported as CSV.');
  };

  const handlePrint = () => {
    if (!printRef.current) {
      toast.error('Nothing to print', 'No pay statements available yet.');
      return;
    }
    printElementAsPdf(printRef.current, `Pay Record - ${data?.employee?.name || employeeId}`);
  };

  const kpis = data
    ? [
      { label: 'Hourly Rate', value: formatPhp(data.hourlyRate), icon: Banknote, accent: 'blue' },
      { label: 'Gross Pay', value: formatPhp(totals.gross), icon: TrendingUp, accent: 'emerald' },
      { label: 'Deductions', value: formatPhp(totals.deductions), icon: TrendingDown, accent: 'amber' },
      { label: 'Net Pay', value: formatPhp(totals.net), icon: Wallet, accent: 'purple' },
    ]
    : [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">My Pay Record</h1>
          <p className="text-[14px] text-gray-500 mt-1">Weekly pay breakdown computed from your approved timesheets</p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Button variant="outline" size="md" icon={Download} onClick={handleExport}>Export CSV</Button>
          <Button variant="outline" size="md" icon={Printer} onClick={handlePrint}>Print / PDF</Button>
        </div>
      </div>

      {loading && !data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <SkeletonCard lines={1} />
            <SkeletonCard lines={1} />
            <SkeletonCard lines={1} />
            <SkeletonCard lines={1} />
          </div>
          <SkeletonTable rows={5} cols={5} />
        </>
      ) : !data ? (
        <EmptyState
          icon={Receipt}
          title="No pay data yet"
          description="Your weekly pay statements will appear here once approved timesheets exist."
        />
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {kpis.map((kpi) => (
              <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} icon={kpi.icon} accent={kpi.accent} />
            ))}
          </div>

          {data.employee && (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-6 py-4 flex flex-wrap items-center gap-x-8 gap-y-2">
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Employee</p>
                <p className="text-sm font-semibold text-gray-900">{data.employee.name}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Department</p>
                <p className="text-sm text-gray-700">{data.employee.department || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Position</p>
                <p className="text-sm text-gray-700">{data.employee.position || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] text-gray-400 uppercase tracking-wide font-semibold">Monthly Salary</p>
                <p className="text-sm text-gray-700">{formatPhp(data.monthlySalary)}</p>
              </div>
            </div>
          )}

          <div ref={printRef}>
            {data.employee && <h1 style={{ display: 'none' }}>Pay Record - {data.employee.name}</h1>}
            <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-3 mt-6">Pay Statements by Week</h2>
            {statements.length ? (
              <div className="overflow-hidden rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                      <th className="py-2.5 px-4 font-semibold">Week</th>
                      <th className="py-2.5 px-2 font-semibold text-right">Reg Pay</th>
                      <th className="py-2.5 px-2 font-semibold text-right">OT Pay</th>
                      <th className="py-2.5 px-2 font-semibold text-right">Gross</th>
                      <th className="py-2.5 px-2 font-semibold text-right">Deductions</th>
                      <th className="py-2.5 px-2 font-semibold text-right">Net</th>
                      <th className="py-2.5 px-4 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statements.map((s) => (
                      <tr key={s.timesheetId} className="border-t border-gray-50 hover:bg-blue-50/40 transition-colors">
                        <td className="py-2.5 px-4">
                          <p className="font-semibold text-gray-900">
                            {formatDate(s.weekStart)} – {formatDate(s.weekEnd)}
                          </p>
                          <p className="text-xs text-gray-400">
                            {Number(s.regularHours || 0).toFixed(1)}h reg · {Number(s.otHours || 0).toFixed(1)}h OT
                          </p>
                        </td>
                        <td className="py-2.5 px-2 text-right text-gray-600">{formatPhp(s.regularPay)}</td>
                        <td className="py-2.5 px-2 text-right text-gray-600">{formatPhp(s.otPay)}</td>
                        <td className="py-2.5 px-2 text-right font-semibold text-gray-900">{formatPhp(s.gross)}</td>
                        <td className="py-2.5 px-2 text-right text-amber-600">{formatPhp(s.deductions?.total || 0)}</td>
                        <td className="py-2.5 px-2 text-right font-bold text-gray-900">{formatPhp(s.net)}</td>
                        <td className="py-2.5 px-4">
                          <Badge variant={STATUS_VARIANT[s.status] || 'default'} size="sm">{s.status}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-gray-100 bg-gray-50/70 font-semibold">
                      <td className="py-2.5 px-4 text-[11px] uppercase tracking-wide text-gray-400">Totals</td>
                      <td className="py-2.5 px-2 text-right text-gray-900">{formatPhp(totals.regularPay)}</td>
                      <td className="py-2.5 px-2 text-right text-gray-900">{formatPhp(totals.otPay)}</td>
                      <td className="py-2.5 px-2 text-right text-gray-900">{formatPhp(totals.gross)}</td>
                      <td className="py-2.5 px-2 text-right text-gray-900">{formatPhp(totals.deductions)}</td>
                      <td className="py-2.5 px-2 text-right text-blue-600">{formatPhp(totals.net)}</td>
                      <td className="py-2.5 px-4" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <EmptyState
                icon={Receipt}
                title="No statements yet"
                description="Weekly statements appear once your timesheets are approved."
              />
            )}
          </div>

          <p className="text-xs text-gray-400">
            Rate computed as monthly salary × 12 ÷ (52 weeks × 40 hours). OT paid at {Number(data.otPremium || 1.25).toFixed(2)}×.
            Deductions shown are placeholder statutory contributions.
          </p>
        </>
      )}
    </div>
  );
}