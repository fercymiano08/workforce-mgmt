import { useState } from 'react';
import { FileBarChart, Printer, Download } from 'lucide-react';
import Card from '../../components/ui/Card';
import Button from '../../components/ui/Button';
import Badge from '../../components/ui/Badge';
import { Select } from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import {
  employeeService,
  attendanceService,
  leaveService,
  timesheetService,
  shiftService,
  overtimeService,
} from '../../services/api';
import useApiData from '../../hooks/useApiData';
import { formatDate } from '../../utils/helpers';
import { downloadCSV, downloadFile, toHTMLTable } from '../../utils/export';
import { useToast } from '../../context/ToastContext';

const reportTypes = [
  { name: 'Monthly Attendance Summary', label: 'Attendance', type: 'attendance' },
  { name: 'Department Attendance Breakdown', label: 'Attendance', type: 'attendance' },
  { name: 'Leave Utilization Report', label: 'Leave', type: 'leave' },
  { name: 'Pending Leave Requests', label: 'Leave', type: 'leave' },
  { name: 'Weekly Timesheet Summary', label: 'Timesheet', type: 'timesheet' },
  { name: 'Overtime Analysis Report', label: 'Timesheet', type: 'timesheet' },
  { name: 'Shift Coverage Report', label: 'Shift', type: 'shift' },
  { name: 'Shift Swap History', label: 'Shift', type: 'shift' },
  { name: 'Workforce Headcount Report', label: 'Headcount', type: 'workforce_analytics' },
  { name: 'Employee Turnover Analysis', label: 'Turnover', type: 'workforce_analytics' },
  { name: 'Absenteeism Trend Report', label: 'Absenteeism', type: 'attendance' },
  { name: 'Payroll Discrepancy Report', label: 'Payroll', type: 'timesheet' },
];

const emptyPreview = { cols: [], rows: [], message: 'No records found for the selected period.' };

