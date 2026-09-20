import axios from 'axios';

const TOKEN_KEY = 'workforce_auth_token';

// The entrance device is not a user account. After it enters the kiosk PIN the server
// hands it a signed device token (kept in localStorage so a reboot stays unlocked until
// it expires); it is sent as X-Kiosk-Token on every kiosk call except the two public ones.
export const KIOSK_TOKEN_KEY = 'kiosk_device_token';
export const KIOSK_LOCKED_EVENT = 'kiosk-device-locked';
const KIOSK_OPEN_PATHS = ['/kiosk/config', '/kiosk/verify-pin'];

const store = () => {
  try { return window.sessionStorage; } catch { return null; }
};

const read = (key) => {
  try { return store()?.getItem(key) ?? null; } catch { return null; }
};

const write = (key, value) => {
  try { store()?.setItem(key, value); } catch { /* ignore */ }
};

const remove = (key) => {
  try { store()?.removeItem(key); } catch { /* ignore */ }
};

// Without a timeout a hung service leaves the page spinning until the browser
// gives up (minutes). The servers cut a request off at ~30s, so 45s only
// triggers when a service is truly unresponsive - callers then get an
// ECONNABORTED error to show instead of an endless spinner.
const http = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
  timeout: 45000,
});

// System-wide duplicate guard (the backstop behind the shared <Button> lock).
// While an identical create/update/delete request (same method, URL and body) is
// still in flight, a second copy is NOT sent - the caller simply receives the
// first request's response. So a double click, an Enter-key repeat or a slow
// server can never create two records, whichever screen or control triggered it.
// Reads (GET) are never touched; requests carrying an abort signal or a non-JSON
// body (file uploads) are left alone.
const baseAdapter = axios.getAdapter(axios.defaults.adapter);
const inFlightWrites = new Map();

http.defaults.adapter = (config) => {
  const method = String(config.method || 'get').toLowerCase();
  // No body (e.g. DELETE) is fine; a body that is not a JSON string (FormData / file) is skipped.
  const hasOpaqueBody = config.data != null && typeof config.data !== 'string';
  if (method === 'get' || method === 'head' || config.signal || hasOpaqueBody) {
    return baseAdapter(config);
  }

  const key = `${method} ${config.baseURL || ''}${config.url} ${config.data ?? ''}`;
  const pending = inFlightWrites.get(key);
  if (pending) return pending;

  const request = baseAdapter(config).finally(() => inFlightWrites.delete(key));
  inFlightWrites.set(key, request);
  return request;
};

const readKioskToken = () => {
  try {
    const raw = window.localStorage.getItem(KIOSK_TOKEN_KEY);
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw);
    return token && Number(expiresAt) * 1000 > Date.now() ? token : null;
  } catch { return null; }
};

http.interceptors.request.use((config) => {
  const token = read(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  const url = config.url || '';
  if (url.startsWith('/kiosk/') && !KIOSK_OPEN_PATHS.some((p) => url.startsWith(p))) {
    const kioskToken = readKioskToken();
    if (kioskToken) {
      config.headers['X-Kiosk-Token'] = kioskToken;
    }
  }
  return config;
});

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      if (error.response?.data?.code === 'kiosk_locked') {
        // The device's unlock expired or the PIN changed - not a user-session problem,
        // so leave the signed-in user alone and just send the terminal back to its PIN screen.
        try { window.localStorage.removeItem(KIOSK_TOKEN_KEY); } catch { /* ignore */ }
        window.dispatchEvent(new Event(KIOSK_LOCKED_EVENT));
      } else {
        remove(TOKEN_KEY);
      }
    }
    return Promise.reject(error);
  }
);

export function getToken() {
  return read(TOKEN_KEY);
}

export function setToken(token) {
  write(TOKEN_KEY, token);
}

export function clearToken() {
  remove(TOKEN_KEY);
}

export default http;
