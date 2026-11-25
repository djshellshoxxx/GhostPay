import { assertDashboardCurrent, DashboardError, fields, reference, type DashboardContext } from './model.js';
import type { DashboardProjection, DashboardRow } from './projection.js';

/** F04 export is entirely local: it never downloads files, sends data or signs transactions. */
export const DASHBOARD_EXPORT_COLUMNS = Object.freeze([
  'invoiceRef', 'alias', 'chainId', 'assetId', 'state', 'expiresAt',
  'expectedAtomic', 'finalAtomic', 'pendingAtomic', 'lateFinalAtomic', 'evidenceRefs',
] as const);
export type DashboardExportColumn = typeof DASHBOARD_EXPORT_COLUMNS[number];
export type DashboardExportFormat = 'csv' | 'json';
export const DASHBOARD_EXPORT_MAX_BYTES = 20 * 1024 * 1024;

export interface DashboardExportPreview {
  readonly previewId: string;
  readonly format: DashboardExportFormat;
  readonly count: number;
  readonly columns: readonly DashboardExportColumn[];
  readonly coverage: 'not-evaluated';
  readonly warning: string;
}
export interface DashboardExportFile {
  readonly content: string;
  readonly mimeType: string;
  readonly bytes: number;
}
interface Pending {
  readonly preview: DashboardExportPreview;
  readonly projection: DashboardProjection;
  readonly rows: readonly DashboardRow[];
  readonly operationId: string;
  readonly sessionEpoch: number;
}
const ALLOWED = new Set<string>(DASHBOARD_EXPORT_COLUMNS);
const MONEY = new Set<DashboardExportColumn>(['expectedAtomic', 'finalAtomic', 'pendingAtomic', 'lateFinalAtomic']);
const ATOMIC_TOTAL = /^(?:0|[1-9][0-9]{0,82})(?![\s\S])/;
const PROJECTION_ROWS_MAX = 10_000;
const WARNING = 'This local export discloses the selected fields. Payment evidence may be incomplete; totals are atomic units, not fiat amounts. Verify settlement independently.';
function invalid(): never { throw new DashboardError('INVALID_INPUT'); }

/** Reject holes, getters, exotic prototypes, symbols and out-of-budget arrays before accessing values. */
function ownArray(value: unknown, max: number): readonly unknown[] {
  if (!Array.isArray(value)) return invalid();
  if (value.length > max) throw new DashboardError('LIMIT');
  if (Object.getOwnPropertyNames(value).length !== value.length + 1 || Object.getOwnPropertySymbols(value).length !== 0) return invalid();
  const result: unknown[] = [];
  for (let i = 0; i < value.length; i++) {
    const slot = Object.getOwnPropertyDescriptor(value, String(i));
    if (slot === undefined || !Object.hasOwn(slot, 'value')) return invalid();
    result.push(slot.value as unknown);
  }
  return result;
}

function exportColumns(input: unknown): readonly DashboardExportColumn[] {
  const values = ownArray(input, DASHBOARD_EXPORT_COLUMNS.length);
  if (values.length === 0) return invalid();
  const seen = new Set<string>();
  for (const value of values) {
    if (typeof value !== 'string' || !ALLOWED.has(value) || seen.has(value)) return invalid();
    seen.add(value);
  }
  if ([...MONEY].some((field) => seen.has(field)) &&
      (!seen.has('chainId') || !seen.has('assetId') ||
        ([...MONEY].some((field) => field !== 'expectedAtomic' && seen.has(field)) && !seen.has('state')))) return invalid();
  return Object.freeze(values as DashboardExportColumn[]);
}

function exportRefs(input: unknown): ReadonlySet<string> {
  const values = ownArray(input, PROJECTION_ROWS_MAX);
  if (values.length === 0) return invalid();
  const refs = new Set<string>();
  for (const value of values) {
    const ref = reference(value);
    if (refs.has(ref)) return invalid();
    refs.add(ref);
  }
  return refs;
}

/** Do not silently replace malformed UTF-16 when turning merchant text into UTF-8 bytes. */
function wellFormed(value: string): void {
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return invalid();
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return invalid();
  }
}

/** Read only own frozen data slots from the authenticated, already-built projection. */
function cell(row: DashboardRow, column: DashboardExportColumn): string | number | readonly string[] {
  const descriptor = Object.getOwnPropertyDescriptor(row, column);
  if (!descriptor || !Object.hasOwn(descriptor, 'value')) return invalid();
  const value: unknown = descriptor.value;
  if (column === 'expiresAt') {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return invalid();
    return value;
  }
  if (column === 'evidenceRefs') {
    if (!Object.isFrozen(value)) return invalid();
    const refs = ownArray(value, 50_000).map(reference);
    return Object.freeze(refs);
  }
  if (typeof value !== 'string') return invalid();
  wellFormed(value);
  if (MONEY.has(column) && !ATOMIC_TOTAL.test(value)) return invalid();
  return value;
}

