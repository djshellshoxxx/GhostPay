/** F04 local EVM projections contain claims, never settlement authority. */
export const DASHBOARD_LIMITS = Object.freeze({ invoices: 10_000, observations: 50_000, page: 100, search: 256 });

export type DashboardErrorCode = 'INVALID_INPUT' | 'LIMIT' | 'DUPLICATE_REFERENCE' | 'CANCELLED' | 'STALE_CONTEXT' | 'DEADLINE';

export class DashboardError extends Error {
  constructor(readonly code: DashboardErrorCode) {
    super(`Dashboard operation failed: ${code}`);
    this.name = 'DashboardError';
  }
}

export interface DashboardInvoice {
  readonly invoiceRef: string;
  readonly alias: string;
  readonly chainId: string;
  readonly assetId: string;
  readonly expectedAtomic: string;
  readonly expiresAt: number;
}

export interface DashboardObservation {
  readonly evidenceRef: string;
  readonly invoiceRef: string | null;
  readonly chainId: string;
  readonly assetId: string;
  readonly transactionHash: string;
  readonly position: number;
  readonly amountAtomic: string | null;
  /** Claimed UTC inclusion time in seconds; a final assessment must independently bind it. */
  readonly observedAt: number;
}

/** Provider lookup uses the canonical event, never the first local evidence reference. */
export type DashboardEvidenceClaim = Omit<DashboardObservation, 'evidenceRef'>;

export interface DashboardSnapshot {
  readonly schema: 'ghostpay.dashboard-input/1';
  readonly profileRef: string;
  readonly revision: string;
  readonly invoices: readonly DashboardInvoice[];
  readonly observations: readonly DashboardObservation[];
}

export type EvidenceKind = 'unverified' | 'unknown' | 'pending' | 'final' | 'reorged' | 'reverted';

/** Only an approved in-memory adapter supplies assessments, never an imported status field. */
export type EvidenceAssessment =
  | { readonly kind: 'unverified' | 'unknown' | 'reorged' | 'reverted' }
  | {
    readonly kind: 'pending' | 'final';
    readonly invoiceRef: string;
    readonly chainId: string;
    readonly assetId: string;
    readonly transactionHash: string;
    readonly position: number;
    readonly amountAtomic: string;
    readonly observedAt: number;
    readonly expectedAtomic: string;
    readonly expiresAt: number;
    readonly proofRef: string;
  };

export interface DashboardContext {
  readonly operationId: string;
  readonly sessionEpoch: number;
  readonly signal: AbortSignal;
  readonly deadlineMs: number;
  readonly nowMs: () => number;
  readonly current: () => {
    readonly operationId: string;
    readonly sessionEpoch: number;
    readonly profileRef: string;
    readonly revision: string;
  };
}

// Require the complete input: `$` alone also permits a final line terminator.
const REF = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}(?![\s\S])/;
const ATOMIC = /^(?:0|[1-9][0-9]{0,77})(?![\s\S])/;
const UINT256 = (1n << 256n) - 1n;
const HASH = /^0x[0-9a-f]{64}(?![\s\S])/;

function invalid(): never { throw new DashboardError('INVALID_INPUT'); }

/** Read own data fields only; reject accessors and unknown fields. */
export function fields(input: unknown, keys: readonly string[]): Record<string, unknown> {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return invalid();
  const prototype: unknown = Object.getPrototypeOf(input);
  if (prototype !== Object.prototype && prototype !== null) return invalid();
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Object.getOwnPropertySymbols(input).length !== 0 || Object.keys(descriptors).length !== keys.length) return invalid();
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (descriptor === undefined || !Object.hasOwn(descriptor, 'value')) return invalid();
    result[key] = descriptor.value as unknown;
  }
  return result;
}

export function reference(value: unknown): string {
  if (typeof value !== 'string' || !REF.test(value)) return invalid();
  return value;
}

export function integer(value: unknown, max = 253_402_300_799): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value > max) return invalid();
  return value;
}

export function atomic(value: unknown, positive = false): string {
  if (typeof value !== 'string' || !ATOMIC.test(value)) return invalid();
  const amount = BigInt(value);
  if (amount > UINT256 || (positive && amount === 0n)) return invalid();
  return value;
}

function chain(value: unknown): string {
  if (typeof value !== 'string' || !/^eip155:[1-9][0-9]{0,15}(?![\s\S])/.test(value)) return invalid();
  if (!Number.isSafeInteger(Number(value.slice(7)))) return invalid();
  return value;
}

