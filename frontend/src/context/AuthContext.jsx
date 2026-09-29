import { createContext, useContext, useState, useCallback, useEffect, useMemo } from 'react';
import http, { setToken, clearToken, getToken, SESSION_ENDED_EVENT } from '../services/http';

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
  // Set when a password was accepted but the account also has two-factor sign-in on, so the login
  // screen knows which account is waiting for a code. Deliberately not persisted: a half-finished
  // sign-in should not survive a reload, and re-entering the password is the honest way back.
  const [pendingTwoFactor, setPendingTwoFactor] = useState(null);

  // Both the ordinary sign-in and the one that finishes with a code end here, so the stored user and
  // the token can never end up out of step with each other.
  const completeSignIn = useCallback((response) => {
    // An employee's login carries a timeout (seconds of inactivity); the idle guard reads it from the user.
    const sessionUser = { ...response.user, sessionTimeoutSeconds: response.sessionTimeoutSeconds ?? null };
    setToken(response.token);
    setUser(sessionUser);
    setAuthError(null);
    setPendingTwoFactor(null);
    try {
      store()?.setItem(STORAGE_KEY, JSON.stringify(sessionUser));
    } catch {
      // ignore write errors (private browsing, etc.)
    }
    return { success: true, user: sessionUser };
  }, []);

  const login = useCallback(async (email, password) => {
    try {
      const response = await http.post('/auth/login', { email, password });

      // The password was right, but this account needs a code as well. No token was issued, so there
      // is nothing to store yet - hand the screen back and let it ask for the code.
      if (response?.requiresTwoFactor) {
        setAuthError(null);
        setPendingTwoFactor({ email: response.email || email, expiresIn: response.expiresIn ?? 180 });
        return { success: false, requiresTwoFactor: true, email: response.email || email, expiresIn: response.expiresIn ?? 180 };
      }

      return completeSignIn(response);
    } catch (error) {
      if (error.response?.status === 429) {
        const wait = error.response?.data?.retry_after ?? 60;
        const message = error.response?.data?.message
          || `Too many login attempts. Please try again in ${wait} seconds.`;
        setAuthError(message);
        return { success: false, message, lockout: true, retryAfter: wait };
      }
      // No response at all means the request never got an answer: the free host is asleep and
      // still waking up, the request timed out, or the connection dropped. Saying "invalid email
      // or password" here is simply wrong - it sends people hunting for a typo that is not there,
      // and burns their five attempts on an outage. The other failures still read as credentials.
      if (!error.response) {
        const message = 'Cannot reach the server right now. It may be waking up - please try again in a moment.';
        setAuthError(message);
        return { success: false, message, offline: true };
      }
      if (error.response.status >= 500) {
        const message = 'The server had a problem. Please try again in a moment.';
        setAuthError(message);
        return { success: false, message };
      }
      const message = error.response?.data?.errors?.email?.[0]
        || 'Invalid email or password. Please try again.';
      setAuthError(message);
      return { success: false, message };
    }
  }, [completeSignIn]);

  /**
   * The second sign-in step. Same error handling as login, because from the person's side it is the
   * same event: the code is simply another thing that can be wrong, expired, or unreachable.
   */
  const verifyTwoFactor = useCallback(async (otp) => {
    if (!pendingTwoFactor?.email) {
      const message = 'Your sign-in expired. Please enter your password again.';
      setAuthError(message);
      return { success: false, message };
    }
    try {
      const response = await http.post('/auth/two-factor/verify', { email: pendingTwoFactor.email, otp });
      return completeSignIn(response);
    } catch (error) {
      if (!error.response) {
        const message = 'Cannot reach the server right now. Please try again in a moment.';
        setAuthError(message);
        return { success: false, message, offline: true };
      }
      if (error.response.status === 429) {
        const wait = error.response?.data?.retry_after ?? 60;
        const message = 'Too many attempts. Please sign in again in a moment.';
        setAuthError(message);
        return { success: false, message, lockout: true, retryAfter: wait };
      }
      const message = error.response?.data?.errors?.otp?.[0]
        || 'That code is not right. Please try again.';
      setAuthError(message);
      return { success: false, message };
    }
  }, [pendingTwoFactor, completeSignIn]);

  /** Throw away a half-finished sign-in, e.g. from "use a different account". */
  const cancelTwoFactor = useCallback(() => {
    setPendingTwoFactor(null);
    setAuthError(null);
  }, []);

  /** Turns the second sign-in step on or off. Turning it off must supply the current password. */
  const setTwoFactor = useCallback(async (enabled, password) => {
    const response = await http.post('/auth/two-factor', { enabled, password });
    // The flag is part of the session user, so keep it in step or the profile switch would snap
    // back to its old position on the next render.
    setUser((prev) => (prev ? { ...prev, twoFactorEnabled: !!enabled } : prev));
    try {
      const stored = store()?.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        store()?.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, twoFactorEnabled: !!enabled }));
      }
    } catch {
      // ignore write errors
    }
    return response;
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

  // The server ended the session (the login expired, or was revoked): sign out here too, and let the login
  // page say why. (Being idle for 3 minutes as an employee is reported by the idle guard before this.)
  useEffect(() => {
    const onEnded = () => {
      try { if (!store()?.getItem('workforce_logout_reason')) store()?.setItem('workforce_logout_reason', 'expired'); } catch { /* ignore */ }
      clearToken();
      setUser(null);
      try { store()?.removeItem(STORAGE_KEY); } catch { /* ignore */ }
    };
    window.addEventListener(SESSION_ENDED_EVENT, onEnded);
    return () => window.removeEventListener(SESSION_ENDED_EVENT, onEnded);
  }, []);

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
    verifyTwoFactor,
    cancelTwoFactor,
    pendingTwoFactor,
    setTwoFactor,
    logout,
    authError,
    clearAuthError,
  }), [user, login, verifyTwoFactor, cancelTwoFactor, pendingTwoFactor, setTwoFactor, logout, authError, clearAuthError]);

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
