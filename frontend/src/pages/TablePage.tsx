import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { getData } from '../api/endpoints';
import { apiErrorMessage } from '../api/client';
import { useAuth } from '../lib/auth';
import { useColumnVisibility } from '../lib/columnVisibility';
import {
  activeFilterCount,
  parseTableState,
  tableStateToApiParams,
  tableStateToParams,
  type Filter,
  type SortItem,
  type TableState,
} from '../lib/tableState';
import { exportData, exportSelected, deleteData } from '../api/endpoints';
import DataTable from '../components/DataTable';
import Pagination from '../components/Pagination';
import ColumnsMenu from '../components/ColumnsMenu';
import GearMenu from '../components/GearMenu';

export default function TablePage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [searchParams, setSearchParams] = useSearchParams();
  const { hidden, isHidden, hideColumn, toggleColumn, showAll } = useColumnVisibility();

  // Row selection (by id). Kept in memory, not in the shareable URL; persists
  // across pages so a selection can be accumulated before export/delete.
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [busyAction, setBusyAction] = useState(false);

  // Source of truth for the shareable view = the URL query string.
  const state: TableState = useMemo(
    () => parseTableState(searchParams),
    [searchParams],
  );

  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Write a new TableState back into the URL (same param names as the API).
  const commit = useCallback(
    (next: TableState) => {
      setSearchParams(tableStateToParams(next), { replace: false });
    },
    [setSearchParams],
  );

  const setSort = useCallback(
    (sort: SortItem[]) => commit({ ...state, sort }),
    [commit, state],
  );

  const setFilter = useCallback(
    (key: string, filter: Filter) =>
      // Any filter change resets to page 1.
      commit({ ...state, filters: { ...state.filters, [key]: filter }, page: 1 }),
    [commit, state],
  );

  const clearFilters = useCallback(
    () => commit({ ...state, filters: {}, page: 1 }),
    [commit, state],
  );

  const setPage = useCallback(
    (page: number) => commit({ ...state, page }),
    [commit, state],
  );

  const setPageSize = useCallback(
    (pageSize: number) => commit({ ...state, pageSize, page: 1 }),
    [commit, state],
  );

  // Data query, keyed on the exact API params so URL changes refetch.
  const apiParams = useMemo(() => tableStateToApiParams(state), [state]);
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
    a.download = `Дислокация_${stamp}.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // Export the current filtered/sorted view (all matching rows, no pagination).
  async function onExport() {
    setExporting(true);
    try {
      const params = tableStateToApiParams(state);
      params.delete('page');
      params.delete('page_size');
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

  const clearSelection = useCallback(() => setSelectedIds(new Set()), []);

  async function onExportSelected() {
    if (selectedIds.size === 0) return;
    setBusyAction(true);
    try {
      downloadBlob(await exportSelected([...selectedIds]));
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
        `Удалить выбранные записи (${selectedIds.size})? Действие необратимо.`,
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

  const filterCount = activeFilterCount(state);
  const selectedCount = selectedIds.size;

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-title">
          <h1>Дислокатор</h1>
        </div>
        <div className="app-header-right">
          <GearMenu onImported={() => dataQuery.refetch()} />
        </div>
      </header>

      <div className="toolbar">
        <ColumnsMenu
          isHidden={isHidden}
          toggleColumn={toggleColumn}
          showAll={showAll}
          hiddenCount={hidden.size}
        />
        <button
          type="button"
          className="btn"
          onClick={clearFilters}
          disabled={filterCount === 0}
        >
          Сбросить фильтры{filterCount > 0 ? ` (${filterCount})` : ''}
        </button>
        <button type="button" className="btn" onClick={shareLink}>
          {copied ? 'Ссылка скопирована' : 'Поделиться ссылкой'}
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onExport}
          disabled={exporting || total === 0}
          title="Экспортировать текущую выборку в XLSX"
        >
          {exporting ? 'Экспорт…' : 'Экспорт в XLSX'}
        </button>
        {selectedCount > 0 && (
          <>
            <button
              type="button"
              className="btn"
              onClick={onExportSelected}
              disabled={busyAction}
              title="Экспортировать выбранные записи в XLSX"
            >
              Экспорт выбранных ({selectedCount})
            </button>
            {isAdmin && (
              <button
                type="button"
                className="btn btn-danger"
                onClick={onDeleteSelected}
                disabled={busyAction}
                title="Удалить выбранные записи"
              >
                Удалить выбранные ({selectedCount})
              </button>
            )}
            <button type="button" className="btn btn-sm" onClick={clearSelection}>
              Снять выделение
            </button>
          </>
        )}
        <div className="toolbar-spacer" />
        {dataQuery.isFetching && <span className="fetching">Обновление…</span>}
      </div>

      {dataQuery.isError && (
        <div className="alert alert-error">
          {apiErrorMessage(dataQuery.error, 'Не удалось загрузить данные')}
        </div>
      )}

      <DataTable
        rows={rows}
        state={state}
        isHidden={isHidden}
        hideColumn={hideColumn}
        onSortChange={setSort}
        onFilterChange={setFilter}
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
