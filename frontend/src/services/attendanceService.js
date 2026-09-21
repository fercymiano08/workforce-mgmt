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

