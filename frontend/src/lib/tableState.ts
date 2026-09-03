// URL-shareable filter state (CONTRACT §5/§6).
//
// The shareable state — wagon list, mode, date range, page, page_size — is
// encoded in the URL query string using the SAME param names as GET /api/data,
// so the URL query IS the API query. Per-user column layout (order / widths /
// visibility) is deliberately NOT part of this; it lives in localStorage.

export type Mode = 'current' | 'period';

export interface FilterState {
  wagons: string[]; // normalized list of wagon numbers (strings)
  mode: Mode;
  dateFrom: string; // YYYY-MM-DD or ''
  dateTo: string; // YYYY-MM-DD or ''
  page: number;
  pageSize: number;
}

export const PAGE_SIZES = [25, 50, 100, 200] as const;
export const DEFAULT_PAGE_SIZE = 50;

// Split a free-form paste of wagon numbers (spaces, commas, tabs, newlines, any
// combination) into a clean list, dropping empties. Duplicates are kept in the
// order they appear (the backend de-duplicates).
export function parseWagons(raw: string): string[] {
  return raw
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter((v) => v !== '');
}

// --- Parse from URLSearchParams -------------------------------------------

export function parseFilterState(sp: URLSearchParams): FilterState {
  const wagons = parseWagons(sp.get('wagons') ?? '');
  const mode: Mode = sp.get('mode') === 'period' ? 'period' : 'current';
  const dateFrom = sp.get('date_from') ?? '';
  const dateTo = sp.get('date_to') ?? '';

  const page = Math.max(1, Number(sp.get('page')) || 1);
  let pageSize = Number(sp.get('page_size')) || DEFAULT_PAGE_SIZE;
  if (!PAGE_SIZES.includes(pageSize as (typeof PAGE_SIZES)[number])) {
    pageSize = DEFAULT_PAGE_SIZE;
  }

  return { wagons, mode, dateFrom, dateTo, page, pageSize };
}

// --- Serialize to URLSearchParams (shareable URL — omits defaults) --------

export function filterStateToParams(state: FilterState): URLSearchParams {
  const sp = new URLSearchParams();

  if (state.wagons.length) sp.set('wagons', state.wagons.join(','));
  if (state.mode === 'period') {
    sp.set('mode', 'period');
    if (state.dateFrom) sp.set('date_from', state.dateFrom);
    if (state.dateTo) sp.set('date_to', state.dateTo);
  }
  if (state.page !== 1) sp.set('page', String(state.page));
  if (state.pageSize !== DEFAULT_PAGE_SIZE) {
    sp.set('page_size', String(state.pageSize));
  }

  return sp;
}

// Params for the actual API request: always include mode, page & page_size
// explicitly; include the date bounds only in period mode.
export function filterStateToApiParams(state: FilterState): URLSearchParams {
  const sp = new URLSearchParams();
  if (state.wagons.length) sp.set('wagons', state.wagons.join(','));
  sp.set('mode', state.mode);
  if (state.mode === 'period') {
    if (state.dateFrom) sp.set('date_from', state.dateFrom);
    if (state.dateTo) sp.set('date_to', state.dateTo);
  }
  sp.set('page', String(state.page));
  sp.set('page_size', String(state.pageSize));
  return sp;
}

// Params for export: same as the API request but without pagination.
export function filterStateToExportParams(state: FilterState): URLSearchParams {
  const sp = filterStateToApiParams(state);
  sp.delete('page');
  sp.delete('page_size');
  return sp;
}