/** Neutralize spreadsheet formulas even after leading spaces/invisible formatting chars. */
export function csvCell(value: string): string {
  const formula = /^[\s\u00a0\u2000-\u200f\u2028\u2029\u2060\ufeff]*[=+\-@]/u.test(value);
  const safe = formula ? "'" + value : value;
  return /[",\r\n]/u.test(safe) ? '"' + safe.replaceAll('"', '""') + '"' : safe;
}

function render(rows: readonly DashboardRow[], columns: readonly DashboardExportColumn[], format: DashboardExportFormat): string {
  if (format === 'csv') {
    const lines = [columns.map(csvCell).join(',')];
    for (const row of rows) lines.push(columns.map((c) => {
      const value = cell(row, c);
      return csvCell(Array.isArray(value) ? value.join('; ') : String(value));
    }).join(','));
    return lines.join('\r\n') + '\r\n';
  }
  const items = rows.map((row) => {
    const item: Record<string, string | number | readonly string[]> = Object.create(null) as Record<string, string | number | readonly string[]>;
    for (const column of columns) item[column] = cell(row, column);
    return item;
  });
  return JSON.stringify({ schema: 'ghostpay.dashboard-export/1', units: 'atomic',
    coverage: 'not-evaluated', columns, rows: items });
}

/**
 * Local two-step approval. Only the original preview object is accepted; approved previews
 * are one-shot. The caller must invoke approve from an explicit, deliberate UI action.
 * Lock/privacy mode must call cancel immediately, and the UI must discard any returned bytes.
 */
export class DashboardExportCoordinator {
  #pending: Pending | null = null;
  #counter = 0;

  cancel(): void { this.#pending = null; }

  preview(projection: DashboardProjection, request: unknown, context: DashboardContext): DashboardExportPreview {
    this.cancel();
    const source = fields(projection, ['schema', 'profileRef', 'revision', 'coverage', 'rows', 'totals', 'issues', 'evidence']);
    if (source['schema'] !== 'ghostpay.dashboard-projection/1' || source['coverage'] !== 'not-evaluated' ||
        !Object.isFrozen(projection) || !Array.isArray(source['rows']) || !Object.isFrozen(source['rows']) ||
        source['rows'].length > PROJECTION_ROWS_MAX) return invalid();
    assertDashboardCurrent(projection, context);
    const form = fields(request, ['invoiceRefs', 'columns', 'format']);
    const format = form['format'];
    if (format !== 'csv' && format !== 'json') return invalid();
    const columns = exportColumns(form['columns']);
    const selected = exportRefs(form['invoiceRefs']);
    const rows: DashboardRow[] = [];
    for (const candidate of ownArray(source['rows'], PROJECTION_ROWS_MAX)) {
      if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate) || !Object.isFrozen(candidate) ||
          Object.getPrototypeOf(candidate) !== Object.prototype) return invalid();
      const row = candidate as DashboardRow;
      const invoiceRef = Object.getOwnPropertyDescriptor(row, 'invoiceRef');
      if (!invoiceRef || !Object.hasOwn(invoiceRef, 'value')) return invalid();
      if (selected.has(reference(invoiceRef.value as unknown))) rows.push(row);
    }
    if (rows.length !== selected.size) return invalid();
    const preview = Object.freeze({ previewId: 'preview:' + (++this.#counter), format, count: rows.length,
      columns, coverage: 'not-evaluated' as const, warning: WARNING });
    assertDashboardCurrent(projection, context);
    this.#pending = { preview, projection, rows: Object.freeze(rows), operationId: context.operationId, sessionEpoch: context.sessionEpoch };
    return preview;
  }

  approve(preview: DashboardExportPreview, context: DashboardContext): DashboardExportFile {
    const pending = this.#pending;
    this.cancel(); // Revoke first, including on validation, serialization or quota failure.
    if (!pending || preview !== pending.preview) return invalid();
    if (pending.operationId !== context.operationId || pending.sessionEpoch !== context.sessionEpoch)
      throw new DashboardError('STALE_CONTEXT');
    assertDashboardCurrent(pending.projection, context);
    const content = render(pending.rows, pending.preview.columns, pending.preview.format);
    const bytes = new TextEncoder().encode(content).byteLength;
    if (bytes > DASHBOARD_EXPORT_MAX_BYTES) throw new DashboardError('LIMIT');
    assertDashboardCurrent(pending.projection, context);
    return Object.freeze({ content, bytes, mimeType: pending.preview.format === 'csv' ? 'text/csv;charset=utf-8' : 'application/json;charset=utf-8' });
  }
}
