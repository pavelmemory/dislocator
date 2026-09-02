// Typed column registry. Imported statically from the copied columns.json so
// the table metadata (order, groups, types, search modes) never drifts from
// the backend. GET /api/columns exists but we intentionally do not fetch it.
import columnsData from '../columns.json';

export type ColumnType = 'text' | 'integer' | 'date' | 'datetime';
export type SearchMode = 'multi' | 'range';

export interface ColumnMeta {
  key: string;
  group: string | null;
  label: string;
  type: ColumnType;
  search: SearchMode;
  xlsx_col: number;
}

export const COLUMNS: ColumnMeta[] = (columnsData.columns as ColumnMeta[]);

export const COLUMN_BY_KEY: Record<string, ColumnMeta> = Object.fromEntries(
  COLUMNS.map((c) => [c.key, c]),
);

// A row from GET /api/data — keyed by column key plus id.
export type DataRow = { id: number } & Record<string, string | number | null>;
