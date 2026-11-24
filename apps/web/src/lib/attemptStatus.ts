import { parseQuantity, type Hex, type RpcClient } from '@ghostpay/chain-adapters';
import { addReplacement, attemptTxDigest, readAttempts, recordAttemptNonce, withAttemptJournal, type JournalAccess, type WalletAttempt } from './duplicateAttemptJournal';
import { UserFacingError } from './errors';
import { parseSeenTx, type SeenTx } from './wallet';

/** A mined receipt whose block is still canonical on the user's RPC. */
export interface MinedOutcome {
  readonly state: 'confirmed' | 'reverted';
  readonly blockNumber: bigint;
  readonly blockHash: Hex;
  readonly confirmations: bigint;
}
export type MismatchField = 'hash' | 'from' | 'to' | 'chainId' | 'txDigest' | 'nonce' | 'replacement';
/**
 * What the user's RPC says now about a recorded wallet attempt. Nothing here is inferred from elapsed time, and only a
 * canonical receipt of the exact recorded call counts as mined. `not-found` is not proof that nothing was broadcast.
 */
export type AttemptResolution =
  | { readonly state: 'no-hash' }
  | { readonly state: 'not-found'; readonly reorged: boolean }
  | { readonly state: 'pending'; readonly reorged: boolean; readonly nonce: number }
  | (MinedOutcome & { readonly nonce: number })
  | { readonly state: 'mismatch'; readonly field: MismatchField }
  | {
    readonly state: 'replaced'; readonly hash: Hex;
    /** `unknown-call`: the record predates call digests, so a speed-up and a cancel cannot be told apart. */
    readonly kind: 'same-call' | 'different-call' | 'unknown-call';
    readonly outcome: MinedOutcome | { readonly state: 'pending' };
  }
  | { readonly state: 'nonce-consumed'; readonly nonce: number; readonly accountNonce: bigint }
  | { readonly state: 'rpc-error' };

const HASH = /^0x[0-9a-f]{64}$/;

/** Thrown internally for any RPC answer that cannot be trusted; it always ends as `rpc-error`. */
class UnusableRpcAnswer extends Error {}
const unusable = (): never => { throw new UnusableRpcAnswer('unusable RPC answer'); };

interface Observed extends SeenTx {
  readonly nonceNumber: number;
  readonly inclusion?: { readonly blockNumber: bigint; readonly blockHash: Hex };
}
async function fetchTx(rpc: RpcClient, hash: string): Promise<Observed | undefined> {
  const raw = await rpc.request('eth_getTransactionByHash', [hash]);
  let seen: SeenTx | undefined;
  try { seen = parseSeenTx(raw); } catch { return unusable(); }
  if (seen === undefined) return undefined;
  if (seen.hash !== hash) return { ...seen, nonceNumber: -1 };
  const nonce = seen.nonce;
  if (!/^0x(?:[0-9a-f]{2})*$/.test(seen.input) || nonce === undefined || nonce > BigInt(Number.MAX_SAFE_INTEGER)) return unusable();
  const fields = raw as Record<string, unknown>;
  const block = fields['blockNumber'];
  const blockHash = fields['blockHash'];
  if (block === null && blockHash === null) return { ...seen, nonceNumber: Number(nonce) };
  if (typeof blockHash !== 'string' || !HASH.test(blockHash.toLowerCase())) return unusable();
  return { ...seen, nonceNumber: Number(nonce), inclusion: { blockHash: blockHash.toLowerCase() as Hex, blockNumber: parseQuantity(block) } };
}

interface Receipt { readonly status: 'confirmed' | 'reverted'; readonly blockNumber: bigint; readonly blockHash: Hex }
async function fetchReceipt(rpc: RpcClient, hash: string, tx?: Observed): Promise<Receipt | undefined> {
  const r = await rpc.request('eth_getTransactionReceipt', [hash]);
  if (r === null) return undefined;
  if (typeof r !== 'object' || Array.isArray(r)) return unusable();
  const o = r as Record<string, unknown>;
  const blockHash = o['blockHash'];
  if (typeof o['transactionHash'] !== 'string' || o['transactionHash'].toLowerCase() !== hash) return unusable();
  if (tx !== undefined) {
    const to = o['to'];
    if (tx.to === null ? to !== null : typeof to !== 'string' || to.toLowerCase() !== tx.to.toLowerCase()) return unusable();
  }
  if (typeof blockHash !== 'string' || !HASH.test(blockHash.toLowerCase())) return unusable();
  const status = parseQuantity(o['status']);
  if (status !== 0n && status !== 1n) return unusable();
  return { status: status === 1n ? 'confirmed' : 'reverted', blockNumber: parseQuantity(o['blockNumber']), blockHash: blockHash.toLowerCase() as Hex };
}

