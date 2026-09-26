import http from './http';

export const employeeService = {
  getAll: async () => {
    const { data } = await http.get('/employees');
    return data;
  },
  getById: async (id) => {
    const { data } = await http.get(`/employees/${id}`);
    return data;
  },
  create: async (payload) => {
    const { data } = await http.post('/employees', payload);
    return data;
  },
  registerFace: async (id, faceImageDataUrl, faceDescriptor) => {
    const { data } = await http.post(`/employees/${id}/face`, {
      faceImage: faceImageDataUrl,
      faceDescriptor,
    });
    return data;
  },
  update: async (id, payload) => {
    const { data } = await http.put(`/employees/${id}`, payload);
    return data;
  },
  delete: async (id) => {
    const { data } = await http.delete(`/employees/${id}`);
    return data;
  },
};

export const departmentService = {
  getAll: async () => {
    const { data } = await http.get('/departments');
    return data;
  },
};

export const roleService = {
  getAll: async (departmentId) => {
    const params = departmentId ? { department_id: departmentId } : {};
    const { data } = await http.get('/roles', { params });
    return data;
  },
};

export const attendanceService = {
  // params: optional { from: 'YYYY-MM-DD', to: 'YYYY-MM-DD' } window.
  getAll: async (params) => {
    const { data } = await http.get('/attendance', { params });
    return data;
  },
  getById: async (id) => {
    const { data } = await http.get(`/attendance/${id}`);
    return data;
  },
  getByEmployeeId: async (employeeId) => {
    const { data } = await http.get(`/attendance/employee/${employeeId}`);
    return data;
  },
  getByDate: async (date) => {
    const { data } = await http.get(`/attendance/date/${date}`);
    return data;
  },
  create: async (payload) => {
    const { data } = await http.post('/attendance', payload);
    return data;
  },
  update: async (id, payload) => {
    const { data } = await http.put(`/attendance/${id}`, payload);
    return data;
  },
  delete: async (id) => {
    const { data } = await http.delete(`/attendance/${id}`);
    return data;
  },
  checkAlerts: async () => {
    const { data } = await http.get('/attendance/alerts/check');
    return data;
  },
  remindClockOut: async () => {
    const { data } = await http.post('/attendance/remind-clock-out');
    return data;
  },
  getEarlyClockOuts: async () => {
    const { data } = await http.get('/attendance/early-outs');
    return data;
  },
  getEarlyClockOutsByEmployee: async (employeeId) => {
    const { data } = await http.get(`/attendance/early-outs/employee/${employeeId}`);
    return data;
  },
  getEarlyClockOutsPending: async () => {
    const { data } = await http.get('/attendance/early-outs/pending');
    return data;
  },
  updateEarlyClockOutReason: async (id, payload) => {
    const { data } = await http.put(`/attendance/early-outs/${id}/reason`, payload);
    return data;
  },
  classifyEarlyClockOut: async (id, classification, override = false) => {
    const { data } = await http.post(`/attendance/early-outs/${id}/classify`, { classification, override });
    return data;
  },
};

export const auditService = {
  getLogs: async (params = {}) => {
    const response = await http.get('/audit', { params });
    return { data: response.data, meta: response.meta };
  },
};

/**
 * Corrections (Time & Attendance > Corrections) - "the kiosk failed", "I worked past my shift".
 *
 * `create` deliberately takes no hours field. The employee sends what happened (a claimed time, a reason and photo
 * proof) and the server works the arithmetic out from the roster, so there is nothing on the client that could put a
 * number into payroll. Only the Workforce Admin decides, and approving is the manual entry of the final time.
 */
export const adjustmentService = {
  mine: async () => {
    const { data } = await http.get('/attendance/adjustments/mine');
    return data;
  },
  // One of the employee's own requests, with its photos
  mineOne: async (id) => {
    const { data } = await http.get(`/attendance/adjustments/mine/${id}`);
    return data;
  },
  // photos: [{ name, dataUrl, caption }] - already shrunk by the browser
  create: async (payload) => {
    const { data } = await http.post('/attendance/adjustments', payload);
    return data;
  },
  cancel: async (id) => {
    const { data } = await http.post(`/attendance/adjustments/${id}/cancel`);
    return data;
  },
  getAll: async (params = {}) => {
    const { data } = await http.get('/attendance/adjustments', { params });
    return data;
  },
  // one request with its photos and the day as it stands now (admin)
  getById: async (id) => {
    const { data } = await http.get(`/attendance/adjustments/${id}`);
    return data;
  },
  // what an entry of `time` would do, before it is made (admin)
  preview: async (id, time) => {
    const { data } = await http.post(`/attendance/adjustments/${id}/preview`, { time });
    return data;
  },
  // approving IS the manual entry: `time` is the final clock time the admin enters (defaults to the claim)
  decide: async (id, { decision, note, time }) => {
    const { data } = await http.post(`/attendance/adjustments/${id}/decide`, { decision, note, time });
    return data;
  },
};

