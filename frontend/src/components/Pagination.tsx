import { PAGE_SIZES } from '../lib/tableState';

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export default function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <div className="pagination">
      <div className="pagination-info">
        {total === 0 ? (
          <span>Нет записей</span>
        ) : (
          <span>
            Показаны <strong>{from}</strong>–<strong>{to}</strong> из{' '}
            <strong>{total}</strong>
          </span>
        )}
      </div>

      <div className="pagination-controls">
        <label className="page-size">
          Строк на странице:
          <select
            value={pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
          >
            {PAGE_SIZES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="pager">
          <button
            type="button"
            className="btn btn-sm"
            disabled={page <= 1}
            onClick={() => onPageChange(1)}
          >
            «
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            ‹
          </button>
          <span className="page-indicator">
            Стр. {page} из {totalPages}
          </span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            ›
          </button>
          <button
            type="button"
            className="btn btn-sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(totalPages)}
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
}
