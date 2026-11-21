import { parseStrictJson } from '@ghostpay/invoice-schema';
import {
  MAX_PERIOD_INDEX, MAX_RECORDS, logicalId, validateSchedule, type Cadence,
} from '@ghostpay/merchant-billing';

export const MAX_RECURRING_PLANS = 100;
export const MAX_RECURRING_SNAPSHOT_BYTES = 1_048_576;
export const MAX_RECURRING_TIMESTAMP = 253_402_300_799;

export type RecurringErrorCode = 'SCHEMA' | 'LIMIT' | 'REFERENCE' | 'AMOUNT' | 'ASSET' |
  'TIMEZONE' | 'SCHEDULE' | 'DUPLICATE' | 'SNAPSHOT' | 'CLOCK' | 'PLAN_MISSING' |
  'REVIEW_REVOKED' | 'STALE_REVIEW' | 'REVIEW_EXPIRED' | 'NOT_DUE';

/** Fixed messages never interpolate imported plan, invoice, or customer data. */
export class RecurringError extends Error {
  public constructor(public readonly code: RecurringErrorCode) {
    super(`Recurring plan refused (${code}).`);
    this.name = 'RecurringError';
  }
}

export function refuse(code: RecurringErrorCode): never { throw new RecurringError(code); }

declare const tokenAtomicBrand: unique symbol;
/** Token base units; never interchangeable with merchant-billing's fiat minor units. */
export type TokenAtomicAmount = string & { readonly [tokenAtomicBrand]: true };

export interface RecurringPlanV1 {
  readonly schema: 'ghostpay.recurring-plan/1';
  readonly planId: string;
  readonly revision: string;
  readonly anchorSeconds: number;
  readonly cadence: Cadence;
  readonly templateRef: string;
  /** Narrow canonical EVM asset profile; syntax does not establish provider support. */
  readonly assetId: string;
  readonly amountAtomic: TokenAtomicAmount;
  /** Presentation only. All period calculations use the UTC anchor. */
  readonly displayTimeZone: string;
  readonly status: 'active' | 'paused' | 'cancelled';
}

export interface RecurringPlanStateV1 {
  readonly plan: RecurringPlanV1;
  /** First unreserved period. MAX_PERIOD_INDEX is an exhausted cursor, not a period. */
  readonly nextPeriodIndex: number;
}

/** References only: imported status is not artifact authentication or payment evidence. */
export interface RecurringInvoiceReferenceV1 {
  readonly eventId: string;
  readonly planId: string;
  readonly planRevision: string;
  readonly periodIndex: number;
  readonly kind: 'invoice';
  readonly artifactRef: string;
  readonly status: 'prepared' | 'issued' | 'exported' | 'void';
}

/** Staged planning state. Persistence, encryption, and artifact authentication belong to P05/P04. */
export interface RecurringSnapshotV1 {
  readonly schema: 'ghostpay.recurring-snapshot/1';
  readonly profileRef: string;
  readonly revision: string;
  readonly plans: readonly RecurringPlanStateV1[];
  readonly outbox: readonly RecurringInvoiceReferenceV1[];
}

function record(value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return refuse('SCHEMA');
  const prototype: unknown = Object.getPrototypeOf(value);
  if (prototype !== null && prototype !== Object.prototype) return refuse('SCHEMA');
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some(key => typeof key !== 'string' || !keys.includes(key)))
    return refuse('SCHEMA');
  for (const key of own) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) return refuse('SCHEMA');
  }
  return value as Record<string, unknown>;
}

function array(value: unknown, limit: number): readonly unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return refuse('SCHEMA');
  if (value.length > limit) return refuse('LIMIT');
  const keys = Reflect.ownKeys(value);
  if (keys.length !== value.length + 1) return refuse('SCHEMA');
  for (let i = 0; i < value.length; i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(i));
    if (descriptor === undefined || !('value' in descriptor) || !descriptor.enumerable) return refuse('SCHEMA');
  }
  return value as readonly unknown[];
}

export function reference(value: unknown): string {
  if (typeof value !== 'string' || value.trim() !== value || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/.test(value))
    return refuse('REFERENCE');
  return value;
}

export function integer(value: unknown, maximum: number, code: RecurringErrorCode): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value > maximum)
    return refuse(code);
  return value;
}

export function timestamp(value: unknown): number {
  return integer(value, MAX_RECURRING_TIMESTAMP, 'CLOCK');
}

function atomicAmount(value: unknown): TokenAtomicAmount {
  if (typeof value !== 'string' || value.trim() !== value || !/^[1-9][0-9]{0,77}$/.test(value) || BigInt(value) > (1n << 256n) - 1n)
    return refuse('AMOUNT');
  return value as TokenAtomicAmount;
}

function assetId(value: unknown): string {
  if (typeof value !== 'string') return refuse('ASSET');
  const match = /^eip155:([1-9][0-9]{0,15})\/(?:erc20:0x[0-9a-f]{40}|slip44:(0|[1-9][0-9]{0,9}))$/.exec(value);
  if (match === null || match[0] !== value || !Number.isSafeInteger(Number(match[1])) ||
      (match[2] !== undefined && Number(match[2]) > 2_147_483_647)) return refuse('ASSET');
  return value;
}

