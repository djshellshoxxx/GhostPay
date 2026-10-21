import { encodeFunctionData, getAddress, zeroAddress, type Address, type Hex } from 'viem';
import { poolAbi } from './abi.js';
import { assertPoolChain } from './chain.js';
import { estimatePoolCrowd } from './crowd.js';
import { PoolSdkError, fail } from './errors.js';
import { assertValue } from './field.js';
import { buildRagequitInputs, buildWithdrawInputs, expectedWithdrawSignals, type RagequitCircuitInputs, type WithdrawCircuitInputs } from './inputs.js';
import { deriveNoteSecrets, noteCommitment, nullifierHash, precommitment, type Note, type NoteSecrets, type WithSeed } from './notes.js';
import type { SyncedPool } from './sync.js';
import { contextOf, maxFee, type Withdrawal } from './withdrawal.js';
import type { WithdrawProofCalldata } from './wire.js';

/** Calldata and bookkeeping for a deposit. */
export interface DepositPlan {
  readonly precommitment: bigint;
  /** `deposit(value, precommitment)` calldata. Native pools also send `value` as `msg.value`. */
  readonly data: Hex;
  readonly index: number;
}

/**
 * Plans a deposit of `value` using derivation index `index`.
 *
 * @security The deposit is public (N2) and links the depositing address to the pool.
 */
export function planDeposit(withSeed: WithSeed, chainId: number, pool: Address, index: number, value: bigint): DepositPlan {
  assertValue(value, 'value');
  const pre = precommitment(deriveNoteSecrets(withSeed, chainId, pool, index));
  return { precommitment: pre, index, data: encodeFunctionData({ abi: poolAbi, functionName: 'deposit', args: [value, pre] }) };
}

/** Submitter of a withdrawal. */
export type SubmitterPlan =
  | { readonly kind: 'relayer'; readonly relayer: Address; readonly feeTo: Address; readonly fee: bigint }
  | { readonly kind: 'self'; readonly submitter: Address };

/** Association-set choice. */
export type AspPlan = { readonly kind: 'none' } | { readonly kind: 'publisher'; readonly publisher: Address; readonly labels: readonly bigint[] };

/** Arguments of {@link prepareWithdrawal}. */
export interface PrepareWithdrawArgs {
  readonly option: 'SP-EXIT' | 'SP-PAY';
  readonly withSeed: WithSeed;
  readonly synced: SyncedPool;
  readonly note: Note;
  /** `pool.SCOPE()`. */
  readonly scope: bigint;
  readonly withdrawnValue: bigint;
  /** SP-EXIT: fresh destination `D_i`. SP-PAY: the seller's one-time stealth address `S1`. */
  readonly recipient: Address;
  readonly submitter: SubmitterPlan;
  readonly asp: AspPlan;
  readonly deadline: bigint;
  /** Derivation index for the change note (a never-used index, see `recoverNotes().nextIndex`). */
  readonly newIndex: number;
  /** SP-PAY only: output of `buildSpPayAnnounce`. SP-EXIT must leave this undefined. */
  readonly announce?: Hex;
  /** SP-EXIT: addresses the recipient must not equal (known `S1`s, used destinations, the payer). */
  readonly forbiddenRecipients?: readonly Address[];
  /** Pool `MAX_RELAYER_FEE_BPS` (default 1000). */
  readonly maxFeeBps?: bigint;
  /** Minimum crowd before the second confirmation (default 50). */
  readonly minCrowd?: number;
  /** The user explicitly confirmed a small crowd (SP-SDK-6). */
  readonly crowdConfirmed?: boolean;
  /** Crowd window (default 72 hours). */
  readonly crowdWindowSec?: number;
  readonly blockTimeSec?: number;
}

/** Output of {@link prepareWithdrawal}. */
export interface PreparedWithdrawal {
  readonly withdrawal: Withdrawal;
  readonly context: bigint;
  /** Witness input for the local prover; contains secrets. */
  readonly inputs: WithdrawCircuitInputs;
  readonly expectedSignals: bigint[];
  /** Change note (value = remaining), valid once the withdrawal is mined and its leaf index is synced. */
  readonly changeNote: Note;
  readonly crowd: { deposits: number; label: string };
}

/**
 * Applies all client-side guards and builds the withdrawal, context and witness input.
 *
 * Guards: chain (`WRONG_CHAIN`), spent note (`NOTE_SPENT`), SP-EXIT recipient (`BAD_RECIPIENT`:
 * zero, the note's depositor, or a forbidden address), fee bound (`FEE_TOO_HIGH`), crowd gate
 * (`CROWD_TOO_SMALL`, SP-SDK-6), stale tree is the caller's `assertRootMatches` (`ROOT_MISMATCH`).
 *
 * @security `inputs` and `changeNote` hold spending secrets. Fees are chosen here and bound into the proof.
 */
