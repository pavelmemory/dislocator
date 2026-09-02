// Auth context: holds the current token + user (login/role), backed by
// localStorage + in-memory state (CONTRACT §3).
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { clearToken, getToken, setToken, TOKEN_KEY } from '../api/client';
import { getMe, type Role } from '../api/endpoints';

interface AuthUser {
  login: string;
  role: Role;
}

interface AuthContextValue {
  token: string | null;
  user: AuthUser | null;
  loading: boolean;
  signIn: (token: string, user: AuthUser) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken());
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(!!getToken());

  // On mount (or when a token is present without a user), resolve who we are.
  useEffect(() => {
    let cancelled = false;
    if (token && !user) {
      setLoading(true);
      getMe()
        .then((me) => {
          if (!cancelled) setUser({ login: me.login, role: me.role });
        })
        .catch(() => {
          if (!cancelled) {
            clearToken();
            setTokenState(null);
            setUser(null);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else {
      setLoading(false);
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Cross-tab sync: react to token changes made in other tabs. When another tab
  // signs out (token removed) or switches account (token changed), reflect it
  // here immediately so this tab does not keep an authenticated view open.
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key !== null && e.key !== TOKEN_KEY) return; // unrelated key
      const current = getToken();
      if (!current) {
        // Logged out elsewhere.
        setTokenState(null);
        setUser(null);
        setLoading(false);
      } else if (current !== token) {
        // Different account signed in elsewhere: re-resolve identity.
        setTokenState(current);
        setUser(null);
        setLoading(true);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [token]);

  const value = useMemo<AuthContextValue>(
    () => ({
      token,
      user,
      loading,
      signIn: (t, u) => {
        setToken(t);
        setTokenState(t);
        setUser(u);
        setLoading(false);
      },
      signOut: () => {
        clearToken();
        setTokenState(null);
        setUser(null);
      },
    }),
    [token, user, loading],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