// The two kinds of correction the employee can raise. The kiosk failure has two sides, so three types in all.
export const ADJUSTMENT_TYPES = [
  {
    value: 'worked_past_shift',
    group: 'past',
    label: 'I worked past my shift',
    short: 'Worked past shift',
    help: 'You stayed after your scheduled end and your clock-out did not fail or was not counted.',
    timeLabel: 'What time did you finish?',
    photoHint: 'e.g. the kiosk error at the entrance, your phone showing the live time, the work you were finishing',
  },
  {
    value: 'kiosk_clock_in',
    group: 'kiosk',
    label: 'The kiosk failed to clock me in',
    short: 'Kiosk failed: clock-in',
    help: 'The kiosk or the internet was down when you arrived, so nothing was recorded.',
    timeLabel: 'What time did you arrive?',
    photoHint: 'e.g. the broken kiosk or its error screen, a picture of you at the entrance, the live time on your phone',
  },
  {
    value: 'kiosk_clock_out',
    group: 'kiosk',
    label: 'The kiosk failed to clock me out',
    short: 'Kiosk failed: clock-out',
    help: 'You clocked in, but the kiosk would not clock you out when you left.',
    timeLabel: 'What time did you leave?',
    photoHint: 'e.g. the kiosk error when you tried to clock out, the live time on your phone or a wall clock',
  },
];

export const ADJUSTMENT_TYPE_LABELS = Object.fromEntries(
  ADJUSTMENT_TYPES.map((t) => [t.value, t.label])
);
export const ADJUSTMENT_TYPE_SHORT = Object.fromEntries(
  ADJUSTMENT_TYPES.map((t) => [t.value, t.short])
);

export const overtimeService = {
  getAll: async () => {
    const { data } = await http.get('/overtime');
    return data;
  },
  getById: async (id) => {
    const { data } = await http.get(`/overtime/${id}`);
    return data;
  },
  getByEmployeeId: async (employeeId) => {
    const { data } = await http.get(`/overtime/employee/${employeeId}`);
    return data;
  },
  create: async (payload) => {
    const { data } = await http.post('/overtime', payload);
    return data;
  },
  updateStatus: async (id, status, approvedBy, approvedHours, comments) => {
    const { data } = await http.patch(`/overtime/${id}/status`, {
      status,
      approvedBy,
      approvedHours,
      comments,
    });
    return data;
  },
  delete: async (id) => {
    const { data } = await http.delete(`/overtime/${id}`);
    return data;
  },
  bulkUpdateStatus: async (ids, status, approvedBy, approvedHours) => {
    const { data } = await http.patch('/overtime/bulk-status', { ids, status, approvedBy, approvedHours });
    return data;
  },
};

export const leaveService = {
  getAll: async () => {
    const { data } = await http.get('/leaves');
    return data;
  },
  getById: async (id) => {
    const { data } = await http.get(`/leaves/${id}`);
    return data;
  },
  getByEmployeeId: async (employeeId) => {
    const { data } = await http.get(`/leaves/employee/${employeeId}`);
    return data;
  },
  getBalances: async (employeeId) => {
    const { data } = await http.get(`/leaves/balances/${employeeId}`);
    return data;
  },
  // What a date range would cost: the working days in it, minus weekends, holidays and days off.
  workingDays: async (employeeId, startDate, endDate) => {
    const { data } = await http.get('/leaves/working-days', { params: { employeeId, startDate, endDate } });
    return data;
  },
  create: async (payload) => {
    const { data } = await http.post('/leaves', payload);
    return data;
  },
  update: async (id, payload) => {
    const { data } = await http.put(`/leaves/${id}`, payload);
    return data;
  },
  updateStatus: async (id, status, approvedBy) => {
    const { data } = await http.patch(`/leaves/${id}/status`, { status, approvedBy });
    return data;
  },
  delete: async (id) => {
    const { data } = await http.delete(`/leaves/${id}`);
    return data;
  },
};

export const shiftService = {
  getAllShifts: async () => {
    const { data } = await http.get('/shifts');
    return data;
  },
  getSchedules: async () => {
    const { data } = await http.get('/shifts/schedules');
    return data;
  },
  getScheduleByEmployeeId: async (employeeId) => {
    const { data } = await http.get(`/shifts/schedules/employee/${employeeId}`);
    return data;
  },
  createSchedule: async (payload) => {
    const { data } = await http.post('/shifts/schedules', payload);
    return data;
  },
  updateSchedule: async (id, payload) => {
    const { data } = await http.put(`/shifts/schedules/${id}`, payload);
    return data;
  },
  deleteSchedule: async (id) => {
    const { data } = await http.delete(`/shifts/schedules/${id}`);
    return data;
  },
  // Automated shift scheduling (admin): the rules build a draft (nothing is saved), HR approves it.
  previewAutomated: async (payload) => {
    const { data } = await http.post('/shifts/automated/preview', payload);
    return data;
  },
  approveAutomated: async (payload) => {
    const { data } = await http.post('/shifts/automated/approve', payload);
    return data;
  },
};

