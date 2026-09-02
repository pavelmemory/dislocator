// Per-user, per-browser column visibility, persisted in localStorage
// (CONTRACT §6/§7). NOT part of the shareable URL state.
//
// The storage key is namespaced by the current user's login so that one user's
// hidden-column choices never affect another user signing in on the same
// browser.
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';

const PREFIX = 'dislocator.hiddenColumns';

function storageKey(login: string | null): string {
  return login ? `${PREFIX}.${login}` : PREFIX;
}

function readHidden(key: string): string[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((x) => typeof x === 'string');
  } catch {
    /* ignore */
  }
  return [];
}

function writeHidden(key: string, keys: string[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(keys));
  } catch {
    /* ignore */
  }
}

export function useColumnVisibility() {
  const { user } = useAuth();
  const login = user?.login ?? null;

  const [hidden, setHidden] = useState<Set<string>>(
    () => new Set(readHidden(storageKey(login))),
  );

  // When the signed-in user changes, load that user's own saved set.
  useEffect(() => {
    setHidden(new Set(readHidden(storageKey(login))));
  }, [login]);

  // Persist synchronously on each mutation, always under the current user's key.
  const persist = useCallback(
    (next: Set<string>) => {
      writeHidden(storageKey(login), [...next]);
      return next;
    },
    [login],
  );

  const isHidden = useCallback((key: string) => hidden.has(key), [hidden]);

  const hideColumn = useCallback(
    (key: string) =>
      setHidden((prev) => {
        const next = new Set(prev);
        next.add(key);
        return persist(next);
      }),
    [persist],
  );

  const showColumn = useCallback(
    (key: string) =>
      setHidden((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return persist(next);
      }),
    [persist],
  );

  const toggleColumn = useCallback(
    (key: string) =>
      setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return persist(next);
      }),
    [persist],
  );

  const showAll = useCallback(() => setHidden(persist(new Set())), [persist]);

  return { hidden, isHidden, hideColumn, showColumn, toggleColumn, showAll };
}
