import { useState } from 'react';
import {
  FileBarChart, Clock, Calendar, Users,
  BarChart3, AlertTriangle, TrendingUp, UserCheck, CalendarDays,
  FileText, ClipboardList, ArrowRight, Eye,
} from 'lucide-react';
import Card from '../../components/ui/Card';
import Modal from '../../components/ui/Modal';
import {
  employeeService,
} from '../../services/api';
import useApiData from '../../hooks/useApiData';
import { formatDate } from '../../utils/helpers';
import { useToast } from '../../context/ToastContext';
import { buildReport } from '../../utils/reportHelpers';
import ReportPreview from '../../components/reports/ReportPreview';

const reportCategories = [
  {
    name: 'Attendance',
    color: 'emerald',
    icon: Clock,
    reports: [
      { name: 'Daily Time Record (DTR)', desc: 'Formal per-employee daily clock-in/out record for a period - the document DOLE and payroll ask for', icon: ClipboardList },
      { name: 'Monthly Attendance Summary', desc: 'Individual clock-in/out records with hours and status per day', icon: ClipboardList },
      { name: 'Department Attendance Breakdown', desc: 'Present/late/absent counts and attendance rate by department', icon: BarChart3 },
      { name: 'Absenteeism Trend Report', desc: 'Absence count and rate per employee over time', icon: AlertTriangle },
    ],
  },
  {
    name: 'Leave',
    color: 'blue',
    icon: Calendar,
    reports: [
      { name: 'Leave Utilization Report', desc: 'All leave requests with type, dates, and approval status', icon: FileText },
      { name: 'Pending Leave Requests', desc: 'Leave requests awaiting HR approval', icon: ClipboardList },
    ],
  },
  {
    name: 'Timesheet & Payroll',
    color: 'purple',
    icon: Clock,
    reports: [
      { name: 'Weekly Timesheet Summary', desc: 'Regular, overtime, break, and total hours per employee per week', icon: FileBarChart },
      { name: 'Overtime Analysis Report', desc: 'Requested vs approved vs actual overtime with variance', icon: TrendingUp },
    ],
  },
  {
    name: 'Shift',
    color: 'amber',
    icon: CalendarDays,
    reports: [
      { name: 'Shift Coverage Report', desc: 'All shift assignments with dates and statuses', icon: CalendarDays },
      { name: 'Employee Shift Distribution', desc: 'Total shifts assigned per employee broken down by shift type', icon: Users },
    ],
  },
  {
    name: 'Workforce',
    color: 'pink',
    icon: Users,
    reports: [
      { name: 'Consolidated Workforce Summary', desc: 'One-page cross-module summary: headcount, attendance, leave, overtime and absenteeism', icon: BarChart3 },
      { name: 'Workforce Headcount Report', desc: 'Active and on-leave headcount per department', icon: Users },
      { name: 'Employee Turnover Analysis', desc: 'Hire dates, tenure, and current status for all employees', icon: UserCheck },
    ],
  },
];

const colorStyles = {
  emerald: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-200', hover: 'hover:border-emerald-400' },
  blue: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-200', hover: 'hover:border-blue-400' },
  purple: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-200', hover: 'hover:border-purple-400' },
  amber: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-200', hover: 'hover:border-amber-400' },
  pink: { bg: 'bg-pink-50', text: 'text-pink-600', border: 'border-pink-200', hover: 'hover:border-pink-400' },
};

