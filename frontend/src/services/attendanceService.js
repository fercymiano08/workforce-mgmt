import { generateId } from '../utils/helpers';
import { ATTENDANCE_CONFIG } from '../utils/attendanceConfig';

export function toDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function toTimeString(date = new Date()) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

export function minutesFromTime(timeStr) {
  if (!timeStr) return 0;
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + (minutes || 0);
}

export function roundHours(value) {
  return Math.round(value * 100) / 100;
}

export function formatHours(value) {
  if (!value) return '0';
  return roundHours(value).toString();
}

export function calculateAttendanceStatus(clockInTime, config = ATTENDANCE_CONFIG) {
  const start = minutesFromTime(config.startTime);
  const threshold = start + config.gracePeriodMinutes;
  return minutesFromTime(clockInTime) <= threshold ? 'Present' : 'Late';
}

// The unpaid lunch break (12:00 - 1:00 PM) is only deducted when the worked
// period actually overlaps the lunch window.
export function calculateLunchBreakMinutes(clockIn, clockOut, config = ATTENDANCE_CONFIG) {
  if (!clockIn || !clockOut) return 0;
  const clockInMin = minutesFromTime(clockIn);
  const clockOutMin = minutesFromTime(clockOut);
  const lunchStart = minutesFromTime(config.lunchStartTime);
  const lunchEnd = minutesFromTime(config.lunchEndTime);
  if (clockInMin >= lunchEnd || clockOutMin <= lunchStart) return 0;
  return lunchEnd - lunchStart;
}

// Total worked hours = time between clock in and clock out, excluding the
// 1-hour unpaid lunch break.
export function calculateWorkingHours(clockIn, clockOut, config = ATTENDANCE_CONFIG) {
  if (!clockIn || !clockOut) return 0;
  const elapsedMinutes = Math.max(0, minutesFromTime(clockOut) - minutesFromTime(clockIn));
  const lunchMinutes = calculateLunchBreakMinutes(clockIn, clockOut, config);
  return Math.max(0, elapsedMinutes - lunchMinutes) / 60;
}

// Overtime = time worked beyond the official end of shift (5:00 PM). Clocking
// out at or before 5:00 PM yields zero overtime.
export function calculateOvertime(clockIn, clockOut, config = ATTENDANCE_CONFIG) {
  if (!clockIn || !clockOut) return 0;
  const endMinutes = minutesFromTime(config.endTime);
  return Math.max(0, minutesFromTime(clockOut) - endMinutes) / 60;
}

export function calculateRegularHours(clockIn, clockOut, config = ATTENDANCE_CONFIG) {
  if (!clockIn || !clockOut) return 0;
  return Math.max(0, calculateWorkingHours(clockIn, clockOut, config) - calculateOvertime(clockIn, clockOut, config));
}

export function calculateBreakHours(clockIn, clockOut, config = ATTENDANCE_CONFIG) {
  if (!clockIn || !clockOut) return 0;
  return calculateLunchBreakMinutes(clockIn, clockOut, config) / 60;
}

// Computed once at clock-out so regular, overtime, and total hours stay
// consistent across attendance history and timesheets.
export function calculateTimesheetFields(clockIn, clockOut, config = ATTENDANCE_CONFIG) {
  const overtimeHours = calculateOvertime(clockIn, clockOut, config);
  const totalHours = calculateWorkingHours(clockIn, clockOut, config);
  const regularHours = Math.max(0, totalHours - overtimeHours);
  return {
    regularHours: roundHours(regularHours),
    overtimeHours: roundHours(overtimeHours),
    totalHours: roundHours(totalHours),
    breakHours: roundHours(calculateBreakHours(clockIn, clockOut, config)),
  };
}

export function createAttendanceRecord({ employeeId, now = new Date(), config = ATTENDANCE_CONFIG }) {
  const clockIn = toTimeString(now);
  return {
    id: `ATT-${generateId()}`,
    employeeId,
    date: toDateKey(now),
    clockIn,
    clockOut: null,
    status: calculateAttendanceStatus(clockIn, config),
    regularHours: 0,
    overtime: 0,
    totalHours: 0,
    breakHours: 0,
    location: config.location,
    notes: '',
  };
}
