// Per-column filter control rendered inside the header (CONTRACT §5/§7).
//  - multi (text/integer): chip input, multiple comma-separated values, OR-ed.
//  - range (date/datetime): single date OR from/to range (inclusive).
import { useState, type KeyboardEvent } from 'react';
import type { ColumnMeta } from '../lib/columns';
import {
  type Filter,
  type MultiFilter,
  type RangeFilter,
} from '../lib/tableState';

interface Props {
  column: ColumnMeta;
  filter: Filter | undefined;
  onChange: (filter: Filter) => void;
}

export default function ColumnFilter({ column, filter, onChange }: Props) {
  if (column.search === 'multi') {
    return (
      <MultiInput
        filter={filter && filter.kind === 'multi' ? filter : { kind: 'multi', values: [] }}
        integer={column.type === 'integer'}
        onChange={onChange}
      />
    );
  }
  return (
    <RangeInput
      filter={
        filter && filter.kind === 'range'
          ? filter
          : { kind: 'range', single: '', from: '', to: '' }
      }
      onChange={onChange}
    />
  );
}

function MultiInput({
  filter,
  integer,
  onChange,
}: {
  filter: MultiFilter;
  integer: boolean;
  onChange: (f: Filter) => void;
}) {
  const [draft, setDraft] = useState('');

  function commit(raw: string) {
    const additions = raw
      .split(',')
      .map((v) => v.trim())
      .filter((v) => v !== '');
    if (additions.length === 0) return;
    const values = [...filter.values];
    for (const a of additions) if (!values.includes(a)) values.push(a);
    onChange({ kind: 'multi', values });
    setDraft('');
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      commit(draft);
    } else if (e.key === 'Backspace' && draft === '' && filter.values.length) {
      onChange({ kind: 'multi', values: filter.values.slice(0, -1) });
    }
  }

  function removeChip(idx: number) {
    onChange({ kind: 'multi', values: filter.values.filter((_, i) => i !== idx) });
  }

  return (
    <div className="filter filter-multi">
      {filter.values.length > 0 && (
        <div className="chips">
          {filter.values.map((v, i) => (
            <span className="chip" key={`${v}-${i}`}>
              {v}
              <button
                type="button"
                className="chip-x"
                onClick={() => removeChip(i)}
                aria-label="Удалить"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <input
        className="filter-input"
        type="text"
        inputMode={integer ? 'numeric' : 'text'}
        value={draft}
        placeholder="фильтр…"
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => commit(draft)}
      />
    </div>
  );
}

function RangeInput({
  filter,
  onChange,
}: {
  filter: RangeFilter;
  onChange: (f: Filter) => void;
}) {
  const [mode, setMode] = useState<'single' | 'range'>(
    filter.from || filter.to ? 'range' : 'single',
  );

  return (
    <div className="filter filter-range">
      <div className="range-mode">
        <button
          type="button"
          className={mode === 'single' ? 'seg active' : 'seg'}
          onClick={() => {
            setMode('single');
            onChange({ kind: 'range', single: filter.single, from: '', to: '' });
          }}
        >
          дата
        </button>
        <button
          type="button"
          className={mode === 'range' ? 'seg active' : 'seg'}
          onClick={() => {
            setMode('range');
            onChange({ kind: 'range', single: '', from: filter.from, to: filter.to });
          }}
        >
          период
        </button>
      </div>
      {mode === 'single' ? (
        <DateField
          value={filter.single}
          placeholder="дд.мм.гггг"
          onChange={(v) => onChange({ kind: 'range', single: v, from: '', to: '' })}
        />
      ) : (
        <div className="range-pair">
          <DateField
            value={filter.from}
            placeholder="с (дд.мм.гггг)"
            onChange={(v) => onChange({ kind: 'range', single: '', from: v, to: filter.to })}
          />
          <DateField
            value={filter.to}
            placeholder="по (дд.мм.гггг)"
            onChange={(v) => onChange({ kind: 'range', single: '', from: filter.from, to: v })}
          />
        </div>
      )}
    </div>
  );
}

// DateField shows and accepts dates as дд.мм.гггг, but stores/emits the ISO
// value (YYYY-MM-DD) used by the API and the shareable URL. An empty or
// incomplete entry emits ''.
function isoToDisplay(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return '';
  return `${m[3]}.${m[2]}.${m[1]}`;
}

function displayToIso(display: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(display.trim());
  if (!m) return null;
  const [, dd, mm, yyyy] = m;
  const d = Number(dd);
  const mo = Number(mm);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const iso = `${yyyy}-${mm}-${dd}`;
  const parsed = new Date(`${iso}T00:00:00`);
  // Reject impossible dates (e.g. 31.02.2026).
  if (
    parsed.getFullYear() !== Number(yyyy) ||
    parsed.getMonth() + 1 !== mo ||
    parsed.getDate() !== d
  ) {
    return null;
  }
  return iso;
}

function DateField({
  value,
  placeholder,
  onChange,
}: {
  value: string;
  placeholder: string;
  onChange: (iso: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft !== null ? draft : isoToDisplay(value);

  function handleInput(raw: string) {
    // Keep only digits and dots; auto-insert dots after day and month.
    let cleaned = raw.replace(/[^\d.]/g, '');
    const digits = cleaned.replace(/\./g, '').slice(0, 8);
    if (draft === null || raw.length >= (draft?.length ?? 0)) {
      // typing forward: rebuild with dots at fixed positions
      const parts = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(
        (p) => p.length > 0,
      );
      cleaned = parts.join('.');
    }
    setDraft(cleaned);
    const iso = displayToIso(cleaned);
    if (iso) onChange(iso);
    else if (cleaned.trim() === '') onChange('');
  }

  function handleBlur() {
    const iso = displayToIso(shown);
    if (iso) {
      onChange(iso);
      setDraft(null);
    } else if (shown.trim() === '') {
      onChange('');
      setDraft(null);
    } else {
      // invalid: revert to last valid value
      setDraft(null);
    }
  }

  const invalid = shown.trim() !== '' && displayToIso(shown) === null;

  return (
    <input
      className={invalid ? 'filter-input date-input invalid' : 'filter-input date-input'}
      type="text"
      inputMode="numeric"
      value={shown}
      placeholder={placeholder}
      maxLength={10}
      onChange={(e) => handleInput(e.target.value)}
      onBlur={handleBlur}
    />
  );
}