export default function Reports() {
  const { toast } = useToast();
  const [isGenerateOpen, setIsGenerateOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [preview, setPreview] = useState(emptyPreview);
  const [generateForm, setGenerateForm] = useState({ reportType: '', startDate: '', endDate: '', format: 'pdf' });
  const [generateErrors, setGenerateErrors] = useState({});

  const { data: employeesData } = useApiData(() => employeeService.getAll(), []);

  const nameOf = (id) => {
    const emp = employeesData?.find((e) => e.id === id);
    return emp ? `${emp.firstName} ${emp.lastName}`.trim() : id;
  };

  const inRange = (date) => {
    if (!date) return true;
    if (!generateForm.startDate && !generateForm.endDate) return true;
    if (generateForm.startDate && date < generateForm.startDate) return false;
    if (generateForm.endDate && date > generateForm.endDate) return false;
    return true;
  };

  const generateRows = async (reportName) => {
    switch (reportName) {
      case 'Monthly Attendance Summary': {
        const records = await attendanceService.getAll();
        const rows = records
          .filter((r) => inRange(r.date))
          .map((r) => [nameOf(r.employeeId), formatDate(r.date) || r.date, r.clockIn || '—', r.clockOut || '—', r.status || '—', `${Number(r.regularHours || 0).toFixed(1)}h`, `${Number(r.overtime || 0).toFixed(1)}h`]);
        return { cols: ['Employee', 'Date', 'Clock In', 'Clock Out', 'Status', 'Regular Hrs', 'OT Hrs'], rows };
      }
      case 'Department Attendance Breakdown': {
        const [records, employees] = await Promise.all([attendanceService.getAll(), employeeService.getAll()]);
        const deptMap = {};
        (employees || []).forEach((e) => { deptMap[e.id] = e.department || 'Unassigned'; });
        const filtered = records.filter((r) => inRange(r.date));
        const byDept = {};
        filtered.forEach((r) => {
          const dept = deptMap[r.employeeId] || 'Unassigned';
          if (!byDept[dept]) byDept[dept] = { present: 0, late: 0, absent: 0, total: 0 };
          byDept[dept].total++;
          if (r.status === 'Present') byDept[dept].present++;
          else if (r.status === 'Late') byDept[dept].late++;
          else if (r.status === 'Absent') byDept[dept].absent++;
        });
        const rows = Object.entries(byDept).map(([dept, s]) => [dept, String(s.present), String(s.late), String(s.absent), s.total ? `${Math.round(((s.present + s.late) / s.total) * 100)}%` : '—']);
        return { cols: ['Department', 'Present', 'Late', 'Absent', 'Attendance Rate'], rows };
      }
      case 'Leave Utilization Report': {
        const records = await leaveService.getAll();
        const rows = records
          .filter((r) => inRange(r.startDate))
          .map((r) => [r.employeeName || nameOf(r.employeeId), r.leaveType || r.type || '—', r.startDate || '—', r.endDate || '—', r.status || '—']);
        return { cols: ['Employee', 'Leave Type', 'Start Date', 'End Date', 'Status'], rows };
      }
      case 'Pending Leave Requests': {
        const records = await leaveService.getAll();
        const rows = records
          .filter((r) => r.status === 'Pending' && inRange(r.startDate))
          .map((r) => [r.employeeName || nameOf(r.employeeId), r.leaveType || r.type || '—', r.startDate || '—', r.endDate || '—', r.reason || '—']);
        return { cols: ['Employee', 'Type', 'Start', 'End', 'Reason'], rows };
      }
      case 'Weekly Timesheet Summary': {
        const records = await timesheetService.getAll();
        const rows = records
          .filter((r) => inRange(r.weekStart || r.periodStart))
          .map((r) => [r.employeeName || nameOf(r.employeeId), `${formatDate(r.weekStart || r.periodStart)} – ${formatDate(r.weekEnd)}`, `${Number(r.regularHours || 0).toFixed(1)}h`, `${Number(r.overtimeHours || 0).toFixed(1)}h`, `${Number(r.breakHours || 0).toFixed(1)}h`, `${Number(r.totalHours || 0).toFixed(1)}h`]);
        return { cols: ['Employee', 'Week', 'Regular Hrs', 'OT Hrs', 'Break', 'Total'], rows };
      }
      case 'Overtime Analysis Report': {
        const [otRecords, attRecords] = await Promise.all([overtimeService.getAll(), attendanceService.getAll()]);
        const rows = (otRecords || [])
          .filter((r) => inRange(r.date))
          .map((r) => {
            const att = (attRecords || []).find((a) => a.employeeId === r.employeeId && a.date === r.date);
            const requested = Number(r.expectedHours || 0);
            const approved = Number(r.approvedHours || 0);
            const actual = Number(att?.overtime || 0);
            const variance = actual - approved;
            return [r.employeeName || nameOf(r.employeeId), formatDate(r.date), requested ? `${requested}h` : '—', approved ? `${approved}h` : '—', actual ? `${actual}h` : '0h', variance !== 0 ? `${variance > 0 ? '+' : ''}${variance.toFixed(1)}h` : '—'];
          });
        return { cols: ['Employee', 'Date', 'Requested', 'Approved', 'Actual', 'Variance'], rows };
      }
      case 'Shift Coverage Report': {
        const records = await shiftService.getSchedules();
        const rows = (records || [])
          .filter((r) => inRange(r.date))
          .map((r) => [r.employeeName || nameOf(r.employeeId), formatDate(r.date), r.shiftId || '—', r.status || 'Scheduled']);
        return { cols: ['Employee', 'Date', 'Shift', 'Status'], rows };
      }
      case 'Shift Swap History': {
        const records = await shiftService.getSchedules();
        const rows = (records || [])
          .filter((r) => r.status === 'Swapped' && inRange(r.date))
          .map((r) => [r.employeeName || nameOf(r.employeeId), formatDate(r.date), r.shiftId || '—', r.status]);
        return { cols: ['Employee', 'Date', 'Shift', 'Status'], rows };
      }
      case 'Workforce Headcount Report': {
        const employees = await employeeService.getAll();
        const byDept = {};
        (employees || []).forEach((e) => {
          const dept = e.department || 'Unassigned';
          if (!byDept[dept]) byDept[dept] = { active: 0, onLeave: 0, inactive: 0, total: 0 };
          byDept[dept].total++;
          if (e.status === 'Active') byDept[dept].active++;
          else if (e.status === 'On Leave') byDept[dept].onLeave++;
          else byDept[dept].inactive++;
        });
        const rows = Object.entries(byDept).map(([dept, s]) => [dept, String(s.active), String(s.onLeave), String(s.inactive), String(s.total)]);
        return { cols: ['Department', 'Active', 'On Leave', 'Inactive', 'Total'], rows };
      }
      case 'Employee Turnover Analysis': {
        const employees = await employeeService.getAll();
        const rows = (employees || []).map((e) => {
          const hired = e.dateHired || e.hireDate || '—';
          const tenure = hired !== '—' ? `${Math.floor((Date.now() - new Date(hired).getTime()) / (1000 * 60 * 60 * 24 * 30))}mo` : '—';
          return [e.firstName ? `${e.firstName} ${e.lastName}` : e.id, e.department || '—', hired, e.status || '—', tenure];
        });
        return { cols: ['Employee', 'Department', 'Date Hired', 'Status', 'Tenure'], rows };
      }
      case 'Absenteeism Trend Report': {
        const records = await attendanceService.getAll();
        const byEmp = {};
        (records || []).forEach((r) => {
          if (!inRange(r.date)) return;
          if (!byEmp[r.employeeId]) byEmp[r.employeeId] = { absent: 0, total: 0 };
          byEmp[r.employeeId].total++;
          if (r.status === 'Absent') byEmp[r.employeeId].absent++;
        });
        const rows = Object.entries(byEmp).map(([empId, s]) => [nameOf(empId), String(s.absent), String(s.total), s.total ? `${Math.round((s.absent / s.total) * 100)}%` : '—']);
        return { cols: ['Employee', 'Absences', 'Total Scheduled', 'Absenteeism Rate'], rows };
      }
      case 'Payroll Discrepancy Report': {
        const records = await timesheetService.getAll();
        const rows = (records || [])
          .filter((r) => inRange(r.weekStart || r.periodStart))
          .map((r) => {
            const regular = Number(r.regularHours || 0);
            const ot = Number(r.overtimeHours || 0);
            const total = Number(r.totalHours || 0);
            const expected = regular + ot;
            const discrepancy = total !== expected ? `${(total - expected).toFixed(1)}h` : '—';
            return [r.employeeName || nameOf(r.employeeId), `${regular.toFixed(1)}h`, `${ot.toFixed(1)}h`, `${total.toFixed(1)}h`, discrepancy];
          });
        return { cols: ['Employee', 'Regular Hrs', 'OT Hrs', 'Total', 'Discrepancy'], rows };
      }
      default:
        return { cols: [], rows: [], message: 'Unknown report type.' };
    }
  };

  const handleGenerateChange = (field, value) => {
    setGenerateForm((prev) => ({ ...prev, [field]: value }));
    if (generateErrors[field]) setGenerateErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const validateGenerate = () => {
    const errors = {};
    if (!generateForm.reportType) errors.reportType = 'Report type is required';
    if (generateForm.startDate && generateForm.endDate && generateForm.endDate < generateForm.startDate) {
      errors.endDate = 'End date cannot be before start date';
    }
    setGenerateErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleGenerateSubmit = async () => {
    if (!validateGenerate()) return;
    const selected = reportTypes.find((r) => r.name === generateForm.reportType);
    try {
      const result = await generateRows(selected.name);
      setPreview({
        ...result,
        message: result.rows.length === 0 ? emptyPreview.message : undefined,
        meta: { name: generateForm.reportType, generatedAt: new Date().toISOString(), rows: result.rows.length },
      });
      setIsGenerateOpen(false);
      setIsPreviewOpen(true);
    } catch {
      toast.error('Error', 'Failed to generate report from live data.');
    }
  };

  const handleExport = () => {
    const rows = preview.rows.map((r) => {
      const obj = {};
      preview.cols.forEach((col, i) => { obj[col] = r[i]; });
      return obj;
    });
    const base = `report-${(preview.meta?.name || 'export').toLowerCase().replace(/\s+/g, '-')}`;
    if (generateForm.format === 'csv') {
      downloadCSV(`${base}.csv`, rows);
    } else if (generateForm.format === 'excel') {
      downloadFile(`${base}.xls`, toHTMLTable(preview.cols, preview.rows), 'application/vnd.ms-excel;charset=utf-8;');
    } else {
      window.print();
      return;
    }
    toast.success('Export Complete', `Report exported as ${generateForm.format.toUpperCase()}.`);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-[14px] text-gray-500 mt-1">Generate reports from live workforce data</p>
        </div>
        <Button icon={FileBarChart} onClick={() => setIsGenerateOpen(true)}>
          Generate Report
        </Button>
      </div>

      {/* Empty State */}
      <Card className="text-center py-16">
        <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto">
          <FileBarChart className="w-7 h-7 text-blue-600" />
        </div>
        <h3 className="text-lg font-semibold text-gray-900 mt-4">No reports generated yet</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">
          Use the Generate Report button to build a report preview from the live records in your database.
        </p>
      </Card>

      {/* Preview Modal */}
      <Modal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        title={preview.meta?.name || 'Report Preview'}
        size="xl"
      >
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <Badge variant="primary">
              {reportTypes.find((r) => r.name === preview.meta?.name)?.label || 'Report'}
            </Badge>
            <span className="text-xs text-gray-500">
              Generated {preview.meta ? formatDate(preview.meta.generatedAt) : '—'} &middot; {preview.meta?.rows ?? 0} records
            </span>
          </div>

          <div className="bg-gray-50 rounded-xl p-4">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">Report Preview</h4>
            {preview.rows.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200">
                      {preview.cols.map((col) => (
                        <th key={col} className="text-left px-3 py-2 text-xs font-semibold text-gray-500 uppercase">{col}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {preview.rows.map((row, i) => (
                      <tr key={i} className="hover:bg-gray-100/50 transition-colors">
                        {row.map((cell, j) => (
                          <td key={j} className={`px-3 py-2.5 text-gray-900 ${j > 0 ? 'text-gray-600' : 'font-medium'}`}>
                            {cell}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-500 text-center py-8">{preview.message}</p>
            )}
          </div>

          <div className="flex items-center justify-end pt-3 border-t border-gray-100">
            <div className="flex items-center gap-3">
              <Button variant="outline" icon={Download} onClick={handleExport}>
                Export {generateForm.format.toUpperCase()}
              </Button>
              <Button variant="outline" icon={Printer} onClick={() => window.print()}>
                Print
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Generate Report Modal */}
      <Modal
        isOpen={isGenerateOpen}
        onClose={() => setIsGenerateOpen(false)}
        title="Generate New Report"
        size="md"
      >
        <div className="space-y-4">
          <Select
            label="Report Type"
            value={generateForm.reportType}
            onChange={(e) => handleGenerateChange('reportType', e.target.value)}
            error={generateErrors.reportType}
          >
            <option value="">Select a report</option>
            {reportTypes.map((type) => (
              <option key={type.name} value={type.name}>{type.name}</option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Start Date</label>
              <input
                type="date"
                value={generateForm.startDate}
                onChange={(e) => handleGenerateChange('startDate', e.target.value)}
                className={`w-full px-3.5 py-2.5 text-sm rounded-xl border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                  generateErrors.startDate ? 'border-red-300' : 'border-gray-200'
                }`}
              />
              {generateErrors.startDate && <p className="text-xs text-red-500">{generateErrors.startDate}</p>}
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">End Date</label>
              <input
                type="date"
                value={generateForm.endDate}
                onChange={(e) => handleGenerateChange('endDate', e.target.value)}
                className={`w-full px-3.5 py-2.5 text-sm rounded-xl border transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 ${
                  generateErrors.endDate ? 'border-red-300' : 'border-gray-200'
                }`}
              />
              {generateErrors.endDate && <p className="text-xs text-red-500">{generateErrors.endDate}</p>}
            </div>
          </div>

          <Select
            label="Export Format"
            value={generateForm.format}
            onChange={(e) => handleGenerateChange('format', e.target.value)}
          >
            <option value="pdf">PDF</option>
            <option value="excel">Excel</option>
            <option value="csv">CSV</option>
          </Select>

          <div className="flex justify-end gap-3 pt-4 border-t border-gray-100">
            <Button variant="outline" onClick={() => setIsGenerateOpen(false)}>Cancel</Button>
            <Button icon={FileBarChart} onClick={handleGenerateSubmit}>Generate</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