export default function Reports() {
  const { toast } = useToast();
  const [report, setReport] = useState(null);
  const [dateRange, setDateRange] = useState({ startDate: '', endDate: '' });
  const [generating, setGenerating] = useState(false);
  const [recentReports, setRecentReports] = useState([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [savedReports, setSavedReports] = useState(() => {
    try { return JSON.parse(localStorage.getItem('savedReports') || '[]'); } catch { return []; }
  });

  const { data: employeesData } = useApiData(() => employeeService.getAll(), []);

  const nameOf = (id) => {
    const emp = employeesData?.find((e) => e.id === id);
    return emp ? `${emp.firstName} ${emp.lastName}`.trim() : id;
  };

  const setQuickRange = (type) => {
    const now = new Date();
    const y = now.getFullYear(), m = now.getMonth();
    if (type === 'thisMonth') {
      setDateRange({ startDate: `${y}-${String(m + 1).padStart(2, '0')}-01`, endDate: `${y}-${String(m + 1).padStart(2, '0')}-${new Date(y, m + 1, 0).getDate()}` });
    } else if (type === 'lastMonth') {
      const lm = m === 0 ? 11 : m - 1, ly = m === 0 ? y - 1 : y;
      setDateRange({ startDate: `${ly}-${String(lm + 1).padStart(2, '0')}-01`, endDate: `${ly}-${String(lm + 1).padStart(2, '0')}-${new Date(ly, lm + 1, 0).getDate()}` });
    } else if (type === 'thisQuarter') {
      const qStart = Math.floor(m / 3) * 3;
      setDateRange({ startDate: `${y}-${String(qStart + 1).padStart(2, '0')}-01`, endDate: `${y}-${String(qStart + 3).padStart(2, '0')}-${new Date(y, qStart + 3, 0).getDate()}` });
    } else if (type === 'thisYear') {
      setDateRange({ startDate: `${y}-01-01`, endDate: `${y}-12-31` });
    }
  };

  const handleGenerate = async (reportName) => {
    setGenerating(true);
    try {
      const result = await buildReport(reportName, dateRange, nameOf, selectedEmployee, selectedDepartment, selectedStatus);
      setSavedReports((prev) => {
        const entry = { name: reportName, period: result.period, savedAt: new Date().toISOString(), report: result };
        const next = [entry, ...prev.filter((r) => r.name !== reportName)].slice(0, 10);
        try { localStorage.setItem('savedReports', JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
      setReport(result);
      setRecentReports((prev) => [reportName, ...prev.filter((r) => r !== reportName)].slice(0, 5));
    } catch {
      toast.error('Error', 'Failed to generate report from live data.');
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
        <p className="text-[14px] text-gray-500 mt-1">Generate professional workforce reports from live data</p>
      </div>

      {/* Report Preview Modal */}
      <Modal isOpen={!!report} onClose={() => setReport(null)} title={report?.title || 'Report'} size="full">
        {report && <ReportPreview report={report} />}
      </Modal>

      {/* Always show catalog behind */}
      <div className={report ? 'pointer-events-none opacity-40' : ''}>
        {/* Quick Date Range */}
        <Card>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-sm font-semibold text-gray-700">Date Range:</span>
              {[['thisMonth', 'This Month'], ['lastMonth', 'Last Month'], ['thisQuarter', 'This Quarter'], ['thisYear', 'This Year']].map(([k, l]) => (
                <button key={k} onClick={() => setQuickRange(k)} className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50/50 transition-colors">{l}</button>
              ))}
              {dateRange.startDate && (
                <span className="text-xs text-gray-400">
                  {formatDate(dateRange.startDate)} – {formatDate(dateRange.endDate)}
                  <button onClick={() => setDateRange({ startDate: '', endDate: '' })} className="ml-2 text-gray-400 hover:text-gray-600 underline">Clear</button>
                </span>
              )}
              <span className="text-sm font-semibold text-gray-700 ml-2">Employee:</span>
              <select
                value={selectedEmployee}
                onChange={(e) => setSelectedEmployee(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 outline-none"
              >
                <option value="">All employees</option>
                {(employeesData || []).map((e) => (
                  <option key={e.id} value={e.id}>{e.firstName} {e.lastName}</option>
                ))}
              </select>
              <span className="text-sm font-semibold text-gray-700 ml-2">Department:</span>
              <select
                value={selectedDepartment}
                onChange={(e) => setSelectedDepartment(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 outline-none"
              >
                <option value="">All departments</option>
                {[...new Set((employeesData || []).map((e) => e.department).filter(Boolean))].map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <span className="text-sm font-semibold text-gray-700 ml-2">Status:</span>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 text-gray-600 focus:border-blue-300 focus:ring-2 focus:ring-blue-100 outline-none"
              >
                <option value="">All statuses</option>
                <option value="Present">Present</option>
                <option value="Late">Late</option>
                <option value="Absent">Absent</option>
                <option value="Approved">Approved</option>
                <option value="Pending">Pending</option>
                <option value="Rejected">Rejected</option>
              </select>
            </div>
          </Card>

          {/* Report Categories */}
          {reportCategories.map((cat) => {
            const CatIcon = cat.icon;
            const cs = colorStyles[cat.color];
            return (
              <div key={cat.name}>
                <div className="flex items-center gap-2 mb-3">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${cs.bg}`}>
                    <CatIcon className={`w-4 h-4 ${cs.text}`} />
                  </div>
                  <h2 className="text-sm font-bold text-gray-900">{cat.name}</h2>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {cat.reports.map((rpt) => {
                    const RIcon = rpt.icon;
                    return (
                      <button
                        key={rpt.name}
                        onClick={() => handleGenerate(rpt.name)}
                        disabled={generating}
                        className={`text-left p-5 rounded-xl border-2 ${cs.border} bg-white ${cs.hover} transition-all duration-200 hover:shadow-md group disabled:opacity-50`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${cs.bg} transition-transform group-hover:scale-105`}>
                            <RIcon className={`w-5 h-5 ${cs.text}`} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-gray-900 group-hover:text-blue-600 transition-colors">{rpt.name}</p>
                            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{rpt.desc}</p>
                          </div>
                          <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-blue-500 shrink-0 mt-1 transition-all group-hover:translate-x-0.5" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}

          {/* Saved Reports (re-open without re-generating) */}
          {savedReports.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <FileText className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-700">Saved Reports</span>
                <button
                  onClick={() => { setSavedReports([]); try { localStorage.removeItem('savedReports'); } catch { /* ignore */ } }}
                  className="ml-auto text-xs text-gray-400 hover:text-red-500 transition-colors"
                >
                  Clear all
                </button>
              </div>
              <div className="space-y-2">
                {savedReports.map((r, i) => (
                  <button
                    key={i}
                    onClick={() => setReport(r.report)}
                    className="w-full text-left px-3 py-2 text-xs rounded-lg bg-gray-50 hover:bg-blue-50 hover:text-blue-600 transition-colors flex items-center justify-between"
                  >
                    <span className="font-medium">{r.name}</span>
                    <span className="text-gray-400">{new Date(r.savedAt).toLocaleString()}</span>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* Recently Generated */}
          {recentReports.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Eye className="w-4 h-4 text-gray-400" />
                <span className="text-sm font-semibold text-gray-700">Recently Generated</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentReports.map((name) => (
                  <button
                    key={name}
                    onClick={() => handleGenerate(name)}
                    disabled={generating}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </Card>
          )}
      </div>

      {/* Loading Overlay */}
      {generating && (
        <div className="fixed inset-0 bg-black/20 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-2xl shadow-xl p-8 flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
            <p className="text-sm font-semibold text-gray-700">Generating report...</p>
          </div>
        </div>
      )}
    </div>
  );
}
