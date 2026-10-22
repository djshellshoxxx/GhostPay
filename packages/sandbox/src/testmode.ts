import { SandboxError } from './errors.js';

/** First chain id reserved for GhostPay test mode (the conventional hardhat/anvil id). */
export const TEST_CHAIN_ID_MIN = 31337;
/** Last chain id reserved for GhostPay test mode (inclusive). */
export const TEST_CHAIN_ID_MAX = 31399;
/** Default sandbox chain id. */
export const DEFAULT_TEST_CHAIN_ID = TEST_CHAIN_ID_MIN;
/** Marker that every test invoice memo must start with. */
export const TEST_MEMO_PREFIX = '[TEST - NO REAL FUNDS] ';
/** Human-visible banner text for UIs rendering a test invoice. */
export const TEST_BANNER = 'TEST MODE: this invoice uses a sandbox chain and no real funds.';

/**
 * Whether a chain id is in the reserved test range.
 *
 * @remarks Live UIs and relayers should REFUSE ids in this range unless they are
 * explicitly in test mode, and sandbox tooling refuses ids outside it.
 * @security Chain-id based separation is a convention: a live deployment must also
 * denylist the range, or a test invoice could be shown next to live ones.
 */
export function isTestChainId(chainId: number): boolean {
  return Number.isSafeInteger(chainId) && chainId >= TEST_CHAIN_ID_MIN && chainId <= TEST_CHAIN_ID_MAX;
}

/** Minimal invoice view needed to judge test mode. */
export interface TestModeSubject {
  readonly chainId: number;
  readonly memo?: string | undefined;
}

/**
 * True only if the invoice is on a reserved chain id AND carries the TEST memo marker.
 * Both conditions are required so a stripped memo or a rewritten chain id is not accepted as test.
 */
export function isTestInvoice(inv: TestModeSubject): boolean {
  return isTestChainId(inv.chainId) && typeof inv.memo === 'string' && inv.memo.startsWith(TEST_MEMO_PREFIX);
}

/**
 * Throws unless the invoice is a branded test invoice.
 * @throws {SandboxError} `NOT_TEST_INVOICE`.
 * @security Use before sending sandbox-only actions (faucet, fault injection) against an invoice.
 */
export function assertTestInvoice(inv: TestModeSubject): void {
  if (!isTestInvoice(inv)) throw new SandboxError('NOT_TEST_INVOICE', 'invoice is not a branded test invoice');
}

/**
 * Throws if the invoice looks like a live one but is being used with the sandbox, i.e. it is
 * NOT on a reserved chain id.
 * @throws {SandboxError} `NOT_TEST_CHAIN`.
 */
export function assertTestChainId(chainId: number): void {
  if (!isTestChainId(chainId)) throw new SandboxError('NOT_TEST_CHAIN', 'chain id is outside the reserved test range');
}

/**
 * Applies test branding to invoice input: forces a reserved chain id check and prefixes the memo.
 *
 * @param input Invoice creation input (any object with chainId and optional memo).
 * @returns A copy with the TEST memo prefix (idempotent), memo capped at 500 code points.
 * @throws {SandboxError} `NOT_TEST_CHAIN` if the chain id is not in the reserved range.
 */
export function brandAsTest<T extends TestModeSubject>(input: T): T & { readonly memo: string } {
  assertTestChainId(input.chainId);
  const base = input.memo === undefined || input.memo === '' ? 'sandbox' : input.memo;
  const memo = base.startsWith(TEST_MEMO_PREFIX) ? base : TEST_MEMO_PREFIX + base;
  return { ...input, memo: [...memo].slice(0, 500).join('') };
}
