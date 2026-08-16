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
  getAll: async () => {
    const { data } = await http.get('/attendance');
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
};

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
  generateSchedule: async (payload) => {
    const { data } = await http.post('/shifts/schedules/generate', payload);
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
  create: async (payload) => {
    const { data } = await http.post('/timesheets', payload);
    return data;
  },
  update: async (id, payload) => {
    const { data } = await http.put(`/timesheets/${id}`, payload);
    return data;
  },
  updateStatus: async (id, status, approvedBy) => {
    const { data } = await http.patch(`/timesheets/${id}/status`, { status, ...(approvedBy ? { approvedBy } : {}) });
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
  getPayrollDiscrepancy: async () => {
    const { data } = await http.get('/analytics/payroll-discrepancy');
    return data;
  },
  getAll: async () => {
    const { data } = await http.get('/analytics');
    return data;
  },
  getAiInsights: async () => {
    const { data } = await http.get('/analytics/ai/insights');
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
  changePassword: async (payload) => {
    const { data } = await http.post('/auth/change-password', payload);
    return data;
  },
  forgotPassword: async (email) => {
    return http.post('/auth/forgot-password', { email });
  },
  resetPassword: async ({ email, token, password, passwordConfirmation }) => {
    return http.post('/auth/reset-password', {
      email,
      token,
      password,
      password_confirmation: passwordConfirmation,
    });
  },
};
