export const ROLES = ['Workforce Admin', 'Employee'];

export const DEPARTMENTS = ['Engineering', 'Marketing', 'HR', 'Finance', 'Sales', 'Operations', 'IT', 'Legal'];

export const POSITIONS = [
  'HR Specialist',
  'Operations Staff',
  'Customer Service Representative',
  'Warehouse Staff',
  'Team Leader',
  'Operations Manager',
];

export const EMPLOYMENT_TYPES = ['Full-time', 'Part-time', 'Contract'];

export const EMPLOYMENT_STATUSES = ['Active', 'Inactive', 'On Leave'];

export const LEAVE_TYPES = ['Vacation', 'Sick', 'Emergency', 'Special'];

export const LEAVE_STATUSES = ['Pending', 'Approved', 'Rejected'];

export const SHIFT_TYPES = ['Morning', 'Afternoon', 'Night', 'Flexible'];

export const ATTENDANCE_STATUSES = ['Present', 'Absent', 'Late', 'Half Day', 'Early Leave', 'On Leave'];

export const EARLY_CLOCKOUT_REASON_OPTIONS = [
  { value: 'SICK', label: 'Feeling Unwell' },
  { value: 'FAMILY_EMERGENCY', label: 'Family Emergency' },
  { value: 'PERSONAL_EMERGENCY', label: 'Personal Emergency' },
  // 'Approved Leave' is no longer offered: it cannot be verified at the kiosk, so it
  // would only be a free excuse (old records that used it still display below).
  { value: 'OTHER', label: 'Other' },
];

// Where a claim stands on PROOF (a SICK claim needs a medical certificate in time).
export const EARLY_CLOCKOUT_REASON_STATUS_META = {
  CERTIFICATE_REQUIRED: { label: 'Certificate required', variant: 'warning' },
  PROOF_SUBMITTED: { label: 'Proof submitted', variant: 'info' },
  CERTIFICATE_OVERDUE: { label: 'Certificate overdue', variant: 'danger' },
};

export const EARLY_CLOCKOUT_REASON_LABELS = {
  SICK: 'Feeling Unwell',
  FAMILY_EMERGENCY: 'Family Emergency',
  PERSONAL_EMERGENCY: 'Personal Emergency',
  APPROVED_LEAVE: 'Approved Leave',
  OTHER: 'Other',
};

// Classification is decided AFTER the punch: the employee has already left, so
// HR can only decide the payroll consequence of the shortfall.
export const EARLY_CLOCKOUT_CLASSIFICATION_META = {
  PENDING_REVIEW: { label: 'Pending Review', variant: 'warning' },
  EXCUSED_SICK: { label: 'Excused (Sick)', variant: 'success' },
  EXCUSED_EMERGENCY: { label: 'Excused (Emergency)', variant: 'success' },
  EXCUSED_EARLY_LEAVE: { label: 'Excused (Early Leave)', variant: 'info' },
  UNPAID: { label: 'Unpaid', variant: 'danger' },
};

export const EARLY_CLOCKOUT_CLASSIFICATION_OPTIONS = [
  { value: 'EXCUSED_SICK', label: 'Excused (Sick)' },
  { value: 'EXCUSED_EMERGENCY', label: 'Excused (Emergency)' },
  { value: 'EXCUSED_EARLY_LEAVE', label: 'Excused (Early Leave)' },
  { value: 'UNPAID', label: 'Unpaid' },
];

export const TIMESHEET_STATUSES = ['Draft', 'Submitted', 'Approved', 'Rejected'];

export const SIDEBAR_WIDTH = '280px';

export const TOPBAR_HEIGHT = '64px';