function timeZone(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || value.trim() !== value || !/^[A-Za-z0-9_+./-]+$/.test(value))
    return refuse('TIMEZONE');
  try { new Intl.DateTimeFormat('en', { timeZone: value }); }
  catch { return refuse('TIMEZONE'); }
  return value;
}

/** Decode a detached immutable plan; no pricing conversion, randomness, or invoice creation. */
export function validateRecurringPlan(value: unknown): RecurringPlanV1 {
  const p = record(value, ['schema', 'planId', 'revision', 'anchorSeconds', 'cadence', 'templateRef',
    'assetId', 'amountAtomic', 'displayTimeZone', 'status']);
  if (p.schema !== 'ghostpay.recurring-plan/1') return refuse('SCHEMA');
  const rawCadence = p.cadence;
  if (typeof rawCadence !== 'object' || rawCadence === null) return refuse('SCHEDULE');
  // Inspect a descriptor before choosing the closed cadence shape; accessors are never invoked.
  const kind: unknown = Object.getOwnPropertyDescriptor(rawCadence, 'kind')?.value;
  let cadence: Cadence;
  if (kind === 'custom') {
    const c = record(rawCadence, ['kind', 'seconds']);
    cadence = { kind, seconds: integer(c.seconds, 366 * 86_400, 'SCHEDULE') };
  } else if (kind === 'weekly' || kind === 'monthly') {
    const c = record(rawCadence, ['kind', 'every']);
    cadence = { kind, every: integer(c.every, 24, 'SCHEDULE') };
  } else return refuse('SCHEDULE');
  const anchorSeconds = timestamp(p.anchorSeconds);
  try { validateSchedule({ anchor: anchorSeconds, cadence }); }
  catch { return refuse('SCHEDULE'); }
  if (p.status !== 'active' && p.status !== 'paused' && p.status !== 'cancelled') return refuse('SCHEMA');
  return Object.freeze({
    schema: 'ghostpay.recurring-plan/1',
    planId: reference(p.planId), revision: reference(p.revision), anchorSeconds,
    cadence: Object.freeze(cadence), templateRef: reference(p.templateRef),
    assetId: assetId(p.assetId), amountAtomic: atomicAmount(p.amountAtomic),
    displayTimeZone: timeZone(p.displayTimeZone), status: p.status,
  });
}

/** Validate a staged snapshot in full before returning any records. Does not restore consent. */
export function validateRecurringSnapshot(value: unknown): RecurringSnapshotV1 {
  const s = record(value, ['schema', 'profileRef', 'revision', 'plans', 'outbox']);
  if (s.schema !== 'ghostpay.recurring-snapshot/1') return refuse('SCHEMA');
  const states = new Map<string, RecurringPlanStateV1>();
  const plans = array(s.plans, MAX_RECURRING_PLANS).map(value => {
    const state = record(value, ['plan', 'nextPeriodIndex']);
    const plan = validateRecurringPlan(state.plan);
    if (states.has(plan.planId)) return refuse('DUPLICATE');
    const result = Object.freeze({ plan, nextPeriodIndex: integer(state.nextPeriodIndex, MAX_PERIOD_INDEX, 'SCHEDULE') });
    states.set(plan.planId, result);
    return result;
  });
  const seen = new Set<string>();
  const artifacts = new Set<string>();
  const outbox = array(s.outbox, MAX_RECORDS).map(value => {
    const r = record(value, ['eventId', 'planId', 'planRevision', 'periodIndex', 'kind', 'artifactRef', 'status']);
    const planId = reference(r.planId);
    const periodIndex = integer(r.periodIndex, MAX_PERIOD_INDEX - 1, 'SCHEDULE');
    const state = states.get(planId);
    const eventId = logicalId(planId, periodIndex);
    if (r.kind !== 'invoice' || r.eventId !== eventId || state === undefined || periodIndex >= state.nextPeriodIndex)
      return refuse('SNAPSHOT');
    const artifactRef = reference(r.artifactRef);
    if (seen.has(eventId) || artifacts.has(artifactRef)) return refuse('DUPLICATE');
    seen.add(eventId);
    artifacts.add(artifactRef);
    if (r.status !== 'prepared' && r.status !== 'issued' && r.status !== 'exported' && r.status !== 'void')
      return refuse('SNAPSHOT');
    return Object.freeze({
      eventId, planId, planRevision: reference(r.planRevision), periodIndex, kind: 'invoice' as const,
      artifactRef, status: r.status,
    });
  });
  return Object.freeze({ schema: 'ghostpay.recurring-snapshot/1', profileRef: reference(s.profileRef),
    revision: reference(s.revision), plans: Object.freeze(plans), outbox: Object.freeze(outbox) });
}

/**
 * Strict bounded staged JSON intake. This does not activate an imported profile;
 * a future P05 migration must stage legacy active plans as paused before consent.
 */
export function parseRecurringSnapshot(text: unknown): RecurringSnapshotV1 {
  if (typeof text !== 'string') return refuse('SCHEMA');
  if (text.length > MAX_RECURRING_SNAPSHOT_BYTES || new TextEncoder().encode(text).byteLength > MAX_RECURRING_SNAPSHOT_BYTES)
    return refuse('LIMIT');
  let value: unknown;
  try { value = parseStrictJson(text); }
  catch { return refuse('SCHEMA'); }
  return validateRecurringSnapshot(value);
}