function asset(value: unknown): string {
  if (value !== 'native' && (typeof value !== 'string' || !/^erc20:0x[0-9a-f]{40}(?![\s\S])/.test(value))) return invalid();
  return value;
}

function hash(value: unknown): string {
  if (typeof value !== 'string' || !HASH.test(value)) return invalid();
  return value;
}

function boundedArray<T>(value: unknown, max: number, decode: (row: unknown) => T): readonly T[] {
  if (!Array.isArray(value)) return invalid();
  if (value.length > max) throw new DashboardError('LIMIT');
  if (Object.getOwnPropertyNames(value).length !== value.length + 1 || Object.getOwnPropertySymbols(value).length !== 0) return invalid();
  const result: T[] = [];
  for (let i = 0; i < value.length; i++) {
    const property = Object.getOwnPropertyDescriptor(value, String(i));
    if (property === undefined || !Object.hasOwn(property, 'value')) return invalid();
    result.push(decode(property.value as unknown));
  }
  return Object.freeze(result);
}

function invoice(value: unknown): DashboardInvoice {
  const row = fields(value, ['invoiceRef', 'alias', 'chainId', 'assetId', 'expectedAtomic', 'expiresAt']);
  if (typeof row['alias'] !== 'string' || row['alias'].length > 160 ||
      [...row['alias']].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) return invalid();
  return Object.freeze({
    invoiceRef: reference(row['invoiceRef']), alias: row['alias'], chainId: chain(row['chainId']),
    assetId: asset(row['assetId']), expectedAtomic: atomic(row['expectedAtomic'], true), expiresAt: integer(row['expiresAt']),
  });
}

function observation(value: unknown): DashboardObservation {
  const row = fields(value, ['evidenceRef', 'invoiceRef', 'chainId', 'assetId', 'transactionHash', 'position', 'amountAtomic', 'observedAt']);
  return Object.freeze({
    evidenceRef: reference(row['evidenceRef']), invoiceRef: row['invoiceRef'] === null ? null : reference(row['invoiceRef']),
    chainId: chain(row['chainId']), assetId: asset(row['assetId']), transactionHash: hash(row['transactionHash']),
    position: integer(row['position'], 0xffff_ffff), amountAtomic: row['amountAtomic'] === null ? null : atomic(row['amountAtomic']),
    observedAt: integer(row['observedAt']),
  });
}

/** Decode claims only. Persisted confirmation/finality fields are rejected. */
export function decodeDashboardSnapshot(value: unknown): DashboardSnapshot {
  try {
    const row = fields(value, ['schema', 'profileRef', 'revision', 'invoices', 'observations']);
    if (row['schema'] !== 'ghostpay.dashboard-input/1') return invalid();
    const invoices = boundedArray(row['invoices'], DASHBOARD_LIMITS.invoices, invoice);
    const refs = new Set<string>();
    for (const item of invoices) {
      if (refs.has(item.invoiceRef)) throw new DashboardError('DUPLICATE_REFERENCE');
      refs.add(item.invoiceRef);
    }
    return Object.freeze({ schema: 'ghostpay.dashboard-input/1', profileRef: reference(row['profileRef']),
      revision: reference(row['revision']), invoices, observations: boundedArray(row['observations'], DASHBOARD_LIMITS.observations, observation) });
  } catch (error) {
    if (error instanceof DashboardError) throw error;
    return invalid();
  }
}

/** Recheck before releasing results and around every asynchronous yield. */
export function assertDashboardCurrent(snapshot: Pick<DashboardSnapshot, 'profileRef' | 'revision'>, context: DashboardContext): void {
  if (context.signal.aborted) throw new DashboardError('CANCELLED');
  reference(context.operationId);
  integer(context.sessionEpoch, Number.MAX_SAFE_INTEGER);
  let now: number;
  try { now = context.nowMs(); } catch { throw new DashboardError('DEADLINE'); }
  if (!Number.isFinite(now) || !Number.isFinite(context.deadlineMs) || now >= context.deadlineMs) throw new DashboardError('DEADLINE');
  let current: ReturnType<DashboardContext['current']>;
  try { current = context.current(); } catch { throw new DashboardError('STALE_CONTEXT'); }
  if (current.operationId !== context.operationId || current.sessionEpoch !== context.sessionEpoch ||
      current.profileRef !== snapshot.profileRef || current.revision !== snapshot.revision) throw new DashboardError('STALE_CONTEXT');
}
