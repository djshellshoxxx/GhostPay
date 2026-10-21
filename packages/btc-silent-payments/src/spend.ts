import { schnorr } from '@noble/curves/secp256k1.js';
import { Address, NETWORK, OutScript, TEST_NETWORK, Transaction } from '@scure/btc-signer';
import type { SilentPaymentNetwork } from './address.js';
import { toHex } from './ecc.js';
import { fail } from './errors.js';
import { spendPrivateKey } from './receiver.js';
import { createSilentPaymentOutputs } from './sender.js';
import { zeroize, type SecretScalar } from './secret.js';

/** A detected silent-payment output the wallet can spend (key-path, BIP-341/BIP-352). */
export interface SpendableOutput {
  /** Funding txid, display (RPC / explorer) order hex. */
  readonly txid: string;
  readonly vout: number;
  readonly amountSats: bigint;
  /** 32-byte x-only output key (the scanner's `FoundOutput.xOnlyPublicKey`). */
  readonly xOnlyPublicKey: Uint8Array;
  /** `FoundOutput.spendTweak`; already includes the label tweak for labeled outputs (incl. change, m = 0). */
  readonly spendTweak: SecretScalar;
}

/** A payment: a regular bitcoin address or a silent payment address (`sp1` / `tsp1`). */
export interface SpendDestination {
  readonly address: string;
  /** Amount in satoshis. Omit on the single destination of a sweep. */
  readonly amountSats?: bigint;
}

/** Parameters of {@link buildSpendTransaction}. */
export interface BuildSpendParams {
  /** Outputs to sweep, at least one; all are spent. */
  readonly outputs: readonly SpendableOutput[];
  /** `b_spend`. */
  readonly spendSecret: SecretScalar;
  /** Payments. One destination with no `amountSats` = sweep everything (minus fee) to it, with no change. */
  readonly destinations: readonly SpendDestination[];
  /**
   * Fresh change address supplied by the caller: a regular address, or the wallet's own
   * silent payment change address (label 0, see `changeAddress()`), which is derived per transaction.
   * Required unless sweeping.
   */
  readonly changeAddress?: string;
  /** Fee rate in sat/vB (fractional allowed, e.g. 1.5). Caller-supplied; this package has no fee oracle. */
  readonly feeRate: number;
  readonly network: SilentPaymentNetwork;
  /** With `network: 'testnet'`: use `bcrt` instead of `tb` for regular addresses (bitcoind regtest). Default false. */
  readonly regtest?: boolean;
  /** Outputs and change below this are rejected / folded into the fee. Default 546. */
  readonly dustLimitSats?: bigint;
  /** Signal BIP-125 replaceability. Default true. */
  readonly rbf?: boolean;
}

/** Result of {@link buildSpendTransaction}. */
export interface SpendResult {
  /** Signed, not finalized PSBT (BIP-174) with `tapKeySig` set on every input. */
  readonly psbt: Uint8Array;
  /** Final network-serialized transaction. */
  readonly rawTx: Uint8Array;
  readonly txid: string;
  readonly feeSats: bigint;
  readonly vsize: number;
  /** Change amount, or 0n when there is no change output. */
  readonly changeSats: bigint;
  /** Output index of the change output, or `null`. */
  readonly changeIndex: number | null;
}

const DEFAULT_DUST = 546n;
/** Safety cap against fat-finger fee rates. */
export const MAX_FEE_RATE_SAT_PER_VB = 10_000;
const MAX_INPUTS = 5_000;
const P2TR_SCRIPT_LEN = 34;
const SATS_MAX = 21_000_000n * 100_000_000n;

function varintLen(n: number): number {
  return n < 0xfd ? 1 : n <= 0xffff ? 3 : 5;
}

/**
 * Virtual size of a transaction that spends `nInputs` P2TR key-path outputs with 64-byte
 * (SIGHASH_DEFAULT) signatures to outputs with the given scriptPubKey lengths. Exact, not an upper bound.
 */
export function estimateKeyPathVsize(nInputs: number, outputScriptLengths: readonly number[]): number {
  const nOut = outputScriptLengths.length;
  let weight = 4 * (4 + varintLen(nInputs) + varintLen(nOut) + 4) + 2; // version, counts, locktime; marker+flag
  weight += nInputs * (4 * 41 + 66); // outpoint 36 + empty scriptSig 1 + sequence 4; witness: count 1 + len 1 + sig 64
  for (const len of outputScriptLengths) weight += 4 * (8 + varintLen(len) + len);
  return Math.ceil(weight / 4);
}

