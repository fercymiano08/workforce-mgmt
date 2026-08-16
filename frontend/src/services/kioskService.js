import http from './http';
import { toDateKey } from './attendanceService';
import { nowInTimezone } from '../utils/helpers';

// Kiosk Mode persistence layer.
//
// The source of truth is the backend `settings.kiosk` section (configuration,
// secret PIN hash, and activity logs), so the entrance device behaves the same
// across reloads and is not tied to browser-local storage. A small in-memory
// cache keeps the synchronous getters fast within a session; every reload
// re-reads from the server.

const MAX_LOGS = 200;

const DEFAULT_SETTINGS = {
  location: 'Main Entrance',
  deviceName: 'Front Door Kiosk',
  timezone: 'Asia/Manila',
  active: false,
  enabledAt: null,
  logs: [],
  hasPin: false,
};

// The kiosk PIN is a one-time-per-24h security gate: once it is entered the
// terminal stays unlocked for a full day, even if the browser tab is closed
// and reopened (localStorage survives tab shutdown on the same device).
const UNLOCK_KEY = 'kiosk_unlock_until';
const UNLOCK_DURATION_MS = 24 * 60 * 60 * 1000;

function readStorage(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
}

function removeStorage(key) {
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}

let cache = { ...DEFAULT_SETTINGS };

function merge(next) {
  cache = { ...cache, ...next };
  return { ...cache };
}

export const kioskService = {
  getSettings() {
    return { ...cache };
  },

  getLogs() {
    return [...(cache.logs || [])];
  },

  // Pulls the backend kiosk config into this session's cache. Works on the
  // public /kiosk page because GET /api/kiosk/config requires no auth token.
  async load() {
    try {
      const { data } = await http.get('/kiosk/config');
      merge(data);
    } catch {
      // backend unreachable - keep whatever this session already knows
    }
    return this.getSettings();
  },

  async updateSettings(data) {
    const { data: next } = await http.post('/kiosk/config', data);
    merge(next);
    return this.getSettings();
  },

  isActive() {
    return cache.active === true;
  },

  hasPin() {
    return cache.hasPin === true;
  },

  isUnlocked() {
    const until = Number(readStorage(UNLOCK_KEY) || 0);
    return until > Date.now();
  },

  markUnlocked() {
    writeStorage(UNLOCK_KEY, String(Date.now() + UNLOCK_DURATION_MS));
  },

  clearUnlocked() {
    removeStorage(UNLOCK_KEY);
  },

  async setPin(pin) {
    await http.post('/kiosk/pin', { pin });
    return this.load();
  },

  async verifyPin(pin) {
    try {
      const response = await http.post('/kiosk/verify-pin', { pin });
      return response.ok === true;
    } catch {
      return false;
    }
  },

  async enableKiosk(pin) {
    await this.setPin(pin);
    const next = await this.updateSettings({
      active: true,
      enabledAt: new Date().toISOString(),
    });
    this.markUnlocked();
    await this.log('mode', `Kiosk mode enabled on "${next.deviceName || 'this device'}"`, {
      detail: `Location: ${next.location}`,
    });
    return next;
  },

  async disableKiosk() {
    const next = await this.updateSettings({ active: false, enabledAt: null });
    this.clearUnlocked();
    await this.log('mode', `Kiosk mode disabled on "${next.deviceName || 'this device'}"`);
    return next;
  },

  async log(type, message, extra = {}) {
    try {
      const { data } = await http.post('/kiosk/log', {
        type,
        message,
        detail: extra.detail || null,
        employeeId: extra.employeeId || null,
      });
      merge({ logs: [data, ...(cache.logs || [])].slice(0, MAX_LOGS) });
      return { ...data };
    } catch {
      return null;
    }
  },

  async resetAll() {
    const { data } = await http.post('/kiosk/reset');
    this.clearUnlocked();
    merge(data);
    return this.getSettings();
  },

  // --- Clock-in terminal data (public, no auth token required) -----------
  // These call kiosk-scoped endpoints rather than the general /employees and
  // /attendance routes, since the terminal is not a logged-in session.

  async getEmployees() {
    const { data } = await http.get('/kiosk/employees');
    return data;
  },

  async getAttendanceByEmployee(employeeId) {
    const { data } = await http.get(`/kiosk/attendance/${employeeId}`);
    return data;
  },

  // Whether this employee is scheduled today (with the shift's start/end).
  // The date is "today" in the kiosk's own timezone (not the device's), so it
  // matches the wall-clock times the kiosk records and the backend enforces.
  async getTodaySchedule(employeeId) {
    const { data } = await http.get(`/kiosk/schedule/${employeeId}`, {
      params: { date: toDateKey(nowInTimezone(this.getSettings()?.timezone || 'Asia/Manila')) },
    });
    return data;
  },

  async clockIn(payload) {
    const { data } = await http.post('/kiosk/attendance', payload);
    return data;
  },

  async clockOut(id, payload) {
    const { data } = await http.put(`/kiosk/attendance/${id}`, payload);
    return data;
  },
};

export const LOG_TYPES = {
  'clock-in': { label: 'Clock In', color: 'text-emerald-600', bg: 'bg-emerald-50' },
  'clock-out': { label: 'Clock Out', color: 'text-amber-600', bg: 'bg-amber-50' },
  mode: { label: 'Mode', color: 'text-blue-600', bg: 'bg-blue-50' },
  pin: { label: 'PIN', color: 'text-purple-600', bg: 'bg-purple-50' },
  security: { label: 'Security', color: 'text-red-600', bg: 'bg-red-50' },
  maintenance: { label: 'Maintenance', color: 'text-gray-600', bg: 'bg-gray-100' },
};

export const TIMEZONES = [
  'Asia/Manila',
  'Asia/Singapore',
  'Asia/Tokyo',
  'Australia/Sydney',
  'America/New_York',
  'America/Chicago',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Paris',
  'UTC',
];
