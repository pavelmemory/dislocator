// Wraps substrings matching any of the active filter terms in <mark>
// (CONTRACT §7 — search-term highlight in matched text cells).
import { Fragment } from 'react';

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export default function Highlight({
  text,
  terms,
}: {
  text: string;
  terms: string[];
}) {
  const clean = terms.map((t) => t.trim()).filter((t) => t !== '');
  if (clean.length === 0) return <>{text}</>;

  // Split with a single capturing group: with String.split the captured
  // delimiters land at odd indices, so we don't rely on stateful regex.test().
  const pattern = new RegExp(`(${clean.map(escapeRegExp).join('|')})`, 'gi');
  const parts = text.split(pattern);

  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? <mark key={i}>{part}</mark> : <Fragment key={i}>{part}</Fragment>,
      )}
    </>
  );
}
