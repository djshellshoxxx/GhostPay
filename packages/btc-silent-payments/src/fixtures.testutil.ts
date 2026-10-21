import type { SilentPaymentNetwork } from './address.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { concatBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { compress, mulG, scalarBytes, toHex, xOnly } from './ecc.js';
import { computeTransactionTweak } from './receiver.js';
import type { MemoryBlock } from './scan/memory.js';
import type { BlockOutput } from './scan/types.js';
import { secretScalarFromBytes, type CompressedPoint, type SecretScalar } from './secret.js';
import { createSilentPaymentOutputs, type SenderKey } from './sender.js';
import { bytesToNumberBE } from '@noble/curves/utils.js';
import type { TxInput } from './tx.js';

export const hash160 = (b: Uint8Array): Uint8Array => ripemd160(sha256(b));

/** Deterministic secret scalar from a label. */
export function secretFrom(label: string): SecretScalar {
  let counter = 0;
  for (;;) {
    const h = sha256(utf8ToBytes(`${label}:${counter++}`));
    try {
      return secretScalarFromBytes(h);
    } catch {
      continue;
    }
  }
}

export function fakeTxid(label: string): string {
  return toHex(sha256(utf8ToBytes(`txid:${label}`)));
}

export interface TestInput {
  readonly input: TxInput;
  readonly key: SenderKey;
}

const DUMMY_SIG = new Uint8Array(71).fill(0x30);

export function p2wpkhInput(label: string, vout = 0): TestInput {
  const privateKey = secretFrom(`w:${label}`);
  const pub = compress(mulG(bytesToNumberBE(privateKey)));
  return {
    input: {
      txid: fakeTxid(label),
      vout,
      scriptSig: new Uint8Array(0),
      witness: [DUMMY_SIG, pub],
      prevoutScriptPubKey: concatBytes(Uint8Array.of(0, 0x14), hash160(pub)),
    },
    key: { privateKey, isTaproot: false },
  };
}

export function p2shP2wpkhInput(label: string, vout = 0): TestInput {
  const privateKey = secretFrom(`s:${label}`);
  const pub = compress(mulG(bytesToNumberBE(privateKey)));
  const redeem = concatBytes(Uint8Array.of(0, 0x14), hash160(pub));
  return {
    input: {
      txid: fakeTxid(label),
      vout,
      scriptSig: concatBytes(Uint8Array.of(0x16), redeem),
      witness: [DUMMY_SIG, pub],
      prevoutScriptPubKey: concatBytes(Uint8Array.of(0xa9, 0x14), hash160(redeem), Uint8Array.of(0x87)),
    },
    key: { privateKey, isTaproot: false },
  };
}

export function p2pkhInput(label: string, vout = 0): TestInput {
  const privateKey = secretFrom(`p:${label}`);
  const pub = compress(mulG(bytesToNumberBE(privateKey)));
  return {
    input: {
      txid: fakeTxid(label),
      vout,
      scriptSig: concatBytes(Uint8Array.of(DUMMY_SIG.length), DUMMY_SIG, Uint8Array.of(33), pub),
      witness: [],
      prevoutScriptPubKey: concatBytes(
        Uint8Array.of(0x76, 0xa9, 0x14),
        hash160(pub),
        Uint8Array.of(0x88, 0xac),
      ),
    },
    key: { privateKey, isTaproot: false },
  };
}

/** Key-path P2TR input; `privateKey` is the private key of the (tweaked) OUTPUT key. */
export function p2trInput(label: string, vout = 0): TestInput {
  const privateKey = secretFrom(`t:${label}`);
  const point = mulG(bytesToNumberBE(privateKey));
  return {
    input: {
      txid: fakeTxid(label),
      vout,
      scriptSig: new Uint8Array(0),
      witness: [new Uint8Array(64).fill(1)],
      prevoutScriptPubKey: concatBytes(Uint8Array.of(0x51, 0x20), xOnly(point)),
    },
    key: { privateKey, isTaproot: true },
  };
}

export { scalarBytes };

export interface TestTx {
  readonly inputs: readonly TestInput[];
  readonly recipients: readonly string[];
  /** Extra decoy taproot outputs created by this transaction. */
  readonly decoys?: readonly Uint8Array[];
}

export function blockHashOf(height: number): string {
  return toHex(sha256(utf8ToBytes(`block:${height}`)));
}

/** Builds one block of fake oracle data from synthetic transactions. */
export function makeBlock(
  height: number,
  txs: readonly TestTx[],
  network: SilentPaymentNetwork = 'mainnet',
): MemoryBlock {
  const tweaks: CompressedPoint[] = [];
  const outputs: BlockOutput[] = [];
  txs.forEach((tx, n) => {
    const txid = fakeTxid(`tx:${height}:${n}`);
    const created = createSilentPaymentOutputs({
      inputs: tx.inputs.map((i) => i.key),
      outpoints: tx.inputs.map((i) => ({ txid: i.input.txid, vout: i.input.vout })),
      recipients: tx.recipients,
      network,
    });
    const tw = computeTransactionTweak(tx.inputs.map((i) => i.input));
    if (tw !== null) tweaks.push(tw.tweak);
    let vout = 0;
    for (const c of created)
      outputs.push({
        xOnlyPublicKey: c.xOnlyPublicKey,
        txid,
        vout: vout++,
        amountSats: 1000n + BigInt(vout),
      });
    for (const d of tx.decoys ?? [])
      outputs.push({ xOnlyPublicKey: d, txid, vout: vout++, amountSats: 546n });
  });
  const blockHash = blockHashOf(height);
  return { tweaks: { height, blockHash, tweaks }, outputs: { height, blockHash, outputs } };
}
