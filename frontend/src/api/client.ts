// Axios client. Adds Authorization: Bearer <token> to every request and, on any
// 401, clears the stored token and redirects to /login (CONTRACT §3).
import axios from 'axios';

export const API_BASE: string =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api';

// Storage key for the JWT. Exported so the auth layer can watch it for
// cross-tab logout via the `storage` event.
export const TOKEN_KEY = 'dislocator.token';

// The token is read fresh from localStorage on every request (localStorage is
// the single source of truth). This is what makes cross-tab logout work: once
// another tab clears the token, this tab's next backend request carries no
// Authorization header, gets a 401, and is redirected to /login.
export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore storage errors */
  }
}

export function clearToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export const api = axios.create({
  baseURL: API_BASE,
});

api.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers = config.headers ?? {};
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error?.response?.status === 401) {
      clearToken();
      // Avoid redirect loop when already on the login page.
      if (!window.location.pathname.startsWith('/login')) {
        window.location.assign('/login');
      }
    }
    return Promise.reject(error);
  },
);

// Extract a human-readable message from an axios error ({ error: "..." }).
export function apiErrorMessage(err: unknown, fallback = 'Сталася помилка'): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { error?: string } | undefined;
    if (data?.error) return data.error;
    if (err.message) return err.message;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}
