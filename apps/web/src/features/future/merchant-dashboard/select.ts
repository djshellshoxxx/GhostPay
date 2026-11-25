import { assertDashboardCurrent, DASHBOARD_LIMITS, DashboardError, fields, integer, type DashboardContext } from './model';
import type { DashboardProjection, DashboardRow, DashboardState } from './projection';

const STATES: readonly DashboardState[] = ['unknown', 'unverified', 'pending', 'final', 'partial', 'late', 'overpaid', 'conflicted', 'reorged', 'reverted'];
const FILTERS = new Set(['search', 'state', 'chainId', 'assetId', 'offset', 'limit']);

/** A local selector over an authenticated in-memory projection, never an imported projection file. */
export function selectDashboardRows(projection: DashboardProjection, filter: unknown, context: DashboardContext): {
  readonly revision: string;
  readonly totalMatches: number;
  readonly offset: number;
  readonly rows: readonly DashboardRow[];
} {
  assertDashboardCurrent(projection, context);
  if (filter === null || typeof filter !== 'object' || Array.isArray(filter)) throw new DashboardError('INVALID_INPUT');
  const keys = Object.keys(filter);
  if (keys.some((key) => !FILTERS.has(key))) throw new DashboardError('INVALID_INPUT');
  const data = fields(filter, keys);
  const search = Object.hasOwn(data, 'search') ? data['search'] : '';
  if (typeof search !== 'string' || search.length > DASHBOARD_LIMITS.search) throw new DashboardError('INVALID_INPUT');
  const state = data['state'];
  if (state !== undefined && !STATES.includes(state as DashboardState)) throw new DashboardError('INVALID_INPUT');
  for (const key of ['chainId', 'assetId'] as const) {
    if (data[key] !== undefined && (typeof data[key] !== 'string' || data[key].length > 128)) throw new DashboardError('INVALID_INPUT');
  }
  const offset = integer(Object.hasOwn(data, 'offset') ? data['offset'] : 0, DASHBOARD_LIMITS.invoices);
  const limit = integer(Object.hasOwn(data, 'limit') ? data['limit'] : 25, DASHBOARD_LIMITS.page);
  if (limit === 0) throw new DashboardError('INVALID_INPUT');
  const needle = search.toLowerCase();
  const rows: DashboardRow[] = [];
  let totalMatches = 0;
  for (const row of projection.rows) {
    if (state !== undefined && row.state !== state) continue;
    if (data['chainId'] !== undefined && row.chainId !== data['chainId']) continue;
    if (data['assetId'] !== undefined && row.assetId !== data['assetId']) continue;
    if (!row.alias.toLowerCase().includes(needle) && !row.invoiceRef.toLowerCase().includes(needle)) continue;
    if (totalMatches >= offset && rows.length < limit) rows.push(row);
    totalMatches++;
  }
  assertDashboardCurrent(projection, context);
  return Object.freeze({ revision: projection.revision, totalMatches, offset, rows: Object.freeze(rows) });
}
