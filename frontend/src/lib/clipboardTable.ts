// Copy the currently displayed rows as a formatted table to the clipboard.
// Writes BOTH text/html (so pasting into Gmail / Word / Docs renders a real
// table with borders) and text/plain (tab-separated fallback for editors and
// spreadsheets). Uses inline styles only, since mail clients strip <style> and
// class attributes.
import { formatValue } from './format';
import type { ColumnMeta, DataRow } from './columns';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const TABLE_STYLE =
  'border-collapse:collapse;border:1px solid #cccccc;' +
  'font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1c2733;';
const TH_STYLE =
  'border:1px solid #cccccc;background:#f2f2f2;padding:4px 8px;text-align:left;font-weight:bold;';
const TH_GROUP_STYLE =
  'border:1px solid #cccccc;background:#e9eef7;padding:4px 8px;text-align:center;font-weight:bold;';
const TD_STYLE = 'border:1px solid #cccccc;padding:3px 8px;white-space:nowrap;';
const SEP_STYLE = 'border:1px solid #cccccc;background:#f4f6f8;height:6px;padding:0;line-height:6px;';

interface Span {
  group: string | null;
  cols: ColumnMeta[];
}

// Build the HTML + plain-text representations of the given rows/columns.
export function buildTableHtml(
  rows: DataRow[],
  cols: ColumnMeta[],
): { html: string; text: string } {
  // Group consecutive columns sharing the same group for the top header row.
  const spans: Span[] = [];
  for (const c of cols) {
    const last = spans[spans.length - 1];
    if (c.group && last && last.group === c.group) last.cols.push(c);
    else spans.push({ group: c.group, cols: [c] });
  }
  const hasGroups = cols.some((c) => c.group);

  let thead = '';
  if (hasGroups) {
    let r1 = '';
    for (const s of spans) {
      if (s.group) {
        r1 += `<th colspan="${s.cols.length}" style="${TH_GROUP_STYLE}">${esc(s.group)}</th>`;
      } else {
        r1 += `<th rowspan="2" style="${TH_STYLE}">${esc(s.cols[0].label)}</th>`;
      }
    }
    let r2 = '';
    for (const c of cols) {
      if (c.group) r2 += `<th style="${TH_STYLE}">${esc(c.label)}</th>`;
    }
    thead = `<tr>${r1}</tr><tr>${r2}</tr>`;
  } else {
    let r1 = '';
    for (const c of cols) r1 += `<th style="${TH_STYLE}">${esc(c.label)}</th>`;
    thead = `<tr>${r1}</tr>`;
  }

  const colCount = cols.length;
  let tbody = '';
  let prevWagon: unknown;
  rows.forEach((row, idx) => {
    const wagon = row.wagon_number;
    // Grey separator row between wagon groups (mirrors the on-screen grouping).
    if (idx > 0 && wagon !== prevWagon) {
      tbody += `<tr><td colspan="${colCount}" style="${SEP_STYLE}"></td></tr>`;
    }
    prevWagon = wagon;
    let tds = '';
    for (const c of cols) {
      const val = formatValue(row[c.key], c.type);
      const align = c.type === 'integer' ? 'text-align:right;' : '';
      tds += `<td style="${TD_STYLE}${align}">${esc(val)}</td>`;
    }
    tbody += `<tr>${tds}</tr>`;
  });

  const html = `<table style="${TABLE_STYLE}"><thead>${thead}</thead><tbody>${tbody}</tbody></table>`;

  const headerLine = cols.map((c) => c.label).join('\t');
  const lines = rows.map((row) => cols.map((c) => formatValue(row[c.key], c.type)).join('\t'));
  const text = [headerLine, ...lines].join('\n');

  return { html, text };
}

// Copy the table to the clipboard. Returns true on success.
export async function copyTableToClipboard(
  rows: DataRow[],
  cols: ColumnMeta[],
): Promise<boolean> {
  const { html, text } = buildTableHtml(rows, cols);

  // Preferred: rich clipboard write (text/html + text/plain).
  try {
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html], { type: 'text/html' }),
          'text/plain': new Blob([text], { type: 'text/plain' }),
        }),
      ]);
      return true;
    }
  } catch {
    /* fall through */
  }

  // Fallback: select rendered HTML and use execCommand('copy') — this still
  // places rich HTML on the clipboard in browsers without ClipboardItem.
  try {
    const holder = document.createElement('div');
    holder.setAttribute('style', 'position:fixed;left:-99999px;top:0;');
    holder.innerHTML = html;
    document.body.appendChild(holder);
    const range = document.createRange();
    range.selectNodeContents(holder);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    const ok = document.execCommand('copy');
    sel?.removeAllRanges();
    holder.remove();
    if (ok) return true;
  } catch {
    /* ignore */
  }

  // Last resort: plain text only.
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