/** A receipt counts only while its block hash is the canonical one at that height; `undefined` means reorged. */
async function canonicalOutcome(rpc: RpcClient, receipt: Receipt, tx?: Observed): Promise<MinedOutcome | undefined> {
  const block = await rpc.getBlock(receipt.blockNumber);
  if (block === null || block.hash.toLowerCase() !== receipt.blockHash) return undefined;
  const head = await rpc.blockNumber();
  if (head < receipt.blockNumber) return unusable();
  if (tx !== undefined && (tx.inclusion?.blockHash !== receipt.blockHash || tx.inclusion.blockNumber !== receipt.blockNumber)) return unusable();
  return { state: receipt.status, blockNumber: receipt.blockNumber, blockHash: receipt.blockHash, confirmations: head - receipt.blockNumber + 1n };
}

async function accountNonce(rpc: RpcClient, account: string): Promise<bigint> {
  return parseQuantity(await rpc.request('eth_getTransactionCount', [account, 'latest']));
}

function digestOf(tx: Observed, chainId: number): string | undefined {
  return tx.to === null ? undefined : attemptTxDigest(chainId, tx.from, tx.to, tx.input, tx.value);
}

/** Compares an observed transaction with the record; returns the first differing field. */
function mismatchOf(attempt: WalletAttempt, hash: string, tx: Observed): MismatchField | undefined {
  if (tx.hash !== hash) return 'hash';
  if (tx.from.toLowerCase() !== attempt.account) return 'from';
  if (tx.chainId !== undefined && tx.chainId !== BigInt(attempt.chainId)) return 'chainId';
  if (attempt.txDigest !== undefined) {
    const digest = digestOf(tx, attempt.chainId);
    if (digest === undefined) return 'to';
    if (digest !== attempt.txDigest) return 'txDigest';
  } else if (tx.to === null) return 'to';
  if (attempt.nonce !== undefined && tx.nonceNumber !== attempt.nonce) return 'nonce';
  return undefined;
}

/** Same sender, same nonce and same chain as the record: the only thing that makes a hash its replacement. */
function replaces(attempt: WalletAttempt, nonce: number, hash: string, tx: Observed): boolean {
  return tx.hash === hash && tx.from.toLowerCase() === attempt.account && tx.nonceNumber === nonce &&
    (tx.chainId === undefined || tx.chainId === BigInt(attempt.chainId));
}

async function resolveReplacements(rpc: RpcClient, attempt: WalletAttempt, nonce: number): Promise<AttemptResolution | undefined> {
  let pending: AttemptResolution | undefined;
  for (const hash of attempt.replacements ?? []) {
    const tx = await fetchTx(rpc, hash);
    if (tx === undefined) continue;
    if (!replaces(attempt, nonce, hash, tx)) return { state: 'mismatch', field: 'replacement' };
    const kind = attempt.txDigest === undefined ? 'unknown-call' : digestOf(tx, attempt.chainId) === attempt.txDigest ? 'same-call' : 'different-call';
    const receipt = await fetchReceipt(rpc, hash, tx);
    const outcome = receipt === undefined ? undefined : await canonicalOutcome(rpc, receipt, tx);
    if (outcome !== undefined) return { state: 'replaced', hash: hash as Hex, kind, outcome };
    if (receipt !== undefined || tx.inclusion !== undefined) continue;
    pending ??= { state: 'replaced', hash: hash as Hex, kind, outcome: { state: 'pending' } };
  }
  return pending;
}