export function prepareWithdrawal(a: PrepareWithdrawArgs): PreparedWithdrawal {
  assertPoolChain(a.synced.chainId);
  const { note } = a;
  if (note.spent === true || a.synced.isSpent(nullifierHash(note.nullifier))) fail('NOTE_SPENT', 'note is already spent');
  assertValue(a.withdrawnValue, 'withdrawnValue');
  const recipient = getAddress(a.recipient);
  if (recipient === zeroAddress || recipient === a.synced.pool) fail('BAD_RECIPIENT', 'recipient is not a valid destination');
  if (a.option === 'SP-EXIT') {
    if (a.announce !== undefined && a.announce !== '0x') fail('INVALID_INPUT', 'SP-EXIT must not carry an announcement');
    const dep = a.synced.deposits.find((d) => d.label === note.label);
    const bad = new Set<Address>((a.forbiddenRecipients ?? []).map((x) => getAddress(x)));
    if (dep !== undefined) bad.add(dep.depositor);
    if (bad.has(recipient)) fail('BAD_RECIPIENT', 'recipient is linked to the deposit or already used');
  } else if (a.announce === undefined || a.announce === '0x') {
    fail('INVALID_INPUT', 'SP-PAY needs an announcement');
  }
  const maxBps = a.maxFeeBps ?? 1000n;
  const fee = a.submitter.kind === 'relayer' ? a.submitter.fee : 0n;
  if (fee > maxFee(a.withdrawnValue, maxBps) || fee > a.withdrawnValue) fail('FEE_TOO_HIGH', 'relayer fee above the allowed maximum');
  const crowd = estimatePoolCrowd(a.synced, a.withdrawnValue, a.crowdWindowSec ?? 72 * 3600, a.blockTimeSec === undefined ? {} : { blockTimeSec: a.blockTimeSec });
  if (crowd.deposits < (a.minCrowd ?? 50) && a.crowdConfirmed !== true) fail('CROWD_TOO_SMALL', `only ${String(crowd.deposits)} possible sources; explicit confirmation required`);

  const withdrawal: Withdrawal = {
    recipient,
    relayer: a.submitter.kind === 'relayer' ? getAddress(a.submitter.relayer) : getAddress(a.submitter.submitter),
    relayerFee: fee,
    feeTo: a.submitter.kind === 'relayer' && fee > 0n ? getAddress(a.submitter.feeTo) : zeroAddress,
    deadline: a.deadline,
    aspPublisher: a.asp.kind === 'publisher' ? getAddress(a.asp.publisher) : zeroAddress,
    announce: a.option === 'SP-PAY' ? (a.announce as Hex) : '0x',
  };
  if (a.asp.kind === 'publisher' && withdrawal.aspPublisher === zeroAddress) fail('INVALID_INPUT', 'publisher is the zero address');
  const context = contextOf(withdrawal, a.scope);
  const newSecrets: NoteSecrets = deriveNoteSecrets(a.withSeed, a.synced.chainId, a.synced.pool, a.newIndex);
  const inputs = buildWithdrawInputs({
    note,
    tree: a.synced.tree,
    ...(a.asp.kind === 'publisher' ? { asp: { labels: a.asp.labels } } : {}),
    withdrawnValue: a.withdrawnValue,
    newNote: newSecrets,
    context,
  });
  const changeNote: Note = { chainId: note.chainId, pool: note.pool, index: a.newIndex, value: note.value - a.withdrawnValue, label: note.label, ...newSecrets };
  return { withdrawal, context, inputs, expectedSignals: expectedWithdrawSignals(inputs), changeNote, crowd };
}

/**
 * Checks the prover output against the expected public signals before anything is sent anywhere.
 *
 * @throws PoolSdkError `INVALID_INPUT` on any difference.
 */
export function assertSignals(expected: readonly bigint[], proof: WithdrawProofCalldata): void {
  if (expected.length !== proof.pubSignals.length || expected.some((e, i) => e !== proof.pubSignals[i])) fail('INVALID_INPUT', 'proof public signals differ from the request');
}

/** `withdraw(w, proof)` calldata (self-submit, or what the relayer sends). */
export function encodeWithdrawCall(w: Withdrawal, p: WithdrawProofCalldata): Hex {
  if (p.pubSignals.length !== 9) fail('INVALID_INPUT', 'withdraw proof needs 9 public signals');
  return encodeFunctionData({ abi: poolAbi, functionName: 'withdraw', args: [w, { pA: p.pA, pB: p.pB, pC: p.pC, pubSignals: p.pubSignals as unknown as readonly [bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint, bigint] }] });
}

/** `ragequit(proof)` calldata. */
export function encodeRagequitCall(p: WithdrawProofCalldata): Hex {
  if (p.pubSignals.length !== 4) fail('INVALID_INPUT', 'ragequit proof needs 4 public signals');
  return encodeFunctionData({ abi: poolAbi, functionName: 'ragequit', args: [{ pA: p.pA, pB: p.pB, pC: p.pC, pubSignals: p.pubSignals as unknown as readonly [bigint, bigint, bigint, bigint] }] });
}

/**
 * Prepares SP-RQ (public ragequit of the whole note by its original depositor).
 *
 * @security Public: re-links the note to the depositor (N7).
 */
export function prepareRagequit(note: Note): { inputs: RagequitCircuitInputs; expectedSignals: bigint[] } {
  assertPoolChain(note.chainId);
  if (note.spent === true) fail('NOTE_SPENT', 'note is already spent');
  return buildRagequitInputs(note);
}

/** Convenience: the leaf commitment of a note. */
export function commitmentOf(note: Note): bigint {
  return noteCommitment(note);
}

export { PoolSdkError };
