import { SandboxError } from './errors.js';

declare const testBrand: unique symbol;

/** Nominal brand: values of these types exist only if created by this package. */
export type TestBranded<T extends string, B> = B & { readonly [testBrand]: T };

/** A fake address on the mock chain. Never valid on any real network. */
export type TestAddress = TestBranded<'TestAddress', string>;
/** A fake transaction id on the mock chain. */
export type TestTxId = TestBranded<'TestTxId', string>;
/** A fake profile id for a sandbox profile. */
export type TestProfileId = TestBranded<'TestProfileId', string>;
/** A fake-money amount (smallest unit). Not assignable from plain bigint. */
export type TestAmount = TestBranded<'TestAmount', bigint>;

declare const realBrand: unique symbol;
/** A real (non-test) profile id. Cannot be built from a TestProfileId. */
export type RealProfileId = string & { readonly [realBrand]: 'RealProfileId' };

const HEX_ADDR = '[0-9a-f]{32}';
/** Exact formats (anchored). Deliberately unlike any real chain's address format. */
const ADDRESS_RE = new RegExp(`^test1${HEX_ADDR}$`);
const TXID_RE = new RegExp(`^testtx_${HEX_ADDR}$`);
const PROFILE_RE = /^testprof_[0-9a-f]{16}$/;
/** Unanchored detector used to find test data inside arbitrary values. */
const MARKER_RE = new RegExp(`test1${HEX_ADDR}|testtx_${HEX_ADDR}|testprof_[0-9a-f]{16}`);
const REAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/** Type guard for test addresses (exact format). */
export function isTestAddress(v: unknown): v is TestAddress {
  return typeof v === 'string' && ADDRESS_RE.test(v);
}
/** Type guard for test tx ids. */
export function isTestTxId(v: unknown): v is TestTxId {
  return typeof v === 'string' && TXID_RE.test(v);
}
/** Type guard for test profile ids. */
export function isTestProfileId(v: unknown): v is TestProfileId {
  return typeof v === 'string' && PROFILE_RE.test(v);
}

/** Validate untrusted input as a TestAddress or throw. */
export function parseTestAddress(v: unknown): TestAddress {
  if (!isTestAddress(v)) throw new SandboxError('invalid-address', 'not a sandbox test address');
  return v;
}

/** Brand a positive bigint as a test amount (<= 10^30 smallest units). */
export const MAX_TEST_AMOUNT = 10n ** 30n;
export function toTestAmount(v: unknown, allowZero = false): TestAmount {
  if (typeof v !== 'bigint' || v < 0n || (v === 0n && !allowZero) || v > MAX_TEST_AMOUNT) {
    throw new SandboxError('invalid-amount', 'amount must be a bigint in range');
  }
  return v as TestAmount;
}

/** Internal constructors (used by chain). @security Only this package mints brands. */
export function brandAddress(hex: string): TestAddress {
  return `test1${hex}` as TestAddress;
}
export function brandTxId(hex: string): TestTxId {
  return `testtx_${hex}` as TestTxId;
}
export function brandProfileId(hex: string): TestProfileId {
  return `testprof_${hex}` as TestProfileId;
}

/**
 * Create a real profile id from untrusted input. Rejects anything that looks like
 * test data, so a sandbox id can never be laundered into a real profile.
 * @security Strict charset; test markers rejected.
 */
export function toRealProfileId(v: unknown): RealProfileId {
  if (typeof v !== 'string' || !REAL_ID_RE.test(v)) {
    throw new SandboxError('invalid-profile', 'invalid real profile id');
  }
  if (MARKER_RE.test(v) || v.startsWith('testprof_')) {
    throw new SandboxError('test-data-in-real-context', 'test marker in real profile id');
  }
  return v as RealProfileId;
}

const MAX_DEPTH = 32;
const MAX_NODES = 100_000;

/**
 * Deep scan (keys and string values, bigint-safe, cycle-safe, bounded) for sandbox markers.
 * @security Fail closed: exceeding depth/node budget counts as "contains" so oversized
 * structures cannot be used to smuggle test data into real storage.
 */
export function containsTestData(value: unknown): boolean {
  const seen = new Set<object>();
  let nodes = 0;
  const walk = (v: unknown, depth: number): boolean => {
    if (++nodes > MAX_NODES || depth > MAX_DEPTH) return true;
    if (typeof v === 'string') return MARKER_RE.test(v);
    if (typeof v !== 'object' || v === null) return false;
    if (seen.has(v)) return false;
    seen.add(v);
    if (Array.isArray(v)) return v.some((x) => walk(x, depth + 1));
    return Object.entries(v).some(([k, x]) => MARKER_RE.test(k) || walk(x, depth + 1));
  };
  return walk(value, 0);
}

/**
 * Guard to call before persisting/sending anything into a REAL context.
 * @security Throws `test-data-in-real-context` if any sandbox marker is present.
 */
export function assertNoTestData(value: unknown): void {
  if (containsTestData(value)) {
    throw new SandboxError('test-data-in-real-context', 'sandbox data must not enter real context');
  }
}

/**
 * Guard for the sandbox side: reject real-looking values via caller-supplied detector
 * (for example the app's real-address validator) so real addresses never get sandbox-ified.
 */
export function assertNoRealData(value: unknown, looksReal: (s: string) => boolean): void {
  const walk = (v: unknown, depth: number): void => {
    if (depth > MAX_DEPTH) throw new SandboxError('real-data-in-test-context', 'too deep');
    if (typeof v === 'string') {
      if (looksReal(v)) throw new SandboxError('real-data-in-test-context', 'real data in sandbox');
    } else if (Array.isArray(v)) v.forEach((x) => walk(x, depth + 1));
    else if (typeof v === 'object' && v !== null) {
      Object.values(v).forEach((x) => walk(x, depth + 1));
    }
  };
  walk(value, 0);
}