export const timesheetService = {
  getAll: async () => {
    const { data } = await http.get('/timesheets');
    return data;
  },
  getById: async (id) => {
    const { data } = await http.get(`/timesheets/${id}`);
    return data;
  },
  getByEmployeeId: async (employeeId) => {
    const { data } = await http.get(`/timesheets/employee/${employeeId}`);
    return data;
  },
  update: async (id, payload) => {
    const { data } = await http.put(`/timesheets/${id}`, payload);
    return data;
  },
  // status: Submitted (employee) | Approved | Rejected (reason) | Draft = reopen (reason)  (admin)
  updateStatus: async (id, status, approvedBy, reason) => {
    const { data } = await http.patch(`/timesheets/${id}/status`, {
      status,
      ...(approvedBy ? { approvedBy } : {}),
      ...(reason ? { reason } : {}),
    });
    return data;
  },
  // Sends approved timesheets to payroll (each week only once) and returns them.
  exportForPayroll: async (payload = {}) => {
    const { data } = await http.post('/timesheets/payroll-export', payload);
    return data;
  },
  delete: async (id) => {
    const { data } = await http.delete(`/timesheets/${id}`);
    return data;
  },
};

export const notificationService = {
  getAll: async () => {
    const { data } = await http.get('/notifications');
    return data;
  },
  getById: async (id) => {
    const { data } = await http.get(`/notifications/${id}`);
    return data;
  },
  getByEmployeeId: async (employeeId) => {
    const { data } = await http.get(`/notifications/employee/${employeeId}`);
    return data;
  },
  markAsRead: async (id) => {
    const { data } = await http.post(`/notifications/${id}/read`);
    return data;
  },
  markAllAsRead: async () => {
    const { data } = await http.post('/notifications/read-all');
    return data;
  },
  create: async (payload) => {
    const { data } = await http.post('/notifications', payload);
    return data;
  },
  remove: async (id) => {
    const { data } = await http.delete(`/notifications/${id}`);
    return data;
  },
  getUnreadCount: async () => {
    const response = await http.get('/notifications/unread-count');
    return response.count;
  },
};

export const analyticsService = {
  getAttendanceTrend: async () => {
    const { data } = await http.get('/analytics/attendance-trend');
    return data;
  },
  getDepartmentProductivity: async () => {
    const { data } = await http.get('/analytics/department-productivity');
    return data;
  },
  getLeaveTrend: async () => {
    const { data } = await http.get('/analytics/leave-trend');
    return data;
  },
  getOvertimeSummary: async () => {
    const { data } = await http.get('/analytics/overtime-summary');
    return data;
  },
  getPunctualityScore: async () => {
    const { data } = await http.get('/analytics/punctuality-score');
    return data;
  },
  getAll: async () => {
    const { data } = await http.get('/analytics');
    return data;
  },
  getAiInsights: async (fresh = false) => {
    const { data } = await http.get('/analytics/ai/insights', { params: fresh ? { refresh: 1 } : undefined });
    return data;
  },
  runAiAction: async (action, payload = {}) => {
    return http.post('/analytics/ai/actions', { action, ...payload });
  },
};

export const settingsService = {
  get: async () => {
    const { data } = await http.get('/settings');
    return data;
  },
  update: async (payload) => {
    const { data } = await http.put('/settings', payload);
    return data;
  },
};

export const profileService = {
  get: async () => {
    const { data } = await http.get('/profile');
    return data;
  },
  update: async (payload) => {
    const { data } = await http.put('/profile', payload);
    return data;
  },
};

export const authService = {
  // Sent while an employee is really using the system, so their (3-minute idle) login stays alive.
  keepAlive: async () => http.post('/auth/keep-alive'),
  // Password check before exporting data; the server records it in the audit log with the purpose.
  confirmPassword: async (password, purpose) => http.post('/auth/confirm-password', { password, purpose }),
  changePassword: async (payload) => {
    const { data } = await http.post('/auth/change-password', payload);
    return data;
  },
  // Returns the body so the reset screen can count down the SERVER's expiresAt instead of
  // guessing from when the response happened to arrive.
  forgotPassword: async (email) => {
    const { data } = await http.post('/auth/forgot-password', { email });
    return data;
  },
  resetPassword: async ({ email, otp, password, passwordConfirmation }) => {
    return http.post('/auth/reset-password', {
      email,
      otp,
      password,
      password_confirmation: passwordConfirmation,
    });
  },
};
