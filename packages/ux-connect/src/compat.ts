/**
 * Smart-contract wallet compatibility: account classification, capability
 * matrix and payment-path decisions. Pure; all chain data (eth_getCode result,
 * wallet profile table) is injected by the caller.
 *
 * UNVERIFIED: no real Safe / 4337 / EIP-7702 wallet was exercised. Flags come
 * from an injected table that the host app must maintain and test on devices.
 */
import { err, isBytes32, isRecord, ok, type Result } from './hex.js';

/** Result of classifying `eth_getCode`. */
export type AccountKind = 'eoa' | 'contract' | 'delegated-eoa' | 'invalid';

/**
 * Classify the bytecode returned by eth_getCode.
 * "0x" and "0x0" are EOAs (SMART-4). EIP-7702 delegation designators
 * (0xef0100 + 20 bytes) are EOAs that can still ecrecover. Malformed input is
 * "invalid" (never silently an EOA).
 */
export function classifyAccount(code: unknown): AccountKind {
  if (typeof code !== 'string' || !/^0x[0-9a-fA-F]*$/.test(code)) return 'invalid';
  const body = code.slice(2).toLowerCase();
  if (body === '' || body === '0') return 'eoa';
  if (body.length % 2 !== 0) return 'invalid';
  if (body.length === 46 && body.startsWith('ef0100')) return 'delegated-eoa';
  return 'contract';
}

/** True only for a deployed contract account (not 7702-delegated, not invalid). */
export function isContractAccount(code: unknown): boolean {
  return classifyAccount(code) === 'contract';
}

/** Tri-state capability flag; "unknown" is treated as "no" for decisions. */
export type Tri = boolean | 'unknown';

/** One row of the injected compatibility matrix. */
export interface WalletProfile {
  /** Stable id, lowercase [a-z0-9._-]. */
  readonly id: string;
  /** EIP-6963 rdns, if known (matched exactly, case-insensitive). */
  readonly rdns?: string;
  readonly name: string;
  readonly kind: 'eoa' | 'hardware-eoa' | 'contract' | 'unknown';
  /** Signs via EIP-1271 isValidSignature. */
  readonly eip1271: Tri;
  /** ERC-4337 account (user operations). */
  readonly eip4337: Tri;
  /** EIP-5792 wallet_sendCalls batching. */
  readonly eip5792: Tri;
  /** eth_signTypedData_v4 supported. */
  readonly typedDataV4: Tri;
  /** Transactions may need other parties before they are mined. */
  readonly asyncConfirmation: Tri;
}

const PROFILE_KINDS = new Set(['eoa', 'hardware-eoa', 'contract', 'unknown']);
const TRI_KEYS = ['eip1271', 'eip4337', 'eip5792', 'typedDataV4', 'asyncConfirmation'] as const;

/** Validate an injected matrix (shape, duplicate ids / rdns). */
export function validateMatrix(input: unknown): Result<readonly WalletProfile[]> {
  if (!Array.isArray(input)) return err('matrix must be an array');
  const ids = new Set<string>();
  const rdnss = new Set<string>();
  const out: WalletProfile[] = [];
  for (const row of input as unknown[]) {
    if (!isRecord(row)) return err('profile must be an object');
    const { id, rdns, name, kind } = row;
    if (typeof id !== 'string' || !/^[a-z0-9._-]{1,64}$/.test(id)) return err('bad profile id');
    if (ids.has(id)) return err(`duplicate id ${id}`);
    ids.add(id);
    if (typeof name !== 'string' || name.length === 0 || name.length > 80) return err(`bad name for ${id}`);
    if (typeof kind !== 'string' || !PROFILE_KINDS.has(kind)) return err(`bad kind for ${id}`);
    let rd: string | undefined;
    if (rdns !== undefined) {
      if (typeof rdns !== 'string' || !/^[a-z0-9.-]{3,128}$/i.test(rdns)) return err(`bad rdns for ${id}`);
      rd = rdns.toLowerCase();
      if (rdnss.has(rd)) return err(`duplicate rdns ${rd}`);
      rdnss.add(rd);
    }
    const tri: Record<string, Tri> = {};
    for (const k of TRI_KEYS) {
      const t = row[k];
      if (t !== true && t !== false && t !== 'unknown') return err(`bad flag ${k} for ${id}`);
      tri[k] = t;
    }
    out.push({
      id,
      ...(rd !== undefined ? { rdns: rd } : {}),
      name,
      kind: kind as WalletProfile['kind'],
      eip1271: tri['eip1271'] as Tri,
      eip4337: tri['eip4337'] as Tri,
      eip5792: tri['eip5792'] as Tri,
      typedDataV4: tri['typedDataV4'] as Tri,
      asyncConfirmation: tri['asyncConfirmation'] as Tri,
    });
  }
  return ok(out);
}

/** Look up a profile by rdns (exact, case-insensitive). Never fuzzy-matches names. */
export function lookupProfile(
  matrix: readonly WalletProfile[],
  rdns: string | undefined,
): WalletProfile | undefined {
  if (rdns === undefined) return undefined;
  const k = rdns.toLowerCase();
  return matrix.find((p) => p.rdns === k);
}

/** Payment path. */
export type PayPath = 'permit' | 'approve' | 'direct';

/**
 * Decide the payment path (SMART-1). Contract wallets never get "permit":
 * ERC-2612 verification in this app is ecrecover based. Native-asset payments
 * need no allowance ("direct").
 */