function feeFor(feeRate: number, vsize: number): bigint {
  const milli = BigInt(Math.round(feeRate * 1000));
  return (milli * BigInt(vsize) + 999n) / 1000n;
}

function isSilentPaymentAddress(address: string): boolean {
  return /^t?sp1/i.test(address);
}

const REGTEST_NETWORK: typeof NETWORK = { ...TEST_NETWORK, bech32: 'bcrt' };

function btcNetwork(n: SilentPaymentNetwork, regtest = false): typeof NETWORK {
  if (n === 'mainnet') return NETWORK;
  return regtest ? REGTEST_NETWORK : TEST_NETWORK;
}

function scriptOf(address: string, network: SilentPaymentNetwork, regtest: boolean): Uint8Array {
  try {
    return OutScript.encode(Address(btcNetwork(network, regtest)).decode(address));
  } catch {
    return fail('INVALID_ADDRESS');
  }
}

function amount(v: bigint | undefined): bigint {
  if (typeof v !== 'bigint' || v <= 0n || v > SATS_MAX) return fail('INVALID_AMOUNT');
  return v;
}

interface PlannedOutput {
  readonly address: string;
  readonly isSp: boolean;
  readonly amountSats: bigint;
}

/**
 * Verifies the BIP-340 signature of every input of a finalized or PSBT-derived transaction
 * against the BIP-341 key-path sighash, using noble directly (independent of the signer's own check).
 *
 * @param rawTx Network-serialized transaction.
 * @param prevouts scriptPubKey (P2TR) and amount of every input, in input order.
 * @returns `true` when every input carries exactly one valid 64-byte signature for its output key.
 */
export function verifyKeyPathSpend(
  rawTx: Uint8Array,
  prevouts: readonly { readonly script: Uint8Array; readonly amountSats: bigint }[],
): boolean {
  const tx = Transaction.fromRaw(rawTx, { allowUnknownOutputs: true, allowUnknownInputs: true });
  if (tx.inputsLength !== prevouts.length) return false;
  const scripts = prevouts.map((p) => p.script);
  const amounts = prevouts.map((p) => p.amountSats);
  for (let i = 0; i < prevouts.length; i++) {
    const script = scripts[i];
    const witness = tx.getInput(i).finalScriptWitness;
    if (script === undefined || script.length !== P2TR_SCRIPT_LEN || witness?.length !== 1) return false;
    const sig = witness[0];
    if (sig?.length !== 64) return false;
    const digest = tx.preimageWitnessV1(i, scripts, 0, amounts);
    if (!schnorr.verify(sig, digest, script.subarray(2))) return false;
  }
  return true;
}

/** Parameters of {@link previewSweep}: everything {@link buildSpendTransaction} needs except secrets and outpoints. */
export interface PreviewSweepParams {
  /** Amounts of the outputs to sweep. */
  readonly inputAmountsSats: readonly bigint[];
  /** Regular address or silent payment address. */
  readonly address: string;
  readonly feeRate: number;
  readonly network: SilentPaymentNetwork;
  readonly regtest?: boolean;
  readonly dustLimitSats?: bigint;
}

/** Result of {@link previewSweep}. */
export interface SweepPreview {
  readonly vsize: number;
  readonly feeSats: bigint;
  /** Amount the destination receives. */
  readonly sendSats: bigint;
  readonly destinationIsSilentPayment: boolean;
}

/**
 * Pure, secret-free preview of a sweep (single destination, no change): the fee and amount that
 * {@link buildSpendTransaction} will produce for the same inputs, so a UI can show them BEFORE any
 * key is touched. Uses the same vsize and fee math and the same checks.
 *
 * @throws {SilentPaymentError} `INVALID_INPUT`, `INVALID_AMOUNT`, `INVALID_ADDRESS`, `FEE_TOO_HIGH`,
 * `INSUFFICIENT_FUNDS`, `DUST_OUTPUT`.
 * @security Public data only.
 */
