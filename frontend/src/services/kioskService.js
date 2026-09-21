import http, { KIOSK_TOKEN_KEY } from './http';
import { toDateKey } from './attendanceService';
import { nowInTimezone } from '../utils/helpers';

// Kiosk Mode persistence layer.
//
// The source of truth is the backend `settings.kiosk` section (configuration,
// secret PIN hash, and activity logs), so the entrance device behaves the same
// across reloads and is not tied to browser-local storage. A cache keeps the
// synchronous getters fast; it is mirrored to localStorage so that a kiosk
// restart (full browser close/reboot) boots straight into the clock-in/out
// terminal with the previously known settings, instead of flashing the
// "Clock-Ins Disabled" screen until the server responds.

const DEFAULT_SETTINGS = {
  location: 'Main Entrance',
  deviceName: 'Front Door Kiosk',
  timezone: 'Asia/Manila',
  active: false,
  enabledAt: null,
  hasPin: false,
};

const SETTINGS_KEY = 'kiosk_settings_cache';

// The kiosk PIN is a once-a-day security gate. Entering it makes the server issue a
// signed device token (valid until midnight kiosk time, void as soon as the PIN changes), which is stored in
// localStorage so the terminal stays unlocked across a tab close or reboot. The server -
// not this browser flag - enforces it: every clock-in call needs that token.

function readStorage(key) {
  try { return window.localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key, value) {
  try { window.localStorage.setItem(key, value); } catch { /* ignore */ }
}

function removeStorage(key) {
  try { window.localStorage.removeItem(key); } catch { /* ignore */ }
}

function loadCachedSettings() {
  try {
    const raw = readStorage(SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      // (the activity log is no longer part of the public config; drop any copy an older version cached)
      delete parsed.logs;
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch { /* corrupted cache - fall through to defaults */ }
  return { ...DEFAULT_SETTINGS };
}

let cache = loadCachedSettings();

function merge(next) {
  cache = { ...cache, ...next };
  writeStorage(SETTINGS_KEY, JSON.stringify(cache));
  return { ...cache };
}

export const kioskService = {
  getSettings() {
    return { ...cache };
  },

  // "Now" as a date whose fields read the kiosk's wall clock, and today's key (YYYY-MM-DD) in that time zone,
  // so every page agrees with the server about which day it is whatever the browser's own clock says.
  now() {
    return nowInTimezone(cache.timezone || 'Asia/Manila');
  },

  today() {
    return toDateKey(this.now());
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

  // Administrator only: the activity log (names and clock times are not public).
  async loadLogs() {
    const { data } = await http.get('/kiosk/logs');
    return data || [];
  },

  // Administrator only: today's numbers, who is still to clock in, and what is not ready yet.
  async loadOverview() {
    const { data } = await http.get('/kiosk/overview');
    return data;
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
    try {
      const { token, expiresAt } = JSON.parse(readStorage(KIOSK_TOKEN_KEY) || '{}');
      return Boolean(token) && Number(expiresAt) * 1000 > Date.now();
    } catch {
      return false;
    }
  },

  // When this device's unlock ends (Unix seconds), or null when it is not unlocked.
  sessionEndsAt() {
    try {
      const { token, expiresAt } = JSON.parse(readStorage(KIOSK_TOKEN_KEY) || '{}');
      return token && Number(expiresAt) * 1000 > Date.now() ? Number(expiresAt) : null;
    } catch {
      return null;
    }
  },

  storeDeviceToken(token, expiresAt) {
    if (token && expiresAt) {
      writeStorage(KIOSK_TOKEN_KEY, JSON.stringify({ token, expiresAt }));
    }
  },

  clearUnlocked() {
    removeStorage(KIOSK_TOKEN_KEY);
  },

  // Called by an Administrator while enabling the kiosk; the server returns a device
  // token so this very device is unlocked straight away.
  async setPin(pin) {
    const response = await http.post('/kiosk/pin', { pin });
    this.storeDeviceToken(response.token, response.expiresAt);
    return this.load();
  },

  async verifyPin(pin) {
    try {
      const response = await http.post('/kiosk/verify-pin', { pin });
      if (response.ok === true) {
        this.storeDeviceToken(response.token, response.expiresAt);
        return true;
      }
      return false;
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

  // Fallback for ID entry when the local directory snapshot hasn't loaded
  // yet: resolves a single employee by full ID (or bare numeric suffix) and
  // throws if there is no such employee.
  async getEmployee(employeeId) {
    const { data } = await http.get(`/kiosk/employees/${employeeId}`);
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

  // Returns the attendance record plus `earlyLeave` (present only for an early
  // clock-out): whether it counted against the free allowance and what proof is due.
  async clockOut(id, payload) {
    const { data, earlyLeave } = await http.put(`/kiosk/attendance/${id}`, payload);
    return { ...data, earlyLeave: earlyLeave || null };
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
