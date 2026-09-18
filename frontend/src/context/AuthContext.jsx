import { createContext, useContext, useState, useCallback, useMemo } from 'react';
import http, { setToken, clearToken, getToken } from '../services/http';

const STORAGE_KEY = 'workforce_auth_user';

const store = () => {
  try { return window.sessionStorage; } catch { return null; }
};

const AuthContext = createContext(null);

function getInitialUser() {
  try {
    const stored = store()?.getItem(STORAGE_KEY);
    if (!stored) return null;
    const parsed = JSON.parse(stored);
    return getToken() ? { ...parsed } : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getInitialUser);
  const [authError, setAuthError] = useState(null);

  const login = useCallback(async (email, password) => {
    try {
      const response = await http.post('/auth/login', { email, password });
      const sessionUser = response.user;
      setToken(response.token);
      setUser(sessionUser);
      setAuthError(null);
      try {
        store()?.setItem(STORAGE_KEY, JSON.stringify(sessionUser));
      } catch {
        // ignore write errors (private browsing, etc.)
      }
      return { success: true, user: sessionUser };
    } catch (error) {
      if (error.response?.status === 429) {
        const wait = error.response?.data?.retry_after ?? 60;
        const message = error.response?.data?.message
          || `Too many login attempts. Please try again in ${wait} seconds.`;
        setAuthError(message);
        return { success: false, message, lockout: true, retryAfter: wait };
      }
      const message = error.response?.data?.errors?.email?.[0]
        || 'Invalid email or password. Please try again.';
      setAuthError(message);
      return { success: false, message };
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      await http.post('/auth/logout');
    } catch {
      // token may already be invalid; clear local state regardless
    }
    clearToken();
    setUser(null);
    try {
      store()?.removeItem(STORAGE_KEY);
    } catch {
      // ignore write errors
    }
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  // Without this, a brand-new object is passed to the Provider on every
  // render of AuthProvider (from ANY state change anywhere above it in the
  // tree, e.g. the router), which re-renders every single useAuth() consumer
  // in the whole app even when nothing they actually use changed - a classic
  // source of unnecessary re-renders and visible UI flicker.
  const value = useMemo(() => ({
    user,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'Administrator',
    isEmployee: user?.role === 'Employee',
    login,
    logout,
    authError,
    clearAuthError,
  }), [user, login, logout, authError, clearAuthError]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