export function previewSweep(p: PreviewSweepParams): SweepPreview {
  const n = p.inputAmountsSats.length;
  if (n === 0 || n > MAX_INPUTS) return fail('INVALID_INPUT');
  if (!Number.isFinite(p.feeRate) || p.feeRate <= 0) return fail('INVALID_INPUT');
  if (p.feeRate > MAX_FEE_RATE_SAT_PER_VB) return fail('FEE_TOO_HIGH');
  const dust = p.dustLimitSats ?? DEFAULT_DUST;
  if (dust < 0n) return fail('INVALID_INPUT');
  let total = 0n;
  for (const a of p.inputAmountsSats) total += amount(a);
  const isSp = isSilentPaymentAddress(p.address);
  const len = isSp ? P2TR_SCRIPT_LEN : scriptOf(p.address, p.network, p.regtest === true).length;
  const vsize = estimateKeyPathVsize(n, [len]);
  const feeSats = feeFor(p.feeRate, vsize);
  const sendSats = total - feeSats;
  if (sendSats <= 0n) return fail('INSUFFICIENT_FUNDS');
  if (sendSats < dust) return fail('DUST_OUTPUT');
  if (feeSats * 2n > total && feeSats > 10_000n) return fail('FEE_TOO_HIGH');
  return { vsize, feeSats, sendSats, destinationIsSilentPayment: isSp };
}

/**
 * Builds, signs and verifies a transaction that sweeps detected silent-payment outputs by
 * BIP-341 key-path spends.
 *
 * @remarks
 * Per input the private key is `b_spend + tweak` (the scanner's tweak already contains the label
 * tweak, so labeled and change outputs spend identically), negated when its public key has odd y
 * ({@link spendPrivateKey}), and used WITHOUT any further BIP-341 taproot tweak: the output key
 * of a silent payment is final. Sighash is SIGHASH_DEFAULT (64-byte signatures). Silent-payment
 * destinations and change are derived with BIP-352 over the spent inputs (all P2TR, hence eligible).
 * Fees: `ceil(feeRate * vsize)` with an exact vsize ({@link estimateKeyPathVsize}); change below the
 * dust limit is folded into the fee. After signing, every signature is verified with noble schnorr
 * and the vsize is checked against the estimate; any mismatch throws and nothing is returned.
 * Output order is destinations then change (callers wanting shuffling must build their own).
 * Hardware-wallet signing is out of scope. Regular addresses are `tb` for `testnet`, or `bcrt` when `regtest` is set.
 *
 * @param params See {@link BuildSpendParams}.
 * @returns Signed PSBT and final transaction.
 * @throws {SilentPaymentError} `INVALID_INPUT`, `INVALID_ADDRESS`, `INVALID_AMOUNT`, `DUST_OUTPUT`,
 * `INSUFFICIENT_FUNDS`, `FEE_TOO_HIGH`, `DERIVED_KEY_INVALID`, `SIGNATURE_INVALID`, and those of
 * {@link createSilentPaymentOutputs}.
 * @security Handles spending secrets; not constant-time; zeroization best-effort.
 */
