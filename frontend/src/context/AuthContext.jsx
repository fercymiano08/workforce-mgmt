import { createContext, useContext, useState, useCallback } from 'react';
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

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isAdmin: user?.role === 'Administrator',
        isEmployee: user?.role === 'Employee',
        login,
        logout,
        authError,
        clearAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
