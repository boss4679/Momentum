// Who is logged in, shared with every component through React context.
//
// status goes 'checking' -> 'authenticated' | 'anonymous'. 'checking' covers the first
// moment after a page load: a token from localStorage might be expired, so the app asks
// GET /auth/me before deciding what to show.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { onUnauthorized } from '../api/client';
import { tokenStore } from './tokenStore';

const AuthContext = createContext(null);

// The browser's timezone ("Europe/London"), sent at sign-up so the server's idea of
// "today" matches the user's.
function browserTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState(tokenStore.get() ? 'checking' : 'anonymous');
  // A message for the login page, e.g. why the user was logged out.
  const [notice, setNotice] = useState(null);

  const startSession = useCallback(({ user: newUser, token }) => {
    tokenStore.set(token);
    setUser(newUser);
    setNotice(null);
    setStatus('authenticated');
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    setUser(null);
    setStatus('anonymous');
  }, []);

  // Any API call rejected with 401 (expired or invalid token) ends the session. This only
  // changes state: <RequireAuth> sees 'anonymous' and does the redirect to /login, saving
  // the current page so login can return there. Having one place that redirects avoids
  // two navigations racing each other.
  useEffect(() => {
    onUnauthorized(() => {
      logout();
      setNotice('Your session has expired. Please log in again.');
    });
  }, [logout]);

  // On first load, check a stored token is still valid. A 401 here goes through the
  // onUnauthorized handler above.
  useEffect(() => {
    if (status !== 'checking') return;
    api.auth
      .me()
      .then(({ user: me }) => {
        setUser(me);
        setStatus('authenticated');
      })
      .catch(() => logout());
  }, [status, logout]);

  const value = useMemo(
    () => ({
      user,
      status,
      notice,
      logout,
      login: async (email, password) => startSession(await api.auth.login({ email, password })),
      register: async (email, password) =>
        startSession(await api.auth.register({ email, password, timezone: browserTimezone() })),
    }),
    [user, status, notice, logout, startSession],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}
