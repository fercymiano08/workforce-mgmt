import { formatDate, formatTime } from './helpers';

// Words and colours for the timesheet workflow, shared by the employee and admin pages.

export const statusVariant = { Draft: 'default', Submitted: 'info', Approved: 'success', Rejected: 'danger' };

export const FLAG_INFO = {
  zero_hours: { label: 'No hours recorded', tone: 'red' },
  unpaid_overtime: { label: 'Overtime not fully paid', tone: 'purple' },
  missing_clock_out: { label: 'Missing clock-out', tone: 'amber' },
  changed_after_submit: { label: 'Attendance changed after submission', tone: 'red' },
};

export const whenText = (iso) => {
  const d = iso ? new Date(iso) : null;
  if (!d || Number.isNaN(d.getTime())) return '';
  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${formatDate(key)} ${formatTime(d.toTimeString().slice(0, 8))}`;
};
