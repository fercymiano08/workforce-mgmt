import axios from 'axios';

const TOKEN_KEY = 'workforce_auth_token';

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

const http = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const token = read(TOKEN_KEY);
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

http.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      remove(TOKEN_KEY);
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
