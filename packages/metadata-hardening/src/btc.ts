import { assertBtcTestnet, MetadataHardeningError, requireInput, shuffle, type RandomSource } from './guard.js';

/** Default dust limit (sat) for a P2WPKH-class output. */
export const DEFAULT_DUST_SATS = 546n;
/** BIP-125 default RBF-signalling sequence. */
export const SEQUENCE_RBF = 0xffff_fffd;
/** Final sequence without RBF. */
export const SEQUENCE_FINAL_NO_RBF = 0xffff_fffe;
const LOCKTIME_THRESHOLD = 500_000_000;

/** Result of {@link planChange}. */
export interface ChangePlan {
  readonly changeSats: bigint;
  readonly hasChange: boolean;
  /** Sub-dust remainder folded into the fee (only when no change output). */
  readonly dustToFeeSats: bigint;
}

/**
 * MH-BTC-1: decides the change output. Funds above amount + fee + dust REQUIRE a change address;
 * a sub-dust remainder is folded into the fee; the change address may not equal an input address.
 *
 * @remarks Does NOT hide which output is change by value-pattern heuristics, nor common-input
 * ownership. A BIP-352 label-0 change address must never be handed to payers (R2).
 *
 * @throws {MetadataHardeningError} `INVALID_INPUT` (missing change address, reuse, negative left-over).
 */
export function planChange(opts: {
  readonly network: string;
  readonly inputTotalSats: bigint;
  readonly amountSats: bigint;
  readonly feeSats: bigint;
  readonly dustSats?: bigint;
  readonly changeAddress?: string;
  readonly inputAddresses?: readonly string[];
}): ChangePlan {
  assertBtcTestnet(opts.network);
  const dust = opts.dustSats ?? DEFAULT_DUST_SATS;
  requireInput(opts.amountSats > 0n && opts.feeSats >= 0n && dust >= 0n, 'amounts out of range');
  const left = opts.inputTotalSats - opts.amountSats - opts.feeSats;
  requireInput(left >= 0n, 'inputs do not cover amount and fee');
  if (left <= dust) return { changeSats: 0n, hasChange: false, dustToFeeSats: left };
  requireInput(opts.changeAddress !== undefined && opts.changeAddress !== '', 'change address required');
  requireInput(!(opts.inputAddresses ?? []).includes(opts.changeAddress), 'change address must not reuse an input address');
  return { changeSats: left, hasChange: true, dustToFeeSats: 0n };
}

/**
 * MH-BTC-2: rounds a fee rate (sat/vB) UP to a grid, never below `minRate`, never above `cap`.
 *
 * @remarks Hides wallet estimator fingerprint (magnitude unverified). Cost: overpay up to one step.
 * @throws {MetadataHardeningError} `POLICY_REJECTED` when the normalised rate would exceed `cap`.
 */
export function normalizeFeeRate(
  network: string,
  rate: number,
  opts: { readonly step?: number; readonly minRate?: number; readonly cap?: number } = {},
): number {
  assertBtcTestnet(network);
  const step = opts.step ?? 1;
  const minRate = opts.minRate ?? 1;
  requireInput(Number.isFinite(rate) && rate > 0 && Number.isFinite(step) && step > 0 && Number.isFinite(minRate) && minRate > 0, 'rate out of range');
  let r = Math.ceil(rate / step) * step;
  if (r < rate) r += step;
  if (r < minRate) r = Math.ceil(minRate / step) * step;
  if (opts.cap !== undefined && r > opts.cap) {
    if (rate > opts.cap) throw new MetadataHardeningError('POLICY_REJECTED', 'fee rate exceeds the cap');
    return opts.cap;
  }
  return r;
}

/**
 * MH-BTC-3: nLockTime choice. `zero` is today's behaviour; `height` uses a chain height the caller
 * already knows (from the scanner; do not make a new RPC call for it).
 *
 * @remarks Conflicts with PayJoin unless the counterparty keeps it unchanged (BIP-78). Default OFF.
 */
export function chooseLocktime(network: string, mode: 'zero' | 'height', knownHeight?: number): number {
  assertBtcTestnet(network);
  if (mode === 'zero') return 0;
  requireInput(knownHeight !== undefined && Number.isInteger(knownHeight) && knownHeight >= 0 && knownHeight < LOCKTIME_THRESHOLD, 'height out of range');
  return knownHeight;
}

/**
 * MH-BTC-3 R2: a non-zero locktime is ineffective unless at least one input sequence is non-final.
 *
 * @throws {MetadataHardeningError} `CONFLICT` if locktime > 0 and every sequence is 0xffffffff.
 */
export function assertLocktimeEffective(locktime: number, sequences: readonly number[]): void {
  if (locktime > 0 && sequences.every((s) => s === 0xffff_ffff)) {
    throw new MetadataHardeningError('CONFLICT', 'locktime is ignored when all inputs are final');
  }
}

/**
 * MH-BTC-4: input sequence. Default `0xfffffffd` (signals RBF, BIP-125). Opting out needs
 * `acknowledgeUnusual: true`; the result then carries a warning.
 */
export function chooseSequence(
  network: string,
  opts: { readonly rbf?: boolean; readonly acknowledgeUnusual?: boolean } = {},
): { sequence: number; warning?: string } {
  assertBtcTestnet(network);
  if (opts.rbf !== false) return { sequence: SEQUENCE_RBF };
  if (opts.acknowledgeUnusual !== true) {
    throw new MetadataHardeningError('POLICY_REJECTED', 'disabling RBF needs an explicit acknowledgement');
  }
  return { sequence: SEQUENCE_FINAL_NO_RBF, warning: 'Transactions that do not signal RBF are unusual and easier to single out.' };
}

