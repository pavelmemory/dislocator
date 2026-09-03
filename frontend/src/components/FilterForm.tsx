// Filter form above the table (CONTRACT §7). Replaces per-column filtering:
//  - a textarea to paste many № вагона values (spaces/commas/tabs/newlines);
//  - two modes: поточна дислокація (current) / дислокація за період (period);
//  - period reveals Дата з / Дата по date pickers (dd.mm.yyyy + calendar).
// Applying writes the filter state to the URL (page reset to 1); Очистити clears.
import { useEffect, useState } from 'react';
import { parseWagons, type FilterState, type Mode } from '../lib/tableState';
import DateField from './DateField';

interface Props {
  state: FilterState;
  onApply: (next: {
    wagons: string[];
    mode: Mode;
    dateFrom: string;
    dateTo: string;
  }) => void;
  onClear: () => void;
}

export default function FilterForm({ state, onApply, onClear }: Props) {
  // Local, uncommitted draft. Seeded from the URL state and re-synced whenever
  // the URL state changes (e.g. shared link opened, Очистити pressed).
  const [wagonsText, setWagonsText] = useState(state.wagons.join('\n'));
  const [mode, setMode] = useState<Mode>(state.mode);
  const [dateFrom, setDateFrom] = useState(state.dateFrom);
  const [dateTo, setDateTo] = useState(state.dateTo);

  useEffect(() => {
    setWagonsText(state.wagons.join('\n'));
    setMode(state.mode);
    setDateFrom(state.dateFrom);
    setDateTo(state.dateTo);
  }, [state.wagons, state.mode, state.dateFrom, state.dateTo]);

  function apply() {
    onApply({
      wagons: parseWagons(wagonsText),
      mode,
      dateFrom: mode === 'period' ? dateFrom : '',
      dateTo: mode === 'period' ? dateTo : '',
    });
  }

  function clear() {
    setWagonsText('');
    setMode('current');
    setDateFrom('');
    setDateTo('');
    onClear();
  }

  return (
    <form
      className="filter-form"
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
    >
      <div className="filter-form-wagons">
        <label className="ff-label" htmlFor="ff-wagons">
          № вагона
        </label>
        <span className="ff-hint">
          (розділяйте пробілами, комами, табами або з нового рядка)
        </span>
        <textarea
          id="ff-wagons"
          className="ff-textarea"
          value={wagonsText}
          onChange={(e) => setWagonsText(e.target.value)}
          rows={4}
          spellCheck={false}
        />
      </div>

      <div className="filter-form-controls">
        <div className="ff-modes">
          <label className="ff-radio">
            <input
              type="radio"
              name="mode"
              checked={mode === 'current'}
              onChange={() => setMode('current')}
            />
            <span>поточна дислокація</span>
          </label>
          <label className="ff-radio">
            <input
              type="radio"
              name="mode"
              checked={mode === 'period'}
              onChange={() => setMode('period')}
            />
            <span>дислокація за період</span>
          </label>
        </div>

        {/* The date pickers are always rendered so the layout height is stable
            (switching modes never shifts the form or the table). In current mode
            they are hidden but keep their space, and any typed dates are kept. */}
        <div
          className={mode === 'period' ? 'ff-dates' : 'ff-dates ff-dates-hidden'}
          aria-hidden={mode !== 'period'}
        >
          <DateField label="Дата з" value={dateFrom} onChange={setDateFrom} />
          <DateField label="Дата по" value={dateTo} onChange={setDateTo} />
        </div>

        <div className="ff-actions">
          <button type="submit" className="btn btn-primary">
            Показати
          </button>
          <button type="button" className="btn" onClick={clear}>
            Очистити
          </button>
        </div>
      </div>
    </form>
  );
}
