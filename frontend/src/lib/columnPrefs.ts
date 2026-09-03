// Per-user, per-browser column layout preferences, persisted in localStorage
// (CONTRACT §6/§7). NOT part of the shareable URL state.
//
// Stored shape: { order: string[], widths: Record<string, number>, hidden: string[] }
// The storage key is namespaced by the current user's login so one user's layout
// never affects another signing in on the same browser.
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { COLUMNS, COLUMN_BY_KEY, type ColumnMeta } from './columns';

const PREFIX = 'dislocator.columnPrefs';
export const MIN_COL_WIDTH = 60;

export interface ColumnPrefs {
  order: string[];
  widths: Record<string, number>;
  hidden: string[];
}

const DEFAULT_ORDER: string[] = COLUMNS.map((c) => c.key);

// Sensible default widths: wagon/date columns wider, everything else 130px.
export function defaultWidth(meta: ColumnMeta): number {
  if (meta.type === 'datetime') return 150;
  if (meta.type === 'date') return 120;
  if (meta.key === 'wagon_number') return 110;
  return 130;
}

function storageKey(login: string | null): string {
  return login ? `${PREFIX}.${login}` : PREFIX;
}

// Reconcile a stored order with the current column set: keep known keys in their
// saved order, then append any columns.json keys the saved order is missing.
function normalizeOrder(saved: unknown): string[] {
  const savedArr = Array.isArray(saved)
    ? saved.filter((k): k is string => typeof k === 'string' && k in COLUMN_BY_KEY)
    : [];
  const seen = new Set(savedArr);
  const result = [...savedArr];
  for (const key of DEFAULT_ORDER) {
    if (!seen.has(key)) result.push(key);
  }
  return result;
}

function readPrefs(key: string): ColumnPrefs {
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ColumnPrefs>;
      const widths: Record<string, number> = {};
      if (parsed.widths && typeof parsed.widths === 'object') {
        for (const [k, v] of Object.entries(parsed.widths)) {
          if (k in COLUMN_BY_KEY && typeof v === 'number' && v > 0) widths[k] = v;
        }
      }
      const hidden = Array.isArray(parsed.hidden)
        ? parsed.hidden.filter((k): k is string => typeof k === 'string' && k in COLUMN_BY_KEY)
        : [];
      return { order: normalizeOrder(parsed.order), widths, hidden };
    }
  } catch {
    /* ignore */
  }
  return { order: [...DEFAULT_ORDER], widths: {}, hidden: [] };
}

function writePrefs(key: string, prefs: ColumnPrefs): void {
  try {
    localStorage.setItem(key, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function useColumnPrefs() {
  const { user } = useAuth();
  const login = user?.login ?? null;

  const [prefs, setPrefs] = useState<ColumnPrefs>(() => readPrefs(storageKey(login)));

  // Reload this user's own saved prefs when the signed-in user changes.
  useEffect(() => {
    setPrefs(readPrefs(storageKey(login)));
  }, [login]);

  const update = useCallback(
    (fn: (prev: ColumnPrefs) => ColumnPrefs) => {
      setPrefs((prev) => {
        const next = fn(prev);
        writePrefs(storageKey(login), next);
        return next;
      });
    },
    [login],
  );

  const hiddenSet = new Set(prefs.hidden);
  const isHidden = useCallback((key: string) => hiddenSet.has(key), [prefs.hidden]);

  // Full ordered column metadata (visible + hidden), in the user's order.
  const orderedColumns: ColumnMeta[] = prefs.order
    .map((k) => COLUMN_BY_KEY[k])
    .filter((m): m is ColumnMeta => Boolean(m));

  // Only the visible columns, in order — what the table renders.
  const visibleColumns: ColumnMeta[] = orderedColumns.filter((m) => !hiddenSet.has(m.key));

  const toggleColumn = useCallback(
    (key: string) =>
      update((prev) => {
        const set = new Set(prev.hidden);
        if (set.has(key)) set.delete(key);
        else set.add(key);
        return { ...prev, hidden: [...set] };
      }),
    [update],
  );

  const showAll = useCallback(
    () => update((prev) => ({ ...prev, hidden: [] })),
    [update],
  );

  const setOrder = useCallback(
    (order: string[]) => update((prev) => ({ ...prev, order: normalizeOrder(order) })),
    [update],
  );

  // Move column `fromKey` so it lands at the position of `toKey` (in full order,
  // hidden columns keep their relative slots).
  const moveColumn = useCallback(
    (fromKey: string, toKey: string) => {
      if (fromKey === toKey) return;
      update((prev) => {
        const order = [...prev.order];
        const fromIdx = order.indexOf(fromKey);
        const toIdx = order.indexOf(toKey);
        if (fromIdx === -1 || toIdx === -1) return prev;
        order.splice(fromIdx, 1);
        const insertAt = order.indexOf(toKey) + (toIdx > fromIdx ? 1 : 0);
        order.splice(insertAt, 0, fromKey);
        return { ...prev, order };
      });
    },
    [update],
  );

  const setWidth = useCallback(
    (key: string, width: number) =>
      update((prev) => ({
        ...prev,
        widths: { ...prev.widths, [key]: Math.max(MIN_COL_WIDTH, Math.round(width)) },
      })),
    [update],
  );

  const widthOf = useCallback(
    (meta: ColumnMeta) => prefs.widths[meta.key] ?? defaultWidth(meta),
    [prefs.widths],
  );

  const resetLayout = useCallback(
    () => update(() => ({ order: [...DEFAULT_ORDER], widths: {}, hidden: [] })),
    [update],
  );

  const isDefaultLayout =
    prefs.hidden.length === 0 &&
    Object.keys(prefs.widths).length === 0 &&
    prefs.order.length === DEFAULT_ORDER.length &&
    prefs.order.every((k, i) => k === DEFAULT_ORDER[i]);

  return {
    orderedColumns,
    visibleColumns,
    hiddenCount: prefs.hidden.length,
    isHidden,
    toggleColumn,
    showAll,
    setOrder,
    moveColumn,
    setWidth,
    widthOf,
    resetLayout,
    isDefaultLayout,
  };
}
