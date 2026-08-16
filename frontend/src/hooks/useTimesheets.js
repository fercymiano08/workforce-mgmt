import { useSyncExternalStore } from 'react';
import { timesheetService } from '../services/api';

// This module lives outside the React tree (plain singleton store shared by
// the employee "My Timesheet" page and the HR/Admin timesheet page), so it
// reads the persisted session user directly rather than via useAuth().
// Key must match AuthContext's STORAGE_KEY.
const AUTH_STORAGE_KEY = 'workforce_auth_user';

function currentUser() {
  try {
    const stored = window.sessionStorage.getItem(AUTH_STORAGE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
}

let listeners = new Set();
let snapshot = [];
let loaded = false;
let started = false;

function emit() {
  listeners.forEach((listener) => listener());
}

function subscribe(listener) {
  listeners.add(listener);
  if (!started) {
    started = true;
    refreshTimesheets();
  }
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot() {
  return snapshot;
}

// Session-scoped store so the employee "My Timesheet" page and the
// HR/Admin timesheet page share the same timesheet data within the session.
export function useTimesheets() {
  return useSyncExternalStore(subscribe, getSnapshot);
}

// Returns true once the initial timesheet load has completed.
export function useTimesheetsLoaded() {
  return useSyncExternalStore(subscribe, () => loaded);
}

export async function refreshTimesheets() {
  try {
    // Employees may only list their own timesheets; Admins list everyone's.
    // Mirrors the backend's self-or-admin authorization rule.
    const user = currentUser();
    snapshot = user?.role === 'Administrator'
      ? await timesheetService.getAll()
      : await timesheetService.getByEmployeeId(user?.id);
  } catch {
    snapshot = [];
  }
  loaded = true;
  emit();
  return snapshot;
}

export function submitTimesheet(id) {
  return timesheetService.updateStatus(id, 'Submitted');
}

export function approveTimesheet(id, approvedBy) {
  return timesheetService.updateStatus(id, 'Approved', approvedBy);
}

export function rejectTimesheet(id) {
  return timesheetService.updateStatus(id, 'Rejected');
}