export function buildSpendTransaction(params: BuildSpendParams): SpendResult {
  const { outputs, destinations, network } = params;
  const dust = params.dustLimitSats ?? DEFAULT_DUST;
  if (outputs.length === 0 || outputs.length > MAX_INPUTS || destinations.length === 0)
    return fail('INVALID_INPUT');
  if (!Number.isFinite(params.feeRate) || params.feeRate <= 0) return fail('INVALID_INPUT');
  if (params.feeRate > MAX_FEE_RATE_SAT_PER_VB) return fail('FEE_TOO_HIGH');
  if (dust < 0n) return fail('INVALID_INPUT');

  const seen = new Set<string>();
  let total = 0n;
  for (const o of outputs) {
    const id = `${o.txid.toLowerCase()}:${String(o.vout)}`;
    if (seen.has(id) || !/^[0-9a-fA-F]{64}$/.test(o.txid)) return fail('INVALID_INPUT');
    if (!Number.isInteger(o.vout) || o.vout < 0 || o.vout > 0xffffffff || o.xOnlyPublicKey.length !== 32) {
      return fail('INVALID_INPUT');
    }
    seen.add(id);
    total += amount(o.amountSats);
  }

  const sweep = destinations.length === 1 && destinations[0]?.amountSats === undefined;
  const planned: PlannedOutput[] = destinations.map((d) => ({
    address: d.address,
    isSp: isSilentPaymentAddress(d.address),
    amountSats: sweep ? 0n : amount(d.amountSats),
  }));
  const hasChangeSlot = !sweep && params.changeAddress !== undefined;
  const lenOf = (p: { address: string; isSp: boolean }): number =>
    p.isSp ? P2TR_SCRIPT_LEN : scriptOf(p.address, network, params.regtest === true).length;
  const destLens = planned.map(lenOf);
  const changeLen =
    params.changeAddress === undefined
      ? 0
      : lenOf({
          address: params.changeAddress,
          isSp: isSilentPaymentAddress(params.changeAddress),
        });

  const paid = planned.reduce((a, p) => a + p.amountSats, 0n);
  const vNoChange = estimateKeyPathVsize(outputs.length, destLens);
  const feeNoChange = feeFor(params.feeRate, vNoChange);
  let fee: bigint;
  let change = 0n;
  if (sweep) {
    fee = feeNoChange;
    const net = total - fee;
    if (net <= 0n) return fail('INSUFFICIENT_FUNDS');
    if (net < dust) return fail('DUST_OUTPUT');
    (planned[0] as { amountSats: bigint }).amountSats = net;
  } else {
    for (const p of planned) if (p.amountSats < dust) return fail('DUST_OUTPUT');
    if (total < paid + feeNoChange) return fail('INSUFFICIENT_FUNDS');
    const vChange = estimateKeyPathVsize(outputs.length, [...destLens, changeLen]);
    const feeChange = feeFor(params.feeRate, vChange);
    const candidate = total - paid - feeChange;
    if (hasChangeSlot && candidate >= dust && candidate > 0n) {
      fee = feeChange;
      change = candidate;
    } else {
      fee = total - paid; // leftover (< dust or no change address) goes to the miners
      if (fee > feeNoChange + dust) return fail('INSUFFICIENT_FUNDS'); // refuse to burn a large leftover: need a change address
    }
  }
  if (fee * 2n > total && fee > 10_000n) return fail('FEE_TOO_HIGH');

  const order: PlannedOutput[] = [...planned];
  if (change > 0n) {
    order.push({
      address: params.changeAddress as string,
      isSp: isSilentPaymentAddress(params.changeAddress as string),
      amountSats: change,
    });
  }

  // Signing keys, one per input, validated against the claimed output keys.
  const keys: SecretScalar[] = [];
  const cleanup: Uint8Array[] = [];
  try {
    for (const o of outputs) {
      const k = spendPrivateKey(params.spendSecret, o.spendTweak);
      cleanup.push(k.privateKey);
      if (toHex(k.xOnlyPublicKey) !== toHex(o.xOnlyPublicKey)) return fail('INVALID_INPUT');
      keys.push(k.privateKey);
    }

    const spAddrs = order.filter((p) => p.isSp).map((p) => p.address);
    const spKeys =
      spAddrs.length === 0
        ? []
        : createSilentPaymentOutputs({
            inputs: keys.map((privateKey) => ({ privateKey, isTaproot: true })),
            outpoints: outputs.map((o) => ({ txid: o.txid, vout: o.vout })),
            recipients: spAddrs,
            network,
          });

    const tx = new Transaction({ version: 2, allowUnknownOutputs: false });
    const prevouts = outputs.map((o) => ({
      script: Uint8Array.of(0x51, 0x20, ...o.xOnlyPublicKey),
      amountSats: o.amountSats,
    }));
    outputs.forEach((o, i) => {
      tx.addInput({
        txid: o.txid.toLowerCase(),
        index: o.vout,
        sequence: params.rbf === false ? 0xfffffffe : 0xfffffffd,
        witnessUtxo: { script: (prevouts[i] as { script: Uint8Array }).script, amount: o.amountSats },
      });
    });
    let spIdx = 0;
    for (const p of order) {
      if (p.isSp) {
        const d = spKeys[spIdx++];
        if (d === undefined) return fail('INVALID_INPUT');
        tx.addOutput({ script: Uint8Array.of(0x51, 0x20, ...d.xOnlyPublicKey), amount: p.amountSats });
      } else {
        tx.addOutputAddress(p.address, p.amountSats, btcNetwork(network, params.regtest === true));
      }
    }

    const scripts = prevouts.map((p) => p.script);
    const amounts = prevouts.map((p) => p.amountSats);
    keys.forEach((key, i) => {
      const digest = tx.preimageWitnessV1(i, scripts, 0, amounts);
      tx.updateInput(i, { tapKeySig: schnorr.sign(digest, key) });
    });
    const psbt = tx.toPSBT();
    tx.finalize();
    const rawTx = tx.extract();
    if (!verifyKeyPathSpend(rawTx, prevouts)) return fail('SIGNATURE_INVALID');
    if (tx.vsize !== estimateKeyPathVsize(outputs.length, order.map(lenOf))) return fail('SIGNATURE_INVALID');
    const changeIndex = change > 0n ? order.length - 1 : null;
    return { psbt, rawTx, txid: tx.id, feeSats: fee, vsize: tx.vsize, changeSats: change, changeIndex };
  } finally {
    zeroize(...cleanup);
  }
}
