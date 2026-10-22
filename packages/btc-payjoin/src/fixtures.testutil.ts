import { schnorr, secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { hex } from '@scure/base';
import * as btc from '@scure/btc-signer';
import { MemoryExposedUtxos, MemorySeenInputs } from './receiver/seen.js';
import type { ReceiverContext } from './receiver/checks.js';
import { softwareSigner, type PsbtSigner, type ReceiverWallet } from './signers.js';
import type { Utxo } from './psbt.js';
import { MemoryDirectory } from './transport/memory.js';
import { netParams, type BtcNetwork } from './network.js';

export const NET = btc.TEST_NETWORK;
export type Kind = 'wpkh' | 'sh-wpkh' | 'tr';

export interface Key {
  priv: Uint8Array;
  pub: Uint8Array;
}

export function key(label: string): Key {
  const priv = sha256(new TextEncoder().encode(`btc-payjoin-test:${label}`));
  return { priv, pub: secp256k1.getPublicKey(priv, true) };
}

let counter = 0;
const fixturePrevouts = new Map<string, { script: Uint8Array; amount: bigint }>();
export function fakeTxid(): string {
  counter++;
  return hex.encode(sha256(new TextEncoder().encode(`txid:${String(counter)}`)));
}

export function addressFor(k: Key, kind: Kind, network: BtcNetwork = 'testnet'): string {
  const n = netParams(network);
  if (kind === 'wpkh') return btc.p2wpkh(k.pub, n).address;
  if (kind === 'sh-wpkh') return btc.p2sh(btc.p2wpkh(k.pub, n), n).address;
  return btc.p2tr(k.pub.slice(1), undefined, n).address;
}

export function utxoFor(k: Key, kind: Kind, amount: bigint, extra: Partial<Utxo> = {}): Utxo {
  const txid = fakeTxid();
  if (kind === 'wpkh') {
    const script = btc.p2wpkh(k.pub, NET).script;
    fixturePrevouts.set(`${txid}:0`, { script, amount });
    return { txid, index: 0, amount, script, ...extra };
  }
  if (kind === 'sh-wpkh') {
    const inner = btc.p2wpkh(k.pub, NET);
    const script = btc.p2sh(inner, NET).script;
    fixturePrevouts.set(`${txid}:0`, { script, amount });
    return { txid, index: 0, amount, script, signing: { redeemScript: inner.script }, ...extra };
  }
  const xonly = k.pub.slice(1);
  const script = btc.p2tr(xonly, undefined, NET).script;
  fixturePrevouts.set(`${txid}:0`, { script, amount });
  return { txid, index: 0, amount, script, signing: { tapInternalKey: xonly }, ...extra };
}

/** Signer that resolves keys by scriptPubKey of the given (key, kind) pairs. */
export function signerFor(pairs: readonly { k: Key; kind: Kind }[]): PsbtSigner {
  const map = new Map<string, Uint8Array>();
  for (const { k, kind } of pairs) map.set(hex.encode(utxoFor(k, kind, 1n).script), k.priv);
  return softwareSigner((s) => map.get(hex.encode(s)));
}

export function receiverWallet(k: Key, kind: Kind, utxos: Utxo[]): ReceiverWallet & { mempool: boolean } {
  const mine = new Map<string, Uint8Array>();
  mine.set(hex.encode(utxoFor(k, kind, 1n).script), k.priv);
  const w = {
    mempool: true,
    isMine: (s: Uint8Array) => mine.has(hex.encode(s)),
    listSpendable: () => Promise.resolve(utxos),
    signInput(tx: btc.Transaction, index: number) {
      const inp = tx.getInput(index);
      const key2 = mine.get(hex.encode((inp.witnessUtxo as { script: Uint8Array }).script)) as Uint8Array;
      tx.signIdx(key2, index);
    },
    testMempoolAccept: () => Promise.resolve(w.mempool),
    getPrevOut: (txid: string, index: number) => Promise.resolve(fixturePrevouts.get(`${txid}:${String(index)}`)),
  };
  return w;
}

export function newDirectory(now: () => number): MemoryDirectory {
  let n = 0;
  return new MemoryDirectory(now, () => `BOX${String(++n).padStart(6, '0')}AAAA`);
}

export function receiverCtx(wallet: ReceiverWallet, address: string, over: Partial<ReceiverContext> = {}): ReceiverContext {
  return {
    wallet,
    seen: new MemorySeenInputs(),
    network: 'testnet',
    address,
    mode: 'interactive',
    random: () => 0.5,
    ...over,
  };
}

export const exposedStore = (): MemoryExposedUtxos => new MemoryExposedUtxos();
export { schnorr };

// ---------------------------------------------------------------------------
// Scenario builder: a sender Original plus the receiver's honest proposal.
// ---------------------------------------------------------------------------
import { buildOriginalPsbt, type BuiltOriginal } from './sender/original.js';
import { buildProposal } from './receiver/contribute.js';
import { checkOriginal } from './receiver/checks.js';
import { withDefaults, type PayjoinParams } from './params.js';
import { parsePsbt, outputInfo } from './psbt.js';
import { addressToScript } from './network.js';
import type { PayjoinUri } from './uri.js';

export interface ScenarioOpts {
  sKind?: Kind;
  rKind?: Kind;
  senderAmounts?: bigint[];
  receiverAmounts?: bigint[];
  amount?: bigint;
  feeRate?: number;
  params?: Partial<PayjoinParams>;
  outputSubstitution?: boolean;
  ctx?: Partial<ReceiverContext>;
  /** Skip proposal building (for tests that call buildProposal themselves). */
  noBuild?: boolean;
}

export async function scenario(o: ScenarioOpts = {}) {
  const sKind = o.sKind ?? 'wpkh';
  const rKind = o.rKind ?? 'wpkh';
  const sk = key('sender');
  const rk = key('receiver');
  const amount = o.amount ?? 20_000n;
  const rAddr = addressFor(rk, rKind);
  const uri: PayjoinUri = { address: rAddr, amountSats: amount, pj: 'http://localhost/pj/X', outputSubstitution: o.outputSubstitution ?? true, network: 'testnet' };
  const sUtxos = (o.senderAmounts ?? [100_000n]).map((a) => utxoFor(sk, sKind, a));
  const rUtxos = (o.receiverAmounts ?? [50_000n]).map((a) => utxoFor(rk, rKind, a));
  const wallet = receiverWallet(rk, rKind, rUtxos);
  const built: BuiltOriginal = buildOriginalPsbt({
    uri,
    utxos: sUtxos,
    feeRateSatPerVb: o.feeRate ?? 2,
    changeAddress: addressFor(sk, sKind),
    signer: signerFor([{ k: sk, kind: sKind }]),
    random: () => 0,
  });
  const base = withDefaults(o.params);
  const params: PayjoinParams = {
    ...base,
    ...(built.changeIndex !== undefined && base.maxAdditionalFeeContributionSats !== undefined && base.additionalFeeOutputIndex === undefined
      ? { additionalFeeOutputIndex: built.changeIndex }
      : {}),
  };
  const ctx = receiverCtx(wallet, rAddr, { amountSats: amount, ...(o.ctx ?? {}) });
  const checked = await checkOriginal(built.psbt, ctx);
  const proposal = o.noBuild === true ? { psbt: built.psbt } : await buildProposal(checked, params, ctx);
  return {
    sk,
    rk,
    uri,
    sUtxos,
    rUtxos,
    wallet,
    built,
    params,
    ctx,
    checked,
    proposalB64: proposal.psbt,
    proposal: parsePsbt(proposal.psbt),
    paymentScript: addressToScript(rAddr, 'testnet'),
    outputInfo,
  };
}

// ---------------------------------------------------------------------------
// Rebuild a transaction with targeted edits, for negative vectors.
// ---------------------------------------------------------------------------
export interface RebuildOpts {
  version?: number;
  lockTime?: number;
  inputOrder?: number[];
  outputOrder?: number[];
  mapInput?: (inp: ReturnType<btc.Transaction['getInput']>, i: number) => Record<string, unknown> | null;
  mapOutput?: (o: ReturnType<btc.Transaction['getOutput']>, i: number) => Record<string, unknown> | null;
  extraOutputs?: { script: Uint8Array; amount: bigint }[];
  extraInputs?: Record<string, unknown>[];
}

export function rebuild(src: btc.Transaction, o: RebuildOpts = {}): btc.Transaction {
  const tx = new btc.Transaction({
    version: o.version ?? src.version,
    lockTime: o.lockTime ?? src.lockTime,
    allowUnknownInputs: true,
    allowUnknownOutputs: true,
  });
  const iorder = o.inputOrder ?? [...Array(src.inputsLength).keys()];
  for (const i of iorder) {
    const inp = src.getInput(i);
    const m = o.mapInput === undefined ? inp : o.mapInput(inp, i);
    if (m === null) continue;
    tx.addInput(m, true);
  }
  for (const e of o.extraInputs ?? []) tx.addInput(e, true);
  const oorder = o.outputOrder ?? [...Array(src.outputsLength).keys()];
  for (const i of oorder) {
    const out = src.getOutput(i);
    const m = o.mapOutput === undefined ? out : o.mapOutput(out, i);
    if (m === null) continue;
    tx.addOutput(m, true);
  }
  for (const e of o.extraOutputs ?? []) tx.addOutput(e, true);
  return tx;
}
