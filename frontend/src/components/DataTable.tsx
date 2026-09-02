// The data table (CONTRACT §5/§6/§7).
//
// @tanstack/react-table drives the column model, column-visibility state and
// multi-column sorting state. The two-level header (group cells spanning their
// sub-columns; standalone columns spanning both header rows), the per-column
// filter row, sort indicators, and search-term highlighting are rendered on top
// of that model.
import { useMemo } from 'react';
import {
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
  type VisibilityState,
} from '@tanstack/react-table';
import { COLUMN_BY_KEY, COLUMNS, type ColumnMeta, type DataRow } from '../lib/columns';
import { formatValue } from '../lib/format';
import {
  cycleSort,
  sortInfo,
  type Filter,
  type SortItem,
  type TableState,
} from '../lib/tableState';
import ColumnFilter from './ColumnFilter';

interface Props {
  rows: DataRow[];
  state: TableState;
  isHidden: (key: string) => boolean;
  hideColumn: (key: string) => void;
  onSortChange: (sort: SortItem[]) => void;
  onFilterChange: (key: string, filter: Filter) => void;
  loading: boolean;
  // Row selection.
  selectedIds: Set<number>;
  onToggleRow: (id: number, checked: boolean) => void;
  onToggleAllPage: (checked: boolean) => void;
}

// A visible column plus its group, in display order.
interface VisibleCol {
  meta: ColumnMeta;
}

export default function DataTable({
  rows,
  state,
  isHidden,
  hideColumn,
  onSortChange,
  onFilterChange,
  loading,
  selectedIds,
  onToggleRow,
  onToggleAllPage,
}: Props) {
  const pageIds = rows.map((r) => r.id as number);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));
  // Column model for react-table (one leaf column per key).
  const columns = useMemo<ColumnDef<DataRow>[]>(
    () =>
      COLUMNS.map((c) => ({
        id: c.key,
        accessorKey: c.key,
        header: c.label,
      })),
    [],
  );

  const columnVisibility = useMemo<VisibilityState>(() => {
    const v: VisibilityState = {};
    for (const c of COLUMNS) v[c.key] = !isHidden(c.key);
    return v;
  }, [isHidden]);

  const sorting = useMemo<SortingState>(
    () => state.sort.map((s) => ({ id: s.key, desc: s.dir === 'desc' })),
    [state.sort],
  );

  const table = useReactTable({
    data: rows,
    columns,
    state: { columnVisibility, sorting },
    manualSorting: true,
    manualPagination: true,
    getCoreRowModel: getCoreRowModel(),
  });

  // Ordered visible columns (react-table respects the column order & visibility).
  const visibleCols: VisibleCol[] = table
    .getVisibleLeafColumns()
    .map((col) => ({ meta: COLUMN_BY_KEY[col.id] }))
    .filter((v): v is VisibleCol => Boolean(v.meta));

  // Group the visible columns into consecutive runs for the top header row.
  interface HeaderSpan {
    group: string | null;
    cols: ColumnMeta[];
  }
  const spans: HeaderSpan[] = [];
  for (const { meta } of visibleCols) {
    const last = spans[spans.length - 1];
    if (meta.group && last && last.group === meta.group) {
      last.cols.push(meta);
    } else {
      spans.push({ group: meta.group, cols: [meta] });
    }
  }

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          {/* Row 1: group headers span sub-columns; standalone columns span both rows. */}
          <tr className="header-row-groups">
            <th className="th-select" rowSpan={2}>
              <input
                type="checkbox"
                aria-label="Выбрать все на странице"
                title="Выбрать все на странице"
                checked={allPageSelected}
                onChange={(e) => onToggleAllPage(e.target.checked)}
              />
            </th>
            {spans.map((span, i) =>
              span.group ? (
                <th
                  key={`g-${span.group}-${i}`}
                  className="th-group"
                  colSpan={span.cols.length}
                >
                  {span.group}
                </th>
              ) : (
                <th
                  key={`s-${span.cols[0].key}`}
                  className="th-standalone"
                  rowSpan={2}
                >
                  <HeaderLabel
                    meta={span.cols[0]}
                    state={state}
                    onSortChange={onSortChange}
                    hideColumn={hideColumn}
                  />
                </th>
              ),
            )}
          </tr>
          {/* Row 2: sub-labels for grouped columns only. */}
          <tr className="header-row-sub">
            {visibleCols.map(({ meta }) =>
              meta.group ? (
                <th key={`sub-${meta.key}`} className="th-sub">
                  <HeaderLabel
                    meta={meta}
                    state={state}
                    onSortChange={onSortChange}
                    hideColumn={hideColumn}
                  />
                </th>
              ) : null,
            )}
          </tr>
          {/* Row 3: per-column filters. */}
          <tr className="header-row-filters">
            <th className="th-select th-filter" />
            {visibleCols.map(({ meta }) => (
              <th key={`f-${meta.key}`} className="th-filter">
                <ColumnFilter
                  column={meta}
                  filter={state.filters[meta.key]}
                  onChange={(f) => onFilterChange(meta.key, f)}
                />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !loading && (
            <tr>
              <td className="empty-cell" colSpan={visibleCols.length + 1}>
                Нет данных, соответствующих фильтрам.
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const id = row.id as number;
            const checked = selectedIds.has(id);
            return (
              <tr key={id} className={checked ? 'data-row row-selected' : 'data-row'}>
                <td className="cell cell-select">
                  <input
                    type="checkbox"
                    aria-label="Выбрать строку"
                    checked={checked}
                    onChange={(e) => onToggleRow(id, e.target.checked)}
                  />
                </td>
                {visibleCols.map(({ meta }) => (
                  <Cell key={meta.key} meta={meta} row={row} />
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
      {loading && <div className="table-loading-overlay">Загрузка…</div>}
    </div>
  );
}

function HeaderLabel({
  meta,
  state,
  onSortChange,
  hideColumn,
}: {
  meta: ColumnMeta;
  state: TableState;
  onSortChange: (sort: SortItem[]) => void;
  hideColumn: (key: string) => void;
}) {
  const info = sortInfo(state.sort, meta.key);
  return (
    <div className="th-inner">
      <button
        type="button"
        className="th-sort-btn"
        title="Нажмите для сортировки (по возр. → по убыв. → отмена)"
        onClick={() => onSortChange(cycleSort(state.sort, meta.key))}
      >
        <span className="th-label">{meta.label}</span>
        {info && (
          <span className="sort-indicator">
            {info.dir === 'asc' ? '▲' : '▼'}
            {state.sort.length > 1 && <sup className="sort-order">{info.index + 1}</sup>}
          </span>
        )}
      </button>
      <button
        type="button"
        className="th-hide-btn"
        title="Скрыть столбец"
        aria-label="Скрыть столбец"
        onClick={() => hideColumn(meta.key)}
      >
        ×
      </button>
    </div>
  );
}

function Cell({
  meta,
  row,
}: {
  meta: ColumnMeta;
  row: DataRow;
}) {
  const raw = row[meta.key];
  const display = formatValue(raw, meta.type);
  const numeric = meta.type === 'integer';

  return <td className={numeric ? 'cell cell-num' : 'cell'}>{display}</td>;
}
