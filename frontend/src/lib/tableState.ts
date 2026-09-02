// URL-shareable table state (CONTRACT §5/§6).
//
// The shareable state — column filters, sort spec, page, page_size — is encoded
// in the URL query string using the SAME param names as GET /api/data, so the
// URL query IS the API query. Column visibility is deliberately NOT part of this
// (it lives in localStorage).
import { COLUMN_BY_KEY, COLUMNS } from './columns';

export type SortDir = 'asc' | 'desc';
export interface SortItem {
  key: string;
  dir: SortDir;
}

export interface MultiFilter {
  kind: 'multi';
  values: string[];
}
export interface RangeFilter {
  kind: 'range';
  single: string; // YYYY-MM-DD, exclusive with from/to
  from: string;
  to: string;
}
export type Filter = MultiFilter | RangeFilter;

export interface TableState {
  filters: Record<string, Filter>;
  sort: SortItem[];
  page: number;
  pageSize: number;
}

export const PAGE_SIZES = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;

export function emptyFilterFor(key: string): Filter {
  const meta = COLUMN_BY_KEY[key];
  if (meta && meta.search === 'range') {
    return { kind: 'range', single: '', from: '', to: '' };
  }
  return { kind: 'multi', values: [] };
}

function filterIsActive(f: Filter): boolean {
  if (f.kind === 'multi') return f.values.some((v) => v.trim() !== '');
  return f.single !== '' || f.from !== '' || f.to !== '';
}

// --- Parse from URLSearchParams -------------------------------------------

export function parseTableState(sp: URLSearchParams): TableState {
  const filters: Record<string, Filter> = {};

  for (const col of COLUMNS) {
    if (col.search === 'multi') {
      const raw = sp.get(`f_${col.key}`);
      if (raw !== null && raw !== '') {
        const values = raw
          .split(',')
          .map((v) => v.trim())
          .filter((v) => v !== '');
        if (values.length) filters[col.key] = { kind: 'multi', values };
      }
    } else {
      const single = sp.get(`f_${col.key}`) ?? '';
      const from = sp.get(`f_${col.key}_from`) ?? '';
      const to = sp.get(`f_${col.key}_to`) ?? '';
      if (single || from || to) {
        filters[col.key] = { kind: 'range', single, from, to };
      }
    }
  }

  const sort: SortItem[] = [];
  const sortRaw = sp.get('sort');
  if (sortRaw) {
    for (const part of sortRaw.split(',')) {
      const [key, dir] = part.split(':');
      if (key && COLUMN_BY_KEY[key] && (dir === 'asc' || dir === 'desc')) {
        sort.push({ key, dir });
      }
    }
  }

  const page = Math.max(1, Number(sp.get('page')) || 1);
  let pageSize = Number(sp.get('page_size')) || DEFAULT_PAGE_SIZE;
  if (!PAGE_SIZES.includes(pageSize as (typeof PAGE_SIZES)[number])) {
    pageSize = DEFAULT_PAGE_SIZE;
  }

  return { filters, sort, page, pageSize };
}

// --- Serialize to URLSearchParams (== API query) ---------------------------

export function tableStateToParams(state: TableState): URLSearchParams {
  const sp = new URLSearchParams();

  for (const [key, f] of Object.entries(state.filters)) {
    if (!filterIsActive(f)) continue;
    if (f.kind === 'multi') {
      const values = f.values.map((v) => v.trim()).filter((v) => v !== '');
      if (values.length) sp.set(`f_${key}`, values.join(','));
    } else {
      if (f.single) {
        sp.set(`f_${key}`, f.single);
      } else {
        if (f.from) sp.set(`f_${key}_from`, f.from);
        if (f.to) sp.set(`f_${key}_to`, f.to);
      }
    }
  }

  if (state.sort.length) {
    sp.set('sort', state.sort.map((s) => `${s.key}:${s.dir}`).join(','));
  }

  if (state.page !== 1) sp.set('page', String(state.page));
  if (state.pageSize !== DEFAULT_PAGE_SIZE) {
    sp.set('page_size', String(state.pageSize));
  }

  return sp;
}

// Params for the actual API request: always include page & page_size explicitly.
export function tableStateToApiParams(state: TableState): URLSearchParams {
  const sp = tableStateToParams(state);
  sp.set('page', String(state.page));
  sp.set('page_size', String(state.pageSize));
  return sp;
}

export function activeFilterCount(state: TableState): number {
  return Object.values(state.filters).filter(filterIsActive).length;
}

// Multi-column sort cycle on header click: asc -> desc -> none. New columns are
// appended (they keep their click order), so multiple sorts stay active with a
// visible order index.
export function cycleSort(sort: SortItem[], key: string): SortItem[] {
  const idx = sort.findIndex((s) => s.key === key);
  if (idx === -1) return [...sort, { key, dir: 'asc' }];
  const current = sort[idx];
  if (current.dir === 'asc') {
    const next = [...sort];
    next[idx] = { key, dir: 'desc' };
    return next;
  }
  // desc -> remove
  return sort.filter((s) => s.key !== key);
}

export function sortInfo(
  sort: SortItem[],
  key: string,
): { dir: SortDir; index: number } | null {
  const idx = sort.findIndex((s) => s.key === key);
  if (idx === -1) return null;
  return { dir: sort[idx].dir, index: idx };
}
