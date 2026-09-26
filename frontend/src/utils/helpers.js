import { format, formatDistanceToNow, parseISO } from 'date-fns';
import { getSystemDateFormat, getSystemTimeFormat } from './appSettings';

export function formatDate(dateStr) {
  if (!dateStr) return '';
  return format(parseISO(dateStr), getSystemDateFormat());
}

export function formatTime(timeStr) {
  if (!timeStr) return '';
  const [hours, minutes] = timeStr.split(':').map(Number);
  if (getSystemTimeFormat() === '24h') {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;
  return `${displayHours}:${String(minutes).padStart(2, '0')} ${period}`;
}

// A Date whose local fields hold the CURRENT wall-clock time in the given
// timezone (e.g. Asia/Manila), regardless of the device's own timezone. Shift
// start/end and clock-in/out times are wall-clock values in the kiosk
// timezone, so "now" must be derived the same way everywhere the kiosk
// compares or stamps times.
// Building an Intl.DateTimeFormat is expensive and the kiosk asks for "now" every second, so keep one per zone.
const zoneFormatters = new Map();

export function nowInTimezone(timezone) {
  let formatter = zoneFormatters.get(timezone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    });
    zoneFormatters.set(timezone, formatter);
  }
  const parts = formatter.formatToParts(new Date());
  const value = (type) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return new Date(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
}

export function approvedOvertimeHours(requests, date) {
  return (requests || [])
    .filter((r) => r.status === 'Approved' && r.date === date)
    .reduce((sum, r) => {
      const hours = Number(r.approvedHours ?? r.expectedHours ?? 0);
      return sum + (Number.isFinite(hours) && hours > 0 ? hours : 0);
    }, 0);
}

export function extendTime(time, hours) {
  if (!time) return time;
  const hoursNum = Number(hours);
  if (!Number.isFinite(hoursNum) || hoursNum <= 0) return time;
  const [h, m] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(m)) return time;
  const total = (h * 60 + m + Math.round(hoursNum * 60)) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function formatCurrency(amount) {
  if (amount === null || amount === undefined) return '₱0.00';
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getInitials(firstName, lastName) {
  const first = firstName ? firstName.charAt(0) : '';
  const last = lastName ? lastName.charAt(0) : '';
  return `${first}${last}`.toUpperCase();
}

export function generateId() {
  return Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
}

export function getRelativeTime(dateStr) {
  if (!dateStr) return '';
  const date = parseISO(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMinutes = Math.floor(diffMs / (1000 * 60));

  if (diffMinutes < 1) return 'Just now';
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes > 1 ? 's' : ''} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;

  return formatDistanceToNow(date, { addSuffix: true });
}
