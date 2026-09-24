// Per-user column layout preferences (visibility, order, widths). NOT part of
// the shareable URL state.
//
// Stored shape: { order: string[], widths: Record<string, number>, hidden: string[] }
// Persistence is server-side (per account) so a user's configured table view
// follows them across browsers and devices; localStorage is kept as an instant
// cache to avoid a flash on load and to work offline. On load the server value
// wins; a local-only config is migrated up to the server the first time.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from './auth';
import { getPreferences, savePreferences } from '../api/endpoints';
import { COLUMNS, COLUMN_BY_KEY, type ColumnMeta } from './columns';

// Key under which the column layout lives inside the server prefs object.
const PREFS_KEY = 'columnLayout';

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

// Validate/normalize an arbitrary object into ColumnPrefs (from any source).
function parsePrefs(parsed: unknown): ColumnPrefs {
  const p = (parsed ?? {}) as Partial<ColumnPrefs>;
  const widths: Record<string, number> = {};
  if (p.widths && typeof p.widths === 'object') {
    for (const [k, v] of Object.entries(p.widths)) {
      if (k in COLUMN_BY_KEY && typeof v === 'number' && v > 0) widths[k] = v;
    }
  }
  const hidden = Array.isArray(p.hidden)
    ? p.hidden.filter((k): k is string => typeof k === 'string' && k in COLUMN_BY_KEY)
    : [];
  return { order: normalizeOrder(p.order), widths, hidden };
}

function defaultPrefs(): ColumnPrefs {
  return { order: [...DEFAULT_ORDER], widths: {}, hidden: [] };
}

function isDefaultPrefs(p: ColumnPrefs): boolean {
  return (
    p.hidden.length === 0 &&
    Object.keys(p.widths).length === 0 &&
    p.order.length === DEFAULT_ORDER.length &&
    p.order.every((k, i) => k === DEFAULT_ORDER[i])
  );
}

function readPrefs(key: string): ColumnPrefs {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return parsePrefs(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return defaultPrefs();
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

  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Push the layout to the server (debounced), merging into the prefs object so
  // future preference kinds can share the same record.
  const scheduleServerSave = useCallback(
    (next: ColumnPrefs) => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        savePreferences({ [PREFS_KEY]: next }).catch(() => {
          /* offline / transient — localStorage still holds the value */
        });
      }, 600);
    },
    [],
  );

  // On login (or user change): show the cached local layout instantly, then load
  // the authoritative server copy. Server wins; if the server has nothing but a
  // local layout exists, migrate the local one up.
  useEffect(() => {
    const local = readPrefs(storageKey(login));
    setPrefs(local);
    if (!login) return;

    let cancelled = false;
    getPreferences()
      .then((obj) => {
        if (cancelled) return;
        const serverLayout = (obj as Record<string, unknown>)[PREFS_KEY];
        if (serverLayout !== undefined && serverLayout !== null) {
          const parsed = parsePrefs(serverLayout);
          setPrefs(parsed);
          writePrefs(storageKey(login), parsed);
        } else if (!isDefaultPrefs(local)) {
          // Server has no saved layout yet but the browser does — migrate it up.
          savePreferences({ [PREFS_KEY]: local }).catch(() => {});
        }
      })
      .catch(() => {
        /* keep the local cache */
      });

    return () => {
      cancelled = true;
    };
  }, [login]);

  const update = useCallback(
    (fn: (prev: ColumnPrefs) => ColumnPrefs) => {
      setPrefs((prev) => {
        const next = fn(prev);
        writePrefs(storageKey(login), next);
        scheduleServerSave(next);
        return next;
      });
    },
    [login, scheduleServerSave],
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

  const isDefaultLayout = isDefaultPrefs(prefs);

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