async function resolveSubmitted(rpc: RpcClient, attempt: WalletAttempt, hash: string, access: JournalAccess | undefined): Promise<AttemptResolution> {
  if (rpc.chainId !== attempt.chainId) return { state: 'rpc-error' };
  const tx = await fetchTx(rpc, hash);
  let reorged = false;
  let nonce = attempt.nonce;
  if (tx !== undefined) {
    const field = mismatchOf(attempt, hash, tx);
    if (field !== undefined) return { state: 'mismatch', field };
    nonce = tx.nonceNumber;
    if (attempt.nonce === undefined) {
      // Best effort: the nonce is what later lets a linked replacement be verified. A failed save changes no answer.
      try { await recordAttemptNonce(hash, nonce, attempt, access); } catch { /* The resolution below stands on its own. */ }
    }
    const receipt = await fetchReceipt(rpc, hash, tx);
    if (receipt !== undefined) {
      const outcome = await canonicalOutcome(rpc, receipt, tx);
      if (outcome !== undefined) return { ...outcome, nonce };
      reorged = true;
    } else if (tx.inclusion !== undefined) return unusable();
    if (await accountNonce(rpc, attempt.account) <= BigInt(nonce)) return { state: 'pending', reorged, nonce };
  } else {
    const receipt = await fetchReceipt(rpc, hash);
    if (receipt !== undefined) {
      // A canonical receipt whose transaction the RPC will not return cannot be compared with the request.
      if (await canonicalOutcome(rpc, receipt) !== undefined) return unusable();
      reorged = true;
    }
  }
  if (nonce === undefined) return { state: 'not-found', reorged };
  const replaced = await resolveReplacements(rpc, attempt, nonce);
  if (replaced !== undefined) return replaced;
  const latest = await accountNonce(rpc, attempt.account);
  // Another transaction used this nonce, so this one can no longer be mined. Which one is for the wallet to show.
  if (latest > BigInt(nonce)) return { state: 'nonce-consumed', nonce, accountNonce: latest };
  return tx === undefined ? { state: 'not-found', reorged } : { state: 'pending', reorged, nonce };
}

/**
 * Asks the user's RPC (for the record's chain) what became of a recorded attempt. Read-only on the chain; it only saves
 * the observed nonce once into the journal. Any malformed, inconsistent or throwing answer is `rpc-error`.
 */
export async function resolveAttempt(rpc: RpcClient, attempt: WalletAttempt, opts: { readonly access?: JournalAccess } = {}): Promise<AttemptResolution> {
  if (attempt.hash === undefined) return { state: 'no-hash' };
  try {
    return await resolveSubmitted(rpc, attempt, attempt.hash, opts.access);
  } catch {
    return { state: 'rpc-error' };
  }
}

const invalid = (): never => { throw new UserFacingError({ key: 'error.attemptStatus.replacementInvalid' }); };
const unverifiable = (): never => { throw new UserFacingError({ key: 'error.attemptStatus.replacementUnverifiable' }); };

/**
 * Links a hash the user copied from their wallet (speed-up or cancel) to a submitted record, only after the RPC shows it
 * from the same account, with the same nonce, on the same chain. The original's nonce is read first when not recorded.
 */
export async function linkReplacement(attemptId: string, replacementHash: string, rpc: RpcClient, access?: JournalAccess): Promise<WalletAttempt> {
  const hash = typeof replacementHash === 'string' ? replacementHash.trim().toLowerCase() : '';
  if (!HASH.test(hash)) throw new UserFacingError({ key: 'error.attemptStatus.replacementHashFormat' });
  const record = readAttempts(access?.storage).find((a) => a.id === attemptId);
  const original = record?.hash;
  if (record === undefined || original === undefined) throw new UserFacingError({ key: 'error.attemptStatus.replacementRecordChanged' });
  if (hash === original || rpc.chainId !== record.chainId) return invalid();
  let nonce = record.nonce;
  try {
    if (nonce === undefined) {
      const tx = await fetchTx(rpc, original);
      if (tx === undefined) return unverifiable();
      if (mismatchOf(record, original, tx) !== undefined) return invalid();
      nonce = tx.nonceNumber;
    }
    const replacement = await fetchTx(rpc, hash);
    if (replacement === undefined) return unverifiable();
    if (!replaces(record, nonce, hash, replacement)) return invalid();
  } catch (e) {
    if (e instanceof UserFacingError) throw e;
    return unverifiable();
  }
  const verifiedNonce = nonce;
  return withAttemptJournal((store) => addReplacement(attemptId, original, verifiedNonce, hash, store), access);
}

// i18n-use: error.attemptStatus.replacementInvalid error.attemptStatus.replacementUnverifiable error.attemptStatus.replacementHashFormat error.attemptStatus.replacementRecordChanged