export function choosePath(info: { isContract: boolean; tokenPermit: boolean; native?: boolean }): PayPath {
  if (info.native === true) return 'direct';
  if (info.isContract) return 'approve';
  return info.tokenPermit ? 'permit' : 'approve';
}

/** How long to wait for a receipt. */
export interface PollPolicy {
  /** null = never fail on timeout (SMART-2). */
  readonly timeoutMs: number | null;
  readonly intervalMs: number;
  readonly label: 'awaiting-signers' | 'confirming';
  /** The user may always stop waiting (does not cancel the on-chain tx). */
  readonly cancellable: true;
}

/** Poll policy. `eoaTimeoutMs` must be a positive safe integer. */
export function pollPolicy(isContract: boolean, eoaTimeoutMs = 180_000): PollPolicy {
  if (!Number.isSafeInteger(eoaTimeoutMs) || eoaTimeoutMs <= 0)
    throw new RangeError('eoaTimeoutMs must be a positive integer');
  return isContract
    ? { timeoutMs: null, intervalMs: 15_000, label: 'awaiting-signers', cancellable: true }
    : { timeoutMs: eoaTimeoutMs, intervalMs: 3_000, label: 'confirming', cancellable: true };
}

/** What a multisig / 4337 wallet handed back after "sending". */
export type PendingRefKind = 'txHash' | 'safeTxHash' | 'userOpHash';
export interface PendingRef {
  readonly kind: PendingRefKind;
  readonly hash: string;
}

/**
 * Validate a submission reference. Only a "txHash" can be fed to the existing
 * receipt/verifySubmission check; the other kinds identify an off-chain
 * proposal and must first be resolved to a tx hash (SMART-3: never treat them
 * as proof of payment).
 */
export function parsePendingRef(kind: PendingRefKind, hash: unknown): Result<PendingRef> {
  if (!isBytes32(hash)) return err('hash must be 32 bytes');
  return ok({ kind, hash: hash.toLowerCase() });
}

/** True when the reference can be verified directly on chain. */
export const isVerifiable = (ref: PendingRef): boolean => ref.kind === 'txHash';

/** Observation fed to {@link evaluateWait}. */
export interface WaitObservation {
  readonly receipt: 'none' | 'success' | 'reverted';
  /** User pressed "stop waiting". */
  readonly userStopped?: boolean;
  /** Wallet reported the proposal rejected / replaced. */
  readonly dropped?: boolean;
}
export type WaitState =
  'waiting' | 'awaiting-signers' | 'confirmed' | 'reverted' | 'stopped' | 'dropped' | 'timed-out';

/** Pure wait-state transition for a pending payment. */
export function evaluateWait(policy: PollPolicy, elapsedMs: number, obs: WaitObservation): WaitState {
  if (obs.receipt === 'success') return 'confirmed';
  if (obs.receipt === 'reverted') return 'reverted';
  if (obs.dropped === true) return 'dropped';
  if (obs.userStopped === true) return 'stopped';
  if (policy.timeoutMs !== null && elapsedMs >= policy.timeoutMs) return 'timed-out';
  return policy.label === 'awaiting-signers' ? 'awaiting-signers' : 'waiting';
}

export type CompatWarning =
  | 'invalid-code'
  | 'profile-kind-mismatch'
  | 'unknown-wallet'
  | 'delegated-account'
  | 'no-typed-data'
  | 'two-transactions';

/** Full assessment shown before paying. */
export interface CompatReport {
  readonly accountKind: AccountKind;
  readonly path: PayPath;
  readonly poll: PollPolicy;
  readonly profile: WalletProfile | undefined;
  /** Wallet may offer one batched approve+pay (EIP-5792). Informational; UNVERIFIED. */
  readonly canBatch: boolean;
  readonly warnings: readonly CompatWarning[];
}

/**
 * Combine on-chain code (authoritative) with an injected profile (advisory).
 * Chain data wins on conflict; invalid code falls back to the safe "approve"
 * path, which works for every account type.
 */
export function assessAccount(input: {
  code: unknown;
  rdns?: string;
  matrix: readonly WalletProfile[];
  token: { permit: boolean; native?: boolean };
}): CompatReport {
  const kind = classifyAccount(input.code);
  const profile = lookupProfile(input.matrix, input.rdns);
  const warnings: CompatWarning[] = [];
  const isContract = kind === 'contract' || kind === 'invalid';
  if (kind === 'invalid') warnings.push('invalid-code');
  if (kind === 'delegated-eoa') warnings.push('delegated-account');
  if (profile === undefined) warnings.push('unknown-wallet');
  else {
    if (
      (profile.kind === 'contract') !== (kind === 'contract') &&
      kind !== 'invalid' &&
      profile.kind !== 'unknown'
    )
      warnings.push('profile-kind-mismatch');
    if (profile.typedDataV4 !== true && input.token.permit && !isContract) warnings.push('no-typed-data');
  }
  const permitOk = input.token.permit && (profile === undefined || profile.typedDataV4 === true);
  const path = choosePath({
    isContract,
    tokenPermit: permitOk,
    ...(input.token.native !== undefined ? { native: input.token.native } : {}),
  });
  if (path === 'approve') warnings.push('two-transactions');
  return {
    accountKind: kind,
    path,
    poll: pollPolicy(isContract),
    profile,
    canBatch: path === 'approve' && profile?.eip5792 === true,
    warnings,
  };
}
