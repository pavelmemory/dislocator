// The data table (CONTRACT §5/§6/§7).
//
// Columns are managed manually (no @tanstack/react-table): the visible columns
// arrive already ordered per the user's saved layout. The two-level group header
// is computed as consecutive runs of the same `group` in the current order.
// Leaf headers are draggable (reorder) and carry a resize handle (width). Data
// rows are visually grouped by wagon_number with a half-height grey separator.
import { Fragment, useRef, useState } from 'react';
import { type ColumnMeta, type DataRow } from '../lib/columns';
import { MIN_COL_WIDTH } from '../lib/columnPrefs';
import { formatValue } from '../lib/format';

interface Props {
  rows: DataRow[];
  visibleCols: ColumnMeta[];
  widthOf: (meta: ColumnMeta) => number;
  onWidthChange: (key: string, width: number) => void;
  onMoveColumn: (fromKey: string, toKey: string) => void;
  hideColumn: (key: string) => void;
  loading: boolean;
  // Row selection.
  selectedIds: Set<number>;
  onToggleRow: (id: number, checked: boolean) => void;
  onToggleAllPage: (checked: boolean) => void;
}

const SELECT_COL_WIDTH = 36;

export default function DataTable({
  rows,
  visibleCols,
  widthOf,
  onWidthChange,
  onMoveColumn,
  hideColumn,
  loading,
  selectedIds,
  onToggleRow,
  onToggleAllPage,
}: Props) {
  const pageIds = rows.map((r) => r.id as number);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const wrapRef = useRef<HTMLDivElement>(null);

  // Drag-to-reorder state (which column is being dragged / hovered).
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  // When the user selects a region and copies (Ctrl+C), emit a clean
  // tab-separated block: a header row of the selected columns' names followed by
  // the selected data rows. This keeps headers aligned with the data when pasted
  // into a spreadsheet (the native two-level header would otherwise copy as a
  // misaligned vertical list, and would omit the header labels entirely).
  function handleCopy(e: React.ClipboardEvent) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const wrap = wrapRef.current;
    if (!wrap || !wrap.contains(sel.getRangeAt(0).commonAncestorContainer)) return;

    const bodyRows = Array.from(
      wrap.querySelectorAll<HTMLTableRowElement>('tbody tr.data-row'),
    ).filter((tr) => sel.containsNode(tr, true));
    if (bodyRows.length === 0) return; // header-only selection → leave default

    // Which columns are (partially) selected, as indices into visibleCols.
    const colSel = new Set<number>();
    for (const tr of bodyRows) {
      const tds = tr.querySelectorAll<HTMLTableCellElement>('td.cell:not(.cell-select)');
      tds.forEach((td, i) => {
        if (sel.containsNode(td, true)) colSel.add(i);
      });
    }
    if (colSel.size === 0) return;
    const cols = [...colSel].sort((a, b) => a - b);

    const header = cols.map((i) => visibleCols[i]?.label ?? '').join('\t');
    const lines = bodyRows.map((tr) => {
      const tds = tr.querySelectorAll<HTMLTableCellElement>('td.cell:not(.cell-select)');
      return cols.map((i) => (tds[i]?.textContent ?? '').trim()).join('\t');
    });
    const tsv = [header, ...lines].join('\n');
    e.clipboardData.setData('text/plain', tsv);
    e.preventDefault();
  }

  // Live column resize: while dragging a handle we override that column's width
  // locally so the <col> reflects it immediately; commit on mouseup.
  const [resizing, setResizing] = useState<{ key: string; width: number } | null>(null);
  const resizeRef = useRef<{ key: string; startX: number; startW: number } | null>(null);

  function effectiveWidth(meta: ColumnMeta): number {
    if (resizing && resizing.key === meta.key) return resizing.width;
    return widthOf(meta);
  }

  function startResize(meta: ColumnMeta, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const startW = widthOf(meta);
    resizeRef.current = { key: meta.key, startX: e.clientX, startW };
    setResizing({ key: meta.key, width: startW });

    function onMove(ev: MouseEvent) {
      const r = resizeRef.current;
      if (!r) return;
      const width = Math.max(MIN_COL_WIDTH, r.startW + (ev.clientX - r.startX));
      setResizing({ key: r.key, width });
    }
    function onUp() {
      const r = resizeRef.current;
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      setResizing((cur) => {
        if (r && cur && cur.key === r.key) onWidthChange(r.key, cur.width);
        return null;
      });
      resizeRef.current = null;
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Group the visible columns into consecutive runs for the top header row.
  interface HeaderSpan {
    group: string | null;
    cols: ColumnMeta[];
  }
  const spans: HeaderSpan[] = [];
  for (const meta of visibleCols) {
    const last = spans[spans.length - 1];
    if (meta.group && last && last.group === meta.group) {
      last.cols.push(meta);
    } else {
      spans.push({ group: meta.group, cols: [meta] });
    }
  }

  // Pointer-based column reordering (more reliable than HTML5 drag-and-drop).
  // Press on a header label and drag horizontally over another header to drop.
  function startDrag(meta: ColumnMeta, e: React.MouseEvent) {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (target.closest('.th-resize') || target.closest('.th-hide-btn')) return;
    e.preventDefault();
    const startX = e.clientX;
    let started = false;

    function keyAt(x: number, y: number): string | null {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      const leaf = el?.closest('[data-colkey]') as HTMLElement | null;
      return leaf?.getAttribute('data-colkey') ?? null;
    }

    function onMove(ev: MouseEvent) {
      if (!started) {
        if (Math.abs(ev.clientX - startX) < 4) return;
        started = true;
        setDragKey(meta.key);
        document.body.classList.add('col-dragging');
      }
      const k = keyAt(ev.clientX, ev.clientY);
      setOverKey(k && k !== meta.key ? k : null);
    }
    function onUp(ev: MouseEvent) {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.classList.remove('col-dragging');
      if (started) {
        const k = keyAt(ev.clientX, ev.clientY);
        if (k && k !== meta.key) onMoveColumn(meta.key, k);
      }
      setDragKey(null);
      setOverKey(null);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  function LeafHeader({ meta }: { meta: ColumnMeta }) {
    const cls = [
      'th-leaf',
      dragKey === meta.key ? 'dragging' : '',
      overKey === meta.key && dragKey && dragKey !== meta.key ? 'drop-target' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <div className={cls} data-colkey={meta.key}>
        {/* Dedicated drag grip: reordering happens only from here, so the label
            text stays freely selectable (and copyable with Ctrl+C). */}
        {/* The grip and hide icons are CSS ::before content, not text nodes, so
            they are never included when the user selects/copies the header. */}
        <span
          className="th-drag-handle"
          title="Перетягніть, щоб змінити порядок стовпців"
          aria-label="Перемістити стовпець"
          onMouseDown={(e) => startDrag(meta, e)}
        />
        <span className="th-label">{meta.label}</span>
        <button
          type="button"
          className="th-hide-btn"
          title="Приховати стовпець"
          aria-label="Приховати стовпець"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={() => hideColumn(meta.key)}
        />
        <span
          className="th-resize"
          onMouseDown={(e) => startResize(meta, e)}
          onClick={(e) => e.stopPropagation()}
        />
      </div>
    );
  }

  // Table width = exact sum of column widths, so resizing one column changes
  // only that column (others are never reflowed) and the table does not stretch
  // to fill the container. With all columns visible this exceeds the viewport
  // and scrolls horizontally.
  const totalWidth =
    SELECT_COL_WIDTH + visibleCols.reduce((sum, meta) => sum + effectiveWidth(meta), 0);

  return (
    <div className="table-wrap" ref={wrapRef} onCopy={handleCopy}>
      <table className="data-table compact" style={{ width: totalWidth }}>
        <colgroup>
          <col style={{ width: SELECT_COL_WIDTH }} />
          {visibleCols.map((meta) => (
            <col key={meta.key} style={{ width: effectiveWidth(meta) }} />
          ))}
        </colgroup>
        <thead>
          {/* Row 1: group headers span their sub-columns; standalone columns span both rows. */}
          <tr className="header-row-groups">
            <th className="th-select" rowSpan={2}>
              <input
                type="checkbox"
                aria-label="Вибрати всі на сторінці"
                title="Вибрати всі на сторінці"
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
                <th key={`s-${span.cols[0].key}`} className="th-standalone" rowSpan={2}>
                  <LeafHeader meta={span.cols[0]} />
                </th>
              ),
            )}
          </tr>
          {/* Row 2: sub-labels for grouped columns only. */}
          <tr className="header-row-sub">
            {visibleCols.map((meta) =>
              meta.group ? (
                <th key={`sub-${meta.key}`} className="th-sub">
                  <LeafHeader meta={meta} />
                </th>
              ) : null,
            )}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !loading && (
            <tr>
              <td className="empty-cell" colSpan={visibleCols.length + 1}>
                Немає даних, що відповідають фільтру.
              </td>
            </tr>
          )}
          {rows.map((row, idx) => {
            const id = row.id as number;
            const checked = selectedIds.has(id);
            const wagon = row.wagon_number;
            const prevWagon = idx > 0 ? rows[idx - 1].wagon_number : undefined;
            const showSep = idx > 0 && wagon !== prevWagon;
            return (
              <Fragment key={id}>
                {showSep && (
                  <tr className="group-sep">
                    <td colSpan={visibleCols.length + 1} />
                  </tr>
                )}
                <tr className={checked ? 'data-row row-selected' : 'data-row'}>
                  <td className="cell cell-select">
                    <input
                      type="checkbox"
                      aria-label="Вибрати рядок"
                      checked={checked}
                      onChange={(e) => onToggleRow(id, e.target.checked)}
                    />
                  </td>
                  {visibleCols.map((meta) => (
                    <Cell key={meta.key} meta={meta} row={row} />
                  ))}
                </tr>
              </Fragment>
            );
          })}
        </tbody>
      </table>
      {loading && <div className="table-loading-overlay">Завантаження…</div>}
    </div>
  );
}

function Cell({ meta, row }: { meta: ColumnMeta; row: DataRow }) {
  const raw = row[meta.key];
  const display = formatValue(raw, meta.type);
  const numeric = meta.type === 'integer';
  return (
    <td className={numeric ? 'cell cell-num' : 'cell'} title={display || undefined}>
      {display}
    </td>
  );
}