/** MH-BTC-4 R2: all inputs must carry one identical sequence (BIP-78 checks this). */
export function assertUniformSequences(sequences: readonly number[]): void {
  if (sequences.length > 0 && sequences.some((s) => s !== sequences[0])) {
    throw new MetadataHardeningError('CONFLICT', 'input sequences differ');
  }
}

/** Input identity for ordering. `txid` is the display (reversed-byte) hex. */
export interface OrderableInput {
  readonly txid: string;
  readonly vout: number;
}
/** Output identity for ordering. `scriptPubKey` is hex. */
export interface OrderableOutput {
  readonly amountSats: bigint;
  readonly scriptPubKey: string;
}

/** Ordering strategy: BIP-69, CSPRNG shuffle, or none (caller order, deterministic tests). */
export type OrderStrategy = 'bip69' | 'shuffle' | 'none';

/** Ordered result with the permutation applied (`order[i]` = original index now at position i). */
export interface Ordered<T> {
  readonly items: T[];
  readonly order: number[];
}

function cmpStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function apply<T>(items: readonly T[], strategy: OrderStrategy, cmp: (a: T, b: T) => number, rng?: RandomSource): Ordered<T> {
  const idx = items.map((_, i) => i);
  let order: number[];
  if (strategy === 'none') order = idx;
  else if (strategy === 'shuffle') order = shuffle(idx, rng);
  else order = idx.slice().sort((a, b) => cmp(items[a] as T, items[b] as T) || a - b);
  return { items: order.map((i) => items[i] as T), order };
}

/**
 * MH-BTC-5: orders inputs. BIP-69: txid (reversed-byte hex, lowercase) ascending then vout.
 *
 * @remarks Safe for BIP-352: the sender's shared secret depends on the smallest outpoint, which is
 * order-independent. Hides the wallet-specific ordering fingerprint only.
 */
export function orderInputs<T extends OrderableInput>(network: string, inputs: readonly T[], strategy: OrderStrategy, rng?: RandomSource): Ordered<T> {
  assertBtcTestnet(network);
  for (const i of inputs) {
    requireInput(/^[0-9a-fA-F]{64}$/.test(i.txid) && Number.isInteger(i.vout) && i.vout >= 0, 'bad input');
  }
  return apply(inputs, strategy, (a, b) => cmpStr(a.txid.toLowerCase(), b.txid.toLowerCase()) || a.vout - b.vout, rng);
}

/**
 * MH-BTC-5: orders outputs. BIP-69: amount ascending, then scriptPubKey bytes lexicographically.
 *
 * @remarks Use `order` to map payment-output metadata (e.g. silent-payment recipients) back.
 * Hides "payment first, change last"; not amount/script-type heuristics.
 */
export function orderOutputs<T extends OrderableOutput>(network: string, outputs: readonly T[], strategy: OrderStrategy, rng?: RandomSource): Ordered<T> {
  assertBtcTestnet(network);
  for (const o of outputs) {
    requireInput(o.amountSats >= 0n && /^([0-9a-fA-F]{2})*$/.test(o.scriptPubKey), 'bad output');
  }
  return apply(
    outputs,
    strategy,
    (a, b) => (a.amountSats < b.amountSats ? -1 : a.amountSats > b.amountSats ? 1 : cmpStr(a.scriptPubKey.toLowerCase(), b.scriptPubKey.toLowerCase())),
    rng,
  );
}

/** One PSBT key-value record as plain data. */
export interface PsbtRecord {
  readonly keyType: number;
  /** Hex key data after the type byte. */
  readonly key: string;
  readonly value: string;
}
/** PSBT as plain maps (v0 or v2 record numbers). */
export interface PlainPsbt {
  readonly global: readonly PsbtRecord[];
  readonly inputs: readonly (readonly PsbtRecord[])[];
  readonly outputs: readonly (readonly PsbtRecord[])[];
}

// Record numbers per BIP-174 / BIP-370 / BIP-371 as recalled; checked against the BIPs: UNVERIFIED.
const GLOBAL_KEEP = new Set([0x00, 0x02, 0x03, 0x04, 0x05, 0x06, 0xfb]);
const INPUT_KEEP = new Set([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x07, 0x08, 0x0e, 0x0f, 0x10, 0x11, 0x12, 0x13, 0x14, 0x15, 0x17, 0x18]);
const OUTPUT_KEEP = new Set([0x00, 0x01, 0x03, 0x04, 0x05, 0x06]);

/**
 * MH-BTC-6: strips wallet-identifying PSBT records (global xpubs, BIP-32 and taproot derivation
 * paths, proprietary and unknown records) before sharing with a coordinator or counterparty.
 *
 * @remarks Allowlist: everything not known to be needed is dropped. Does NOT hide the transaction
 * once broadcast. A stripped PSBT cannot be signed by a signer that needs derivation paths.
 */
export function stripPsbtFingerprints(network: string, psbt: PlainPsbt): { psbt: PlainPsbt; removed: number } {
  assertBtcTestnet(network);
  let removed = 0;
  const keep = (recs: readonly PsbtRecord[], allow: Set<number>): PsbtRecord[] =>
    recs.filter((r) => {
      const ok = allow.has(r.keyType);
      if (!ok) removed++;
      return ok;
    });
  return {
    psbt: {
      global: keep(psbt.global, GLOBAL_KEEP),
      inputs: psbt.inputs.map((r) => keep(r, INPUT_KEEP)),
      outputs: psbt.outputs.map((r) => keep(r, OUTPUT_KEEP)),
    },
    removed,
  };
}
