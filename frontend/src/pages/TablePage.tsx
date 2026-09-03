import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getData } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../lib/auth';
import { useColumnPrefs } from '../lib/columnPrefs';
import {
  parseFilterState,
  filterStateToApiParams,
  filterStateToParams,
  filterStateToExportParams,
  type FilterState,
  type Mode,
} from '../lib/tableState';
import { exportData, exportSelected, deleteData } from '../api/endpoints';
import DataTable from '../components/DataTable';
import FilterForm from '../components/FilterForm';
import Pagination from '../components/Pagination';
import ColumnsMenu from '../components/ColumnsMenu';
import GearMenu from '../components/GearMenu';

export default function TablePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    orderedColumns,
    visibleColumns,
    hiddenCount,
    isHidden,
    toggleColumn,
    showAll,
    moveColumn,
    setWidth,
    widthOf,
    resetLayout,
    isDefaultLayout,
  } = useColumnPrefs();

  // Row selection (by id). Kept in memory, not in the shareable URL; persists
  // across pages so a selection can be accumulated before export/delete.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [busyAction, setBusyAction] = useState(false);
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Source of truth for the shareable view = the URL query string.
  const state: FilterState = useMemo(
    () => parseFilterState(searchParams),
    [searchParams],
  );

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  // Write a new FilterState back into the URL (same param names as the API).
  const commit = useCallback(
    (next: FilterState) => {
      setSearchParams(filterStateToParams(next), { replace: false });
    },
    [setSearchParams],
  );

  // Apply the filter form: reset to page 1 and clear the current selection.
  const applyFilter = useCallback(
    (f: { wagons: string[]; mode: Mode; dateFrom: string; dateTo: string }) => {
      clearSelection();
      commit({ ...state, ...f, page: 1 });
    },
    [clearSelection, commit, state],
  );

  const clearFilter = useCallback(() => {
    clearSelection();
    commit({
      wagons: [],
      mode: 'current',
      dateFrom: '',
      dateTo: '',
      page: 1,
      pageSize: state.pageSize,
    });
  }, [clearSelection, commit, state.pageSize]);

  const setPage = useCallback(
    (page: number) => commit({ ...state, page }),
    [commit, state],
  );

  const setPageSize = useCallback(
    (pageSize: number) => commit({ ...state, pageSize, page: 1 }),
    [commit, state],
  );

  // Data query, keyed on the exact API params so URL changes refetch.
  const apiParams = useMemo(() => filterStateToApiParams(state), [state]);
  const apiParamsKey = apiParams.toString();

  const dataQuery = useQuery({
    queryKey: ['data', apiParamsKey],
    queryFn: () => getData(new URLSearchParams(apiParamsKey)),
    placeholderData: keepPreviousData,
  });

  const rows = dataQuery.data?.rows ?? [];
  const total = dataQuery.data?.total ?? 0;

  async function shareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  function downloadBlob(blob: Blob) {
    const url = URL.createObjectURL(blob);
    const stamp = new Date()
      .toISOString()
      .slice(0, 16)
      .replace('T', '_')
      .replace(':', '-');
    const a = document.createElement('a');
    a.href = url;
    a.download = `Дислокація_${stamp}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Keys of the currently visible columns — exports include only these.
  const visibleKeys = visibleColumns.map((c) => c.key);

  // Export the current filtered view (all matching rows, no pagination).
  async function onExport() {
    setExporting(true);
    try {
      const params = filterStateToExportParams(state);
      if (visibleKeys.length > 0) params.set('columns', visibleKeys.join(','));
      downloadBlob(await exportData(params));
    } catch {
      /* ignore */
    } finally {
      setExporting(false);
    }
  }

  // --- selection actions ---
  const toggleRow = useCallback((id: number, checked: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const toggleAllPage = useCallback(
    (checked: boolean) => {
      setSelectedIds((prev) => {
        const next = new Set(prev);
        for (const r of rows) {
          const id = r.id as number;
          if (checked) next.add(id);
          else next.delete(id);
        }
        return next;
      });
    },
    [rows],
  );

  async function onExportSelected() {
    if (selectedIds.size === 0) return;
    setBusyAction(true);
    try {
      downloadBlob(await exportSelected([...selectedIds], visibleKeys));
    } catch {
      /* ignore */
    } finally {
      setBusyAction(false);
    }
  }

  async function onDeleteSelected() {
    if (selectedIds.size === 0) return;
    if (
      !window.confirm(
        `Видалити вибрані записи (${selectedIds.size})? Дію не можна скасувати.`,
      )
    ) {
      return;
    }
    setBusyAction(true);
    try {
      await deleteData([...selectedIds]);
      clearSelection();
      await dataQuery.refetch();
    } catch {
      /* ignore */
    } finally {
      setBusyAction(false);
    }
  }

  const selectedCount = selectedIds.size;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>Дислокація вагонів</h1>
        </div>
        <div className="app-header-right">
          <GearMenu onImported={() => dataQuery.refetch()} />
        </div>
      </header>

      <FilterForm state={state} onApply={applyFilter} onClear={clearFilter} />

      <div className="toolbar">
        <ColumnsMenu
          columns={orderedColumns}
          isHidden={isHidden}
          toggleColumn={toggleColumn}
          showAll={showAll}
          resetLayout={resetLayout}
          hiddenCount={hiddenCount}
          isDefaultLayout={isDefaultLayout}
        />
        <button type="button" className="btn" onClick={shareLink}>
          {copied ? 'Посилання скопійовано' : 'Поділитися посиланням'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onExport}
          disabled={exporting || total === 0}
          title="Експортувати поточну вибірку у XLSX"
        >
          {exporting ? 'Експорт…' : 'Експорт у XLSX'}
        </button>
        {selectedCount > 0 && (
          <>
            <button
              type="button"
              className="btn"
              onClick={onExportSelected}
              disabled={busyAction}
              title="Експортувати вибрані записи у XLSX"
            >
              Експорт вибраних ({selectedCount})
            </button>
            {isAdmin && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={onDeleteSelected}
                disabled={busyAction}
                title="Видалити вибрані записи"
              >
                Видалити вибрані ({selectedCount})
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={clearSelection}>
              Зняти виділення
            </button>
          </>
        )}
        <div className="toolbar-spacer" />
        {dataQuery.isFetching && <span className="fetching">Оновлення…</span>}
      </div>

      {dataQuery.isError && (
        <div className="alert alert-error">
          {apiErrorMessage(dataQuery.error, 'Не вдалося завантажити дані')}
        </div>
      )}

      <DataTable
        rows={rows}
        visibleCols={visibleColumns}
        widthOf={widthOf}
        onWidthChange={setWidth}
        onMoveColumn={moveColumn}
        hideColumn={toggleColumn}
        loading={dataQuery.isLoading}
        selectedIds={selectedIds}
        onToggleRow={toggleRow}
        onToggleAllPage={toggleAllPage}
      />

      <Pagination
        page={state.page}
        pageSize={state.pageSize}
        total={total}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
      />
    </div>
  );
}
