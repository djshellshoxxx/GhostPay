// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u0080-\u009f\u2028\u2029]/g;
const FORMULA_START_RE = /^(?:[\t\r]|[ ]*[=+\-@])/;

/**
 * Neutralise a text cell for spreadsheets: strip control characters and prefix a
 * single quote when the cell could be read as a formula (`= + - @ TAB CR`).
 *
 * @param s Untrusted text (customer name, item description).
 * @returns Safe text (not yet CSV-quoted).
 * @security CSV formula injection (CWE-1236). Apply to every free-text cell, never to generated numerics.
 */
export function sanitizeText(s: string): string {
  const clean = s.replace(CONTROL_RE, ' ');
  return FORMULA_START_RE.test(clean) ? `'${clean}` : clean;
}

/** RFC 4180 quoting; quotes only when needed. */
export function quoteCell(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Text cell: sanitise then quote. */
export function textCell(s: string): string {
  return quoteCell(sanitizeText(s));
}

/** Join rows with CRLF and a trailing CRLF. Cells must already be cell-encoded. */
export function joinCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((r) => r.join(',')).join('\r\n') + '\r\n';
}
