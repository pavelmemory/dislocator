// Value formatting per CONTRACT §1 / §7.
//   date     -> DD.MM.YYYY
//   datetime -> DD.MM.YYYY HH:mm
//   integer  -> as-is
//   null     -> empty string
import type { ColumnType } from './columns';

function pad(n: number): string {
  return n < 10 ? '0' + n : String(n);
}

// Parse an ISO-8601 string from the API WITHOUT timezone shifting. The backend
// stores naive timestamps (no tz) and returns e.g. "2026-09-01T06:23:00". We
// read the wall-clock components directly rather than constructing a Date (which
// would apply the browser timezone).
function parseIsoParts(iso: string): {
  y: number;
  mo: number;
  d: number;
  h: number;
  mi: number;
} | null {
  const m = iso.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/,
  );
  if (!m) return null;
  return {
    y: Number(m[1]),
    mo: Number(m[2]),
    d: Number(m[3]),
    h: m[4] ? Number(m[4]) : 0,
    mi: m[5] ? Number(m[5]) : 0,
  };
}

export function formatDate(iso: string): string {
  const p = parseIsoParts(iso);
  if (!p) return iso;
  return `${pad(p.d)}.${pad(p.mo)}.${p.y}`;
}

export function formatDateTime(iso: string): string {
  const p = parseIsoParts(iso);
  if (!p) return iso;
  return `${pad(p.d)}.${pad(p.mo)}.${p.y} ${pad(p.h)}:${pad(p.mi)}`;
}

export function formatValue(
  value: string | number | null | undefined,
  type: ColumnType,
): string {
  if (value === null || value === undefined || value === '') return '';
  switch (type) {
    case 'date':
      return formatDate(String(value));
    case 'datetime':
      return formatDateTime(String(value));
    case 'integer':
      return String(value);
    case 'text':
    default:
      return String(value);
  }
}
