// "Стовпці" dropdown — checkboxes to show/hide each column, plus a control to
// reset the whole layout (order + widths + visibility). Layout is persisted in
// localStorage by the parent hook (NOT in the URL).
import { useEffect, useRef, useState } from 'react';
import type { ColumnMeta } from '../lib/columns';

interface Props {
  columns: ColumnMeta[];
  isHidden: (key: string) => boolean;
  toggleColumn: (key: string) => void;
  showAll: () => void;
  resetLayout: () => void;
  hiddenCount: number;
  isDefaultLayout: boolean;
}

export default function ColumnsMenu({
  columns,
  isHidden,
  toggleColumn,
  showAll,
  resetLayout,
  hiddenCount,
  isDefaultLayout,
}: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  return (
    <div className="dropdown" ref={ref}>
      <button type="button" className="btn" onClick={() => setOpen((o) => !o)}>
        Стовпці{hiddenCount > 0 ? ` (приховано: ${hiddenCount})` : ''}
      </button>
      {open && (
        <div className="dropdown-menu columns-menu">
          <div className="columns-menu-head">
            <button
              type="button"
              className="btn btn-sm"
              onClick={showAll}
              disabled={hiddenCount === 0}
            >
              {hiddenCount > 0 ? 'Показати приховані стовпці' : 'Показати всі'}
            </button>
            <button
              type="button"
              className="btn btn-sm"
              onClick={resetLayout}
              disabled={isDefaultLayout}
              title="Скинути порядок, ширину та видимість стовпців"
            >
              Скинути розташування
            </button>
          </div>
          <div className="columns-menu-list">
            {columns.map((col) => (
              <label key={col.key} className="columns-menu-item">
                <input
                  type="checkbox"
                  checked={!isHidden(col.key)}
                  onChange={() => toggleColumn(col.key)}
                />
                <span>
                  {col.group ? <span className="col-group-tag">{col.group}: </span> : null}
                  {col.label}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
