// "Столбцы" dropdown — checkboxes to show/hide each column. Visibility is
// persisted in localStorage by the parent hook (NOT in the URL).
import { useEffect, useRef, useState } from 'react';
import { COLUMNS } from '../lib/columns';

interface Props {
  isHidden: (key: string) => boolean;
  toggleColumn: (key: string) => void;
  showAll: () => void;
  hiddenCount: number;
}

export default function ColumnsMenu({
  isHidden,
  toggleColumn,
  showAll,
  hiddenCount,
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
        Столбцы{hiddenCount > 0 ? ` (скрыто: ${hiddenCount})` : ''}
      </button>
      {open && (
        <div className="dropdown-menu columns-menu">
          <div className="columns-menu-head">
            <button type="button" className="btn btn-sm" onClick={showAll}>
              Показать скрытые столбцы
            </button>
          </div>
          <div className="columns-menu-list">
            {COLUMNS.map((col) => (
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
