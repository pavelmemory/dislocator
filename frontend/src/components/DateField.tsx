// Date input shown/typed as dd.mm.yyyy, with a calendar popup for picking.
// Emits the ISO value (YYYY-MM-DD) used by the API and the shareable URL; an
// empty or incomplete entry emits ''.
import { useEffect, useRef, useState } from 'react';

const MONTHS_UK = [
  'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
  'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень',
];
// Monday-first weekday headers.
const WEEKDAYS_UK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

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
  if (
    parsed.getFullYear() !== Number(yyyy) ||
    parsed.getMonth() + 1 !== mo ||
    parsed.getDate() !== d
  ) {
    return null;
  }
  return iso;
}

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

// Days shown in a month grid (Monday-first), 6 weeks.
function monthGrid(year: number, month0: number): (number | null)[] {
  const first = new Date(year, month0, 1);
  // JS: 0=Sun..6=Sat -> Monday-first offset.
  const lead = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month0 + 1, 0).getDate();
  const cells: (number | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

interface Props {
  value: string; // ISO or ''
  label: string;
  onChange: (iso: string) => void;
}

export default function DateField({ value, label, onChange }: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const shown = draft !== null ? draft : isoToDisplay(value);
  const invalid = shown.trim() !== '' && displayToIso(shown) === null;

  // View month for the popup, derived from the current value (or today).
  const base = displayToIso(shown) ?? value;
  const baseDate = /^(\d{4})-(\d{2})-(\d{2})$/.test(base)
    ? new Date(`${base}T00:00:00`)
    : new Date();
  const [view, setView] = useState<{ y: number; m: number }>({
    y: baseDate.getFullYear(),
    m: baseDate.getMonth(),
  });

  // Keep the popup view aligned with the value when it opens.
  useEffect(() => {
    if (open) {
      const b = displayToIso(shown) ?? value;
      const d = /^(\d{4})-(\d{2})-(\d{2})$/.test(b) ? new Date(`${b}T00:00:00`) : new Date();
      setView({ y: d.getFullYear(), m: d.getMonth() });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  function handleInput(raw: string) {
    let cleaned = raw.replace(/[^\d.]/g, '');
    const digits = cleaned.replace(/\./g, '').slice(0, 8);
    if (draft === null || raw.length >= (draft?.length ?? 0)) {
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
      setDraft(null);
    }
  }

  function pick(day: number) {
    const iso = `${view.y}-${pad(view.m + 1)}-${pad(day)}`;
    onChange(iso);
    setDraft(null);
    setOpen(false);
  }

  const selectedIso = displayToIso(shown) ?? (/^(\d{4})-(\d{2})-(\d{2})$/.test(value) ? value : '');
  const cells = monthGrid(view.y, view.m);

  return (
    <div className="datefield" ref={rootRef}>
      <span className="datefield-label">{label}</span>
      <div className="datefield-control">
        <input
          className={invalid ? 'date-input invalid' : 'date-input'}
          type="text"
          inputMode="numeric"
          value={shown}
          placeholder="дд.мм.рррр"
          maxLength={10}
          onChange={(e) => handleInput(e.target.value)}
          onBlur={handleBlur}
        />
        <button
          type="button"
          className="datefield-cal-btn"
          aria-label="Відкрити календар"
          onClick={() => setOpen((o) => !o)}
        >
          📅
        </button>
      </div>
      {open && (
        <div className="cal-popup">
          <div className="cal-head">
            <button
              type="button"
              className="cal-nav"
              aria-label="Попередній місяць"
              onClick={() =>
                setView((v) => (v.m === 0 ? { y: v.y - 1, m: 11 } : { y: v.y, m: v.m - 1 }))
              }
            >
              ‹
            </button>
            <span className="cal-title">
              {MONTHS_UK[view.m]} {view.y}
            </span>
            <button
              type="button"
              className="cal-nav"
              aria-label="Наступний місяць"
              onClick={() =>
                setView((v) => (v.m === 11 ? { y: v.y + 1, m: 0 } : { y: v.y, m: v.m + 1 }))
              }
            >
              ›
            </button>
          </div>
          <div className="cal-grid cal-weekdays">
            {WEEKDAYS_UK.map((w) => (
              <span key={w} className="cal-weekday">
                {w}
              </span>
            ))}
          </div>
          <div className="cal-grid">
            {cells.map((day, i) => {
              if (day === null) return <span key={i} className="cal-cell cal-empty" />;
              const iso = `${view.y}-${pad(view.m + 1)}-${pad(day)}`;
              const isSel = iso === selectedIso;
              return (
                <button
                  key={i}
                  type="button"
                  className={isSel ? 'cal-cell cal-day selected' : 'cal-cell cal-day'}
                  onClick={() => pick(day)}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
