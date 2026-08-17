import {
  employeeService, attendanceService, leaveService,
  timesheetService, shiftService, overtimeService,
} from '../services/api';
import { formatDate } from './helpers';

function pct(num, denom) {
  if (!denom) return '0%';
  return `${Math.round((num / denom) * 100)}%`;
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function fmtH(n) { return `${Number(n || 0).toFixed(1)}h`; }

function summarize(range) {
  if (!range.startDate && !range.endDate) return 'All Records';
  if (range.startDate && range.endDate) return `${formatDate(range.startDate)} – ${formatDate(range.endDate)}`;
  if (range.startDate) return `From ${formatDate(range.startDate)}`;
  return `Until ${formatDate(range.endDate)}`;
}

export async function buildReport(reportName, dateRange, nameOf) {
  const period = summarize(dateRange);
  const inRange = (date) => {
    if (!date) return true;
    if (!dateRange.startDate && !dateRange.endDate) return true;
    if (dateRange.startDate && date < dateRange.startDate) return false;
    if (dateRange.endDate && date > dateRange.endDate) return false;
    return true;
  };

  switch (reportName) {

    case 'Monthly Attendance Summary': {
      const records = await attendanceService.getAll();
      const filtered = records.filter((r) => inRange(r.date));
      const present = filtered.filter((r) => r.status === 'Present').length;
      const late = filtered.filter((r) => r.status === 'Late').length;
      const absent = filtered.filter((r) => r.status === 'Absent').length;
      const total = filtered.length || 1;
      const avgReg = avg(filtered.map((r) => Number(r.regularHours || 0)));
      const avgOt = avg(filtered.map((r) => Number(r.overtime || 0)));
      const attRate = pct(present + late, total);

      const statusData = [
        { name: 'Present', value: present },
        { name: 'Late', value: late },
        { name: 'Absent', value: absent },
      ];

      return {
        title: 'Monthly Attendance Summary',
        subtitle: `Individual clock-in/out records with hours and status breakdown`,
        summary: [
          { label: 'Total Records', value: String(filtered.length), color: 'blue' },
          { label: 'Attendance Rate', value: attRate, color: (present + late) / total >= 0.9 ? 'green' : 'amber' },
          { label: 'Avg Regular Hours', value: fmtH(avgReg), color: 'blue' },
          { label: 'Avg Overtime', value: fmtH(avgOt), color: avgOt > 2 ? 'amber' : 'green' },
        ],
        charts: [
          { type: 'pie', title: 'Status Distribution', data: statusData, dataKey: 'value', nameKey: 'name', colors: ['#22c55e', '#f59e0b', '#ef4444'] },
        ],
        insights: [
          `Overall attendance rate is ${attRate} for the selected period.`,
          filtered.length > 0 ? `An average of ${fmtH(avgReg)} regular hours recorded per entry.` : 'No attendance records found for this period.',
          absent > 0 ? `${absent} absent record${absent > 1 ? 's' : ''} flagged during this period.` : null,
          late > 0 ? `${late} late arrival${late > 1 ? 's' : ''} recorded.` : null,
        ].filter(Boolean),
        recommendations: [
          (present + late) / total < 0.9 ? 'Attendance rate is below 90%. Consider reviewing attendance policies.' : null,
          avgOt > 2 ? 'Average overtime exceeds 2 hours. Evaluate workload distribution.' : null,
          late > total * 0.15 ? 'Late arrivals exceed 15% of records. Punctuality coaching may be needed.' : null,
        ].filter(Boolean),
        cols: ['Employee', 'Date', 'Clock In', 'Clock Out', 'Status', 'Regular Hrs', 'OT Hrs'],
        rows: filtered.map((r) => [nameOf(r.employeeId), formatDate(r.date) || r.date, r.clockIn || '—', r.clockOut || '—', r.status || '—', fmtH(r.regularHours), fmtH(r.overtime)]),
        period,
      };
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
      const depts = Object.entries(byDept);
      const best = depts.sort((a, b) => {
        const ra = a[1].total ? (a[1].present + a[1].late) / a[1].total : 0;
        const rb = b[1].total ? (b[1].present + b[1].late) / b[1].total : 0;
        return rb - ra;
      })[0];
      const worst = depts.sort((a, b) => {
        const ra = a[1].total ? (a[1].present + a[1].late) / a[1].total : 0;
        const rb = b[1].total ? (b[1].present + b[1].late) / b[1].total : 0;
        return ra - rb;
      })[0];

      const chartData = depts.map(([dept, s]) => ({
        name: dept,
        Present: s.present,
        Late: s.late,
        Absent: s.absent,
      }));

      return {
        title: 'Department Attendance Breakdown',
        subtitle: 'Present, late, and absent counts with attendance rate per department',
        summary: [
          { label: 'Departments', value: String(depts.length), color: 'blue' },
          { label: 'Total Records', value: String(filtered.length), color: 'blue' },
          { label: 'Best Performing', value: best ? best[0] : '—', color: 'green' },
          { label: 'Needs Attention', value: worst ? worst[0] : '—', color: worst && best && worst[0] !== best[0] ? 'red' : 'blue' },
        ],
        charts: [
          { type: 'bar', title: 'Attendance by Department', data: chartData, dataKeys: ['Present', 'Late', 'Absent'], colors: ['#22c55e', '#f59e0b', '#ef4444'] },
        ],
        insights: [
          best ? `${best[0]} has the highest attendance rate at ${pct(best[1].present + best[1].late, best[1].total)}.` : null,
          worst && best && worst[0] !== best[0] ? `${worst[0]} has the lowest attendance rate at ${pct(worst[1].present + worst[1].late, worst[1].total)}.` : null,
          `Data covers ${depts.length} department${depts.length > 1 ? 's' : ''} with ${filtered.length} total records.`,
        ].filter(Boolean),
        recommendations: [
          worst && best && worst[0] !== best[0] && (worst[1].present + worst[1].late) / (worst[1].total || 1) < 0.85 ? `${worst[0]} attendance is below 85%. Investigate root causes.` : null,
          depts.length > 1 ? `Compare departmental performance during management reviews.` : null,
        ].filter(Boolean),
        cols: ['Department', 'Present', 'Late', 'Absent', 'Attendance Rate'],
        rows: depts.map(([dept, s]) => [dept, String(s.present), String(s.late), String(s.absent), pct(s.present + s.late, s.total)]),
        period,
      };
    }

    case 'Leave Utilization Report': {
      const records = await leaveService.getAll();
      const filtered = records.filter((r) => inRange(r.startDate));
      const approved = filtered.filter((r) => r.status === 'Approved').length;
      const pending = filtered.filter((r) => r.status === 'Pending').length;
      const rejected = filtered.filter((r) => r.status === 'Rejected').length;
      const byType = {};
      filtered.forEach((r) => {
        const t = r.leaveType || r.type || 'Other';
        byType[t] = (byType[t] || 0) + 1;
      });
      const pieData = Object.entries(byType).map(([name, value]) => ({ name, value }));

      return {
        title: 'Leave Utilization Report',
        subtitle: 'All leave requests with type, dates, and approval status',
        summary: [
          { label: 'Total Requests', value: String(filtered.length), color: 'blue' },
          { label: 'Approved', value: String(approved), color: 'green' },
          { label: 'Pending', value: String(pending), color: pending > 0 ? 'amber' : 'green' },
          { label: 'Rejected', value: String(rejected), color: rejected > 0 ? 'red' : 'green' },
        ],
        charts: [
          { type: 'pie', title: 'Leave by Type', data: pieData, dataKey: 'value', nameKey: 'name', colors: ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'] },
        ],
        insights: [
          filtered.length > 0 ? `${pct(approved, filtered.length)} of leave requests have been approved.` : 'No leave requests found for this period.',
          pending > 0 ? `${pending} request${pending > 1 ? 's' : ''} still awaiting approval.` : null,
          pieData.length > 0 ? `Most common leave type: ${pieData.sort((a, b) => b.value - a.value)[0]?.name}.` : null,
        ].filter(Boolean),
        recommendations: [
          pending > 3 ? 'Multiple pending requests detected. Expedite approvals to maintain employee satisfaction.' : null,
          approved > filtered.length * 0.8 ? 'High leave utilization. Ensure adequate coverage during peak absence periods.' : null,
        ].filter(Boolean),
        cols: ['Employee', 'Leave Type', 'Start Date', 'End Date', 'Status'],
        rows: filtered.map((r) => [r.employeeName || nameOf(r.employeeId), r.leaveType || r.type || '—', r.startDate || '—', r.endDate || '—', r.status || '—']),
        period,
      };
    }

    case 'Pending Leave Requests': {
      const records = await leaveService.getAll();
      const filtered = records.filter((r) => r.status === 'Pending' && inRange(r.startDate));
      const byType = {};
      filtered.forEach((r) => {
        const t = r.leaveType || r.type || 'Other';
        byType[t] = (byType[t] || 0) + 1;
      });
      const chartData = Object.entries(byType).map(([name, value]) => ({ name, value }));

      return {
        title: 'Pending Leave Requests',
        subtitle: 'Leave requests awaiting HR approval',
        summary: [
          { label: 'Pending', value: String(filtered.length), color: filtered.length > 0 ? 'amber' : 'green' },
          { label: 'Leave Types', value: String(chartData.length), color: 'blue' },
        ],
        charts: [
          { type: 'bar', title: 'Pending by Type', data: chartData, dataKeys: ['value'], colors: ['#f59e0b'], labels: chartData.map((d) => d.name) },
        ],
        insights: [
          filtered.length === 0 ? 'No pending leave requests. All caught up!' : `${filtered.length} leave request${filtered.length > 1 ? 's' : ''} pending HR action.`,
        ],
        recommendations: [
          filtered.length > 5 ? 'High volume of pending requests. Consider batch review.' : null,
          filtered.length > 0 ? 'Review and action pending requests promptly to avoid scheduling conflicts.' : null,
        ].filter(Boolean),
        cols: ['Employee', 'Type', 'Start', 'End', 'Reason'],
        rows: filtered.map((r) => [r.employeeName || nameOf(r.employeeId), r.leaveType || r.type || '—', r.startDate || '—', r.endDate || '—', r.reason || '—']),
        period,
      };
    }

    case 'Weekly Timesheet Summary': {
      const records = await timesheetService.getAll();
      const filtered = records.filter((r) => inRange(r.weekStart || r.periodStart));
      const totalReg = filtered.reduce((s, r) => s + Number(r.regularHours || 0), 0);
      const totalOt = filtered.reduce((s, r) => s + Number(r.overtimeHours || 0), 0);
      const totalBreak = filtered.reduce((s, r) => s + Number(r.breakHours || 0), 0);
      const totalAll = filtered.reduce((s, r) => s + Number(r.totalHours || 0), 0);
      const avgReg = avg(filtered.map((r) => Number(r.regularHours || 0)));
      const avgOt = avg(filtered.map((r) => Number(r.overtimeHours || 0)));

      const chartData = filtered.slice(0, 10).map((r) => ({
        name: (r.employeeName || nameOf(r.employeeId)).split(' ')[0],
        Regular: Number(r.regularHours || 0),
        Overtime: Number(r.overtimeHours || 0),
      }));

      return {
        title: 'Weekly Timesheet Summary',
        subtitle: 'Regular, overtime, break, and total hours per employee per week',
        summary: [
          { label: 'Total Entries', value: String(filtered.length), color: 'blue' },
          { label: 'Total Regular', value: fmtH(totalReg), color: 'blue' },
          { label: 'Total Overtime', value: fmtH(totalOt), color: totalOt > totalReg * 0.1 ? 'amber' : 'green' },
          { label: 'Total Hours', value: fmtH(totalAll), color: 'blue' },
        ],
        charts: [
          { type: 'bar', title: 'Hours by Employee (Top 10)', data: chartData, dataKeys: ['Regular', 'Overtime'], colors: ['#3b82f6', '#f59e0b'] },
        ],
        insights: [
          filtered.length > 0 ? `Average regular hours per entry: ${fmtH(avgReg)}. Average OT: ${fmtH(avgOt)}.` : 'No timesheet records found for this period.',
          totalOt > 0 ? `Overtime accounts for ${pct(totalOt, totalReg + totalOt)} of total hours worked.` : null,
        ].filter(Boolean),
        recommendations: [
          avgOt > 8 ? 'Average overtime per entry is high. Review staffing levels.' : null,
          totalBreak > totalReg * 0.1 ? 'Break hours exceed 10% of regular hours. Verify compliance.' : null,
        ].filter(Boolean),
        cols: ['Employee', 'Week', 'Regular Hrs', 'OT Hrs', 'Break', 'Total'],
        rows: filtered.map((r) => [r.employeeName || nameOf(r.employeeId), `${formatDate(r.weekStart || r.periodStart)} – ${formatDate(r.weekEnd)}`, fmtH(r.regularHours), fmtH(r.overtimeHours), fmtH(r.breakHours), fmtH(r.totalHours)]),
        period,
      };
    }

    case 'Overtime Analysis Report': {
      const [otRecords, attRecords] = await Promise.all([overtimeService.getAll(), attendanceService.getAll()]);
      const filtered = (otRecords || []).filter((r) => inRange(r.date));
      const totalRequested = filtered.reduce((s, r) => s + Number(r.expectedHours || 0), 0);
      const totalApproved = filtered.reduce((s, r) => s + Number(r.approvedHours || 0), 0);
      const totalActual = filtered.reduce((s, r) => {
        const att = (attRecords || []).find((a) => a.employeeId === r.employeeId && a.date === r.date);
        return s + Number(att?.overtime || 0);
      }, 0);

      const chartData = filtered.slice(0, 10).map((r) => {
        const att = (attRecords || []).find((a) => a.employeeId === r.employeeId && a.date === r.date);
        return {
          name: (r.employeeName || nameOf(r.employeeId)).split(' ')[0],
          Requested: Number(r.expectedHours || 0),
          Approved: Number(r.approvedHours || 0),
          Actual: Number(att?.overtime || 0),
        };
      });

      return {
        title: 'Overtime Analysis Report',
        subtitle: 'Requested vs approved vs actual overtime with variance tracking',
        summary: [
          { label: 'OT Records', value: String(filtered.length), color: 'blue' },
          { label: 'Total Requested', value: fmtH(totalRequested), color: 'blue' },
          { label: 'Total Approved', value: fmtH(totalApproved), color: 'green' },
          { label: 'Total Actual', value: fmtH(totalActual), color: totalActual > totalApproved ? 'amber' : 'green' },
        ],
        charts: [
          { type: 'bar', title: 'OT Comparison (Top 10)', data: chartData, dataKeys: ['Requested', 'Approved', 'Actual'], colors: ['#3b82f6', '#22c55e', '#f59e0b'] },
        ],
        insights: [
          filtered.length > 0 ? `Variance between approved and actual OT: ${fmtH(Math.abs(totalActual - totalApproved))}.` : 'No overtime records found for this period.',
          totalActual > totalApproved ? 'Actual overtime exceeds approved amounts — investigate overruns.' : null,
          totalActual <= totalApproved && filtered.length > 0 ? 'OT usage is within approved limits.' : null,
        ].filter(Boolean),
        recommendations: [
          totalActual > totalApproved * 1.1 ? 'Actual OT exceeds approved by >10%. Tighten OT approval controls.' : null,
          filtered.length > 10 ? 'High volume of OT entries. Evaluate if regular staffing is sufficient.' : null,
        ].filter(Boolean),
        cols: ['Employee', 'Date', 'Requested', 'Approved', 'Actual', 'Variance'],
        rows: filtered.map((r) => {
          const att = (attRecords || []).find((a) => a.employeeId === r.employeeId && a.date === r.date);
          const requested = Number(r.expectedHours || 0), approved = Number(r.approvedHours || 0), actual = Number(att?.overtime || 0);
          const variance = actual - approved;
          return [r.employeeName || nameOf(r.employeeId), formatDate(r.date), requested ? fmtH(requested) : '—', approved ? fmtH(approved) : '—', actual ? fmtH(actual) : '0h', variance !== 0 ? `${variance > 0 ? '+' : ''}${variance.toFixed(1)}h` : '—'];
        }),
        period,
      };
    }

    case 'Shift Coverage Report': {
      const records = await shiftService.getSchedules();
      const filtered = (records || []).filter((r) => inRange(r.date));
      const scheduled = filtered.filter((r) => r.status === 'Scheduled').length;
      const completed = filtered.filter((r) => r.status === 'Completed').length;
      const cancelled = filtered.filter((r) => r.status === 'Cancelled').length;

      const byDate = {};
      filtered.forEach((r) => {
        const d = r.date || 'Unknown';
        byDate[d] = (byDate[d] || 0) + 1;
      });
      const chartData = Object.entries(byDate).sort((a, b) => a[0].localeCompare(b[0])).slice(-14).map(([date, count]) => ({ name: formatDate(date), Shifts: count }));

      return {
        title: 'Shift Coverage Report',
        subtitle: 'All shift assignments with dates and statuses',
        summary: [
          { label: 'Total Assignments', value: String(filtered.length), color: 'blue' },
          { label: 'Scheduled', value: String(scheduled), color: 'blue' },
          { label: 'Completed', value: String(completed), color: 'green' },
          { label: 'Cancelled', value: String(cancelled), color: cancelled > 0 ? 'red' : 'green' },
        ],
        charts: [
          { type: 'bar', title: 'Shifts per Day', data: chartData, dataKeys: ['Shifts'], colors: ['#3b82f6'] },
        ],
        insights: [
          filtered.length > 0 ? `${filtered.length} total shift assignments across ${Object.keys(byDate).length} day(s).` : 'No shift schedules found for this period.',
          cancelled > 0 ? `${cancelled} shift${cancelled > 1 ? 's' : ''} cancelled — may indicate coverage gaps.` : null,
        ].filter(Boolean),
        recommendations: [
          cancelled > filtered.length * 0.1 ? 'Cancellation rate exceeds 10%. Review shift assignment process.' : null,
          Object.keys(byDate).length > 0 && filtered.length / Object.keys(byDate).length < 2 ? 'Low average shifts per day. Ensure minimum coverage requirements are met.' : null,
        ].filter(Boolean),
        cols: ['Employee', 'Date', 'Shift', 'Status'],
        rows: filtered.map((r) => [r.employeeName || nameOf(r.employeeId), formatDate(r.date), r.shiftId || '—', r.status || 'Scheduled']),
        period,
      };
    }

    case 'Employee Shift Distribution': {
      const [schedules, allShifts, employees] = await Promise.all([shiftService.getSchedules(), shiftService.getAllShifts(), employeeService.getAll()]);
      const empMap = {};
      (employees || []).forEach((e) => { empMap[e.id] = `${e.firstName || ''} ${e.lastName || ''}`.trim() || e.id; });
      const shiftNames = {};
      (allShifts || []).forEach((s) => { shiftNames[s.id || s.shiftId] = s.name || s.shiftName || s.id; });
      const byEmp = {};
      (schedules || []).filter((r) => inRange(r.date)).forEach((r) => {
        const name = r.employeeName || empMap[r.employeeId] || r.employeeId;
        const sid = r.shiftId || r.shiftDefinitionId || '—';
        if (!byEmp[name]) byEmp[name] = { total: 0, shifts: {} };
        byEmp[name].total++;
        byEmp[name].shifts[sid] = (byEmp[name].shifts[sid] || 0) + 1;
      });
      const allShiftTypes = [...new Set(Object.values(byEmp).flatMap((e) => Object.keys(e.shifts)))];
      const empArr = Object.entries(byEmp).sort((a, b) => b[1].total - a[1].total);

      const chartData = empArr.slice(0, 10).map(([name, data]) => {
        const entry = { name: name.split(' ')[0] };
        allShiftTypes.forEach((sid) => { entry[shiftNames[sid] || sid] = data.shifts[sid] || 0; });
        return entry;
      });
      const chartColors = ['#3b82f6', '#22c55e', '#f59e0b', '#8b5cf6', '#ef4444', '#ec4899'];

      return {
        title: 'Employee Shift Distribution',
        subtitle: 'Total shifts assigned per employee broken down by shift type',
        summary: [
          { label: 'Employees', value: String(empArr.length), color: 'blue' },
          { label: 'Total Assignments', value: String(empArr.reduce((s, [, d]) => s + d.total, 0)), color: 'blue' },
          { label: 'Most Assigned', value: empArr.length > 0 ? empArr[0][0].split(' ')[0] : '—', color: 'green' },
          { label: 'Shift Types', value: String(allShiftTypes.length), color: 'blue' },
        ],
        charts: [
          { type: 'bar', title: 'Shifts per Employee (Top 10)', data: chartData, dataKeys: allShiftTypes.map((sid) => shiftNames[sid] || sid), colors: chartColors },
        ],
        insights: [
          empArr.length > 0 ? `${empArr[0][0]} has the most shifts assigned (${empArr[0][1].total}).` : 'No shift assignments found for this period.',
          empArr.length > 1 ? `${empArr[empArr.length - 1][0]} has the fewest (${empArr[empArr.length - 1][1].total}).` : null,
        ].filter(Boolean),
        recommendations: [
          empArr.length > 1 && empArr[0][1].total > empArr[empArr.length - 1][1].total * 2 ? 'Significant workload imbalance detected. Consider redistributing shifts.' : null,
        ].filter(Boolean),
        cols: ['Employee', ...allShiftTypes.map((sid) => shiftNames[sid] || sid), 'Total'],
        rows: empArr.map(([name, data]) => [name, ...allShiftTypes.map((sid) => String(data.shifts[sid] || 0)), String(data.total)]),
        period,
      };
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
      const totalActive = (employees || []).filter((e) => e.status === 'Active').length;
      const totalOnLeave = (employees || []).filter((e) => e.status === 'On Leave').length;
      const totalInactive = (employees || []).filter((e) => e.status !== 'Active' && e.status !== 'On Leave').length;
      const depts = Object.entries(byDept);

      const statusPie = [
        { name: 'Active', value: totalActive },
        { name: 'On Leave', value: totalOnLeave },
        { name: 'Inactive', value: totalInactive },
      ];
      const deptBar = depts.map(([dept, s]) => ({ name: dept, Active: s.active, 'On Leave': s.onLeave, Inactive: s.inactive }));

      return {
        title: 'Workforce Headcount Report',
        subtitle: 'Active, on leave, and inactive headcount per department',
        summary: [
          { label: 'Total Headcount', value: String((employees || []).length), color: 'blue' },
          { label: 'Active', value: String(totalActive), color: 'green' },
          { label: 'On Leave', value: String(totalOnLeave), color: totalOnLeave > 0 ? 'amber' : 'green' },
          { label: 'Departments', value: String(depts.length), color: 'blue' },
        ],
        charts: [
          { type: 'pie', title: 'Status Overview', data: statusPie, dataKey: 'value', nameKey: 'name', colors: ['#22c55e', '#f59e0b', '#94a3b8'] },
          { type: 'bar', title: 'Headcount by Department', data: deptBar, dataKeys: ['Active', 'On Leave', 'Inactive'], colors: ['#22c55e', '#f59e0b', '#94a3b8'] },
        ],
        insights: [
          `Total workforce: ${(employees || []).length} employees across ${depts.length} department${depts.length > 1 ? 's' : ''}.`,
          totalActive > 0 ? `${pct(totalActive, (employees || []).length)} of the workforce is currently active.` : null,
          depts.length > 0 ? `Largest department: ${depts.sort((a, b) => b[1].total - a[1].total)[0]?.[0]} (${depts.sort((a, b) => b[1].total - a[1].total)[0]?.[1].total}).` : null,
        ].filter(Boolean),
        recommendations: [
          totalInactive > totalActive * 0.2 ? 'Inactive headcount exceeds 20%. Review offboarding and reactivation processes.' : null,
          depts.length > 0 && depts.sort((a, b) => b[1].total - a[1].total)[0]?.[1].total > (employees || []).length * 0.5 ? 'One department holds >50% of headcount. Evaluate organizational balance.' : null,
        ].filter(Boolean),
        cols: ['Department', 'Active', 'On Leave', 'Inactive', 'Total'],
        rows: depts.map(([dept, s]) => [dept, String(s.active), String(s.onLeave), String(s.inactive), String(s.total)]),
        period,
      };
    }

    case 'Employee Turnover Analysis': {
      const employees = await employeeService.getAll();
      const rows = (employees || []).map((e) => {
        const hired = e.dateHired || e.hireDate || '—';
        const tenure = hired !== '—' ? Math.floor((Date.now() - new Date(hired).getTime()) / (1000 * 60 * 60 * 24 * 30)) : 0;
        return { name: e.firstName ? `${e.firstName} ${e.lastName}` : e.id, dept: e.department || '—', hired, status: e.status || '—', tenure };
      });
      const activeEmps = rows.filter((r) => r.status === 'Active');
      const avgTenure = avg(rows.filter((r) => r.hired !== '—').map((r) => r.tenure));
      const recentHires = rows.filter((r) => r.hired !== '—' && r.tenure <= 3);

      const tenureBuckets = { '0-3 mo': 0, '3-6 mo': 0, '6-12 mo': 0, '1-2 yr': 0, '2+ yr': 0 };
      rows.forEach((r) => {
        if (r.tenure <= 3) tenureBuckets['0-3 mo']++;
        else if (r.tenure <= 6) tenureBuckets['3-6 mo']++;
        else if (r.tenure <= 12) tenureBuckets['6-12 mo']++;
        else if (r.tenure <= 24) tenureBuckets['1-2 yr']++;
        else tenureBuckets['2+ yr']++;
      });
      const tenureData = Object.entries(tenureBuckets).map(([name, value]) => ({ name, value }));

      return {
        title: 'Employee Turnover Analysis',
        subtitle: 'Hire dates, tenure, and current status for all employees',
        summary: [
          { label: 'Total Employees', value: String(rows.length), color: 'blue' },
          { label: 'Active', value: String(activeEmps.length), color: 'green' },
          { label: 'Avg Tenure', value: `${avgTenure.toFixed(1)} mo`, color: 'blue' },
          { label: 'Recent Hires (<3 mo)', value: String(recentHires.length), color: recentHires.length > 0 ? 'amber' : 'green' },
        ],
        charts: [
          { type: 'bar', title: 'Tenure Distribution', data: tenureData, dataKeys: ['value'], colors: ['#3b82f6'] },
        ],
        insights: [
          `Average employee tenure is ${avgTenure.toFixed(1)} months.`,
          recentHires.length > 0 ? `${recentHires.length} employee${recentHires.length > 1 ? 's' : ''} joined within the last 3 months.` : null,
          tenureBuckets['0-3 mo'] > rows.length * 0.3 ? 'High proportion of new hires (0-3 months). Monitor early turnover risk.' : null,
        ].filter(Boolean),
        recommendations: [
          recentHires.length > 0 ? 'Ensure comprehensive onboarding for recent hires to reduce early turnover.' : null,
          avgTenure < 12 ? 'Average tenure under 1 year. Review retention strategies and employee engagement.' : null,
        ].filter(Boolean),
        cols: ['Employee', 'Department', 'Date Hired', 'Status', 'Tenure'],
        rows: rows.map((r) => [r.name, r.dept, r.hired !== '—' ? formatDate(r.hired) : '—', r.status, r.hired !== '—' ? `${r.tenure} mo` : '—']),
        period,
      };
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
      const entries = Object.entries(byEmp).map(([empId, s]) => ({
        name: nameOf(empId),
        absent: s.absent,
        total: s.total,
        rate: s.total ? (s.absent / s.total) * 100 : 0,
      }));
      const totalAbsent = entries.reduce((s, e) => s + e.absent, 0);
      const totalScheduled = entries.reduce((s, e) => s + e.total, 0);
      const overallRate = totalScheduled ? (totalAbsent / totalScheduled) * 100 : 0;
      const topAbsentees = entries.sort((a, b) => b.rate - a.rate).slice(0, 5);

      const chartData = entries.filter((e) => e.absent > 0).sort((a, b) => b.rate - a.rate).slice(0, 10).map((e) => ({
        name: e.name.split(' ')[0],
        Absences: e.absent,
        Rate: Math.round(e.rate),
      }));

      return {
        title: 'Absenteeism Trend Report',
        subtitle: 'Absence count and rate per employee over time',
        summary: [
          { label: 'Overall Absence Rate', value: `${overallRate.toFixed(1)}%`, color: overallRate > 10 ? 'red' : 'green' },
          { label: 'Total Absences', value: String(totalAbsent), color: totalAbsent > 0 ? 'amber' : 'green' },
          { label: 'Employees Tracked', value: String(entries.length), color: 'blue' },
          { label: 'Top Offender Rate', value: topAbsentees.length > 0 ? `${topAbsentees[0].rate.toFixed(1)}%` : '—', color: topAbsentees.length > 0 && topAbsentees[0].rate > 15 ? 'red' : 'blue' },
        ],
        charts: [
          { type: 'bar', title: 'Absenteeism by Employee', data: chartData, dataKeys: ['Absences'], colors: ['#ef4444'] },
        ],
        insights: [
          `Overall absenteeism rate is ${overallRate.toFixed(1)}% across ${entries.length} employee${entries.length > 1 ? 's' : ''}.`,
          topAbsentees.length > 0 ? `${topAbsentees[0].name} has the highest absence rate at ${topAbsentees[0].rate.toFixed(1)}%.` : null,
          overallRate > 10 ? 'Absence rate exceeds 10% — warrants investigation.' : null,
        ].filter(Boolean),
        recommendations: [
          overallRate > 10 ? 'High absenteeism detected. Review attendance policies and employee well-being.' : null,
          topAbsentees.length > 0 && topAbsentees[0].rate > 20 ? `${topAbsentees[0].name} exceeds 20% absence rate. Schedule a welfare check.` : null,
        ].filter(Boolean),
        cols: ['Employee', 'Absences', 'Total Scheduled', 'Absenteeism Rate'],
        rows: entries.sort((a, b) => b.rate - a.rate).map((e) => [e.name, String(e.absent), String(e.total), `${e.rate.toFixed(1)}%`]),
        period,
      };
    }

    case 'Payroll Discrepancy Report': {
      const records = await timesheetService.getAll();
      const filtered = records.filter((r) => inRange(r.weekStart || r.periodStart));
      const discrepancies = filtered.map((r) => {
        const regular = Number(r.regularHours || 0), ot = Number(r.overtimeHours || 0), total = Number(r.totalHours || 0);
        const expected = regular + ot;
        const disc = total - expected;
        return { name: r.employeeName || nameOf(r.employeeId), regular, ot, total, expected, disc: Math.abs(disc) > 0.01 ? disc : 0 };
      });
      const withDisc = discrepancies.filter((d) => d.disc !== 0);
      const totalVariance = discrepancies.reduce((s, d) => s + d.disc, 0);

      const chartData = withDisc.slice(0, 10).map((d) => ({
        name: d.name.split(' ')[0],
        Variance: Number(d.disc.toFixed(1)),
      }));

      return {
        title: 'Payroll Discrepancy Report',
        subtitle: 'Detects mismatches between logged and expected hours',
        summary: [
          { label: 'Total Entries', value: String(filtered.length), color: 'blue' },
          { label: 'Discrepancies Found', value: String(withDisc.length), color: withDisc.length > 0 ? 'red' : 'green' },
          { label: 'Total Variance', value: fmtH(Math.abs(totalVariance)), color: withDisc.length > 0 ? 'amber' : 'green' },
          { label: 'Clean Entries', value: String(filtered.length - withDisc.length), color: 'green' },
        ],
        charts: [
          { type: 'bar', title: 'Hours Variance by Employee', data: chartData, dataKeys: ['Variance'], colors: ['#ef4444'] },
        ],
        insights: [
          withDisc.length === 0 ? 'No discrepancies found. All entries are consistent.' : `${withDisc.length} of ${filtered.length} entries have hour discrepancies.`,
          withDisc.length > 0 ? `Total payroll variance: ${fmtH(Math.abs(totalVariance))}.` : null,
        ].filter(Boolean),
        recommendations: [
          withDisc.length > 0 ? 'Review flagged entries before payroll processing to prevent overpayment or underpayment.' : null,
          withDisc.length > filtered.length * 0.2 ? 'More than 20% of entries have discrepancies. Investigate timesheet submission process.' : null,
        ].filter(Boolean),
        cols: ['Employee', 'Regular Hrs', 'OT Hrs', 'Total', 'Discrepancy'],
        rows: discrepancies.map((d) => [d.name, fmtH(d.regular), fmtH(d.ot), fmtH(d.total), d.disc !== 0 ? fmtH(d.disc) : '—']),
        period,
      };
    }

    default:
      return {
        title: reportName,
        subtitle: 'Unknown report type',
        summary: [],
        charts: [],
        insights: ['This report type is not recognized.'],
        recommendations: [],
        cols: [],
        rows: [],
        period,
      };
  }
}
