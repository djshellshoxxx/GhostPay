import { concatBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { compress, mulG, toHex } from './ecc.js';
import { extractInputPublicKey, spendsFutureSegwit } from './inputs.js';
import { computeTransactionTweak } from './receiver.js';
import {
  fakeTxid,
  hash160,
  p2pkhInput,
  p2shP2wpkhInput,
  p2trInput,
  p2wpkhInput,
} from './fixtures.testutil.js';
import type { TxInput } from './tx.js';

function withSpk(base: TxInput, spk: Uint8Array): TxInput {
  return { ...base, prevoutScriptPubKey: spk };
}

describe('eligible input extraction', () => {
  it('extracts keys for the four eligible types', () => {
    for (const make of [p2wpkhInput, p2shP2wpkhInput, p2pkhInput]) {
      const t = make('x');
      const e = extractInputPublicKey(t.input);
      expect(e?.isTaproot).toBe(false);
      expect(toHex(e?.publicKey ?? new Uint8Array())).toBe(
        toHex(compress(mulG(BigInt(`0x${toHex(t.key.privateKey)}`)))),
      );
    }
    const tr = p2trInput('x');
    const e = extractInputPublicKey(tr.input);
    expect(e?.isTaproot).toBe(true);
    expect(e?.publicKey[0]).toBe(0x02); // x-only keys are lifted with even y
  });

  it('ignores unknown scripts (P2WSH, multisig-like, bare, OP_RETURN)', () => {
    const base = p2wpkhInput('y').input;
    for (const spk of [
      concatBytes(Uint8Array.of(0, 0x20), new Uint8Array(32)),
      Uint8Array.of(0x6a),
      new Uint8Array(0),
      concatBytes(Uint8Array.of(0x51, 0x21), new Uint8Array(33)),
    ]) {
      expect(extractInputPublicKey(withSpk(base, spk))).toBeNull();
    }
  });

  it('P2WPKH: uncompressed, hybrid or empty witness yields nothing', () => {
    const t = p2wpkhInput('uc').input;
    expect(
      extractInputPublicKey({ ...t, witness: [new Uint8Array(71), new Uint8Array(65).fill(4)] }),
    ).toBeNull();
    expect(extractInputPublicKey({ ...t, witness: [] })).toBeNull();
    expect(extractInputPublicKey({ ...t, witness: [new Uint8Array(71), new Uint8Array(33)] })).toBeNull();
  });

  it('P2PKH: finds the key in a malleated scriptSig, skips uncompressed keys and invalid points', () => {
    const t = p2pkhInput('mall').input;
    const dummy = concatBytes(Uint8Array.of(0x01, 0x00, 0x75), t.scriptSig); // <dummy> OP_DROP <sig> <pubkey>
    expect(extractInputPublicKey({ ...t, scriptSig: dummy })).not.toBeNull();
    const withTrailing = concatBytes(t.scriptSig, Uint8Array.of(0x00));
    expect(extractInputPublicKey({ ...t, scriptSig: withTrailing })).not.toBeNull(); // trailing junk: the key is still found by the backwards scan
  });

  it('P2PKH: hash match on a 33-byte window that is not a point is skipped', () => {
    const bad = concatBytes(Uint8Array.of(0x02), new Uint8Array(32).fill(0xff));
    const t = p2pkhInput('badpt').input;
    const spk = concatBytes(Uint8Array.of(0x76, 0xa9, 0x14), hash160(bad), Uint8Array.of(0x88, 0xac));
    expect(
      extractInputPublicKey({
        ...t,
        prevoutScriptPubKey: spk,
        scriptSig: concatBytes(Uint8Array.of(0x21), bad),
      }),
    ).toBeNull();
    expect(extractInputPublicKey({ ...t, scriptSig: new Uint8Array(10) })).toBeNull();
  });

  it('P2SH: only exact P2SH-P2WPKH with a matching redeem script hash is eligible', () => {
    const t = p2shP2wpkhInput('sh').input;
    expect(extractInputPublicKey(t)).not.toBeNull();
    expect(extractInputPublicKey({ ...t, scriptSig: t.scriptSig.slice(0, 22) })).toBeNull(); // wrong length
    expect(
      extractInputPublicKey({ ...t, scriptSig: concatBytes(Uint8Array.of(0x17), t.scriptSig.slice(1)) }),
    ).toBeNull(); // wrong push
    const otherRedeem = concatBytes(Uint8Array.of(0x16, 0, 0x14), new Uint8Array(20));
    expect(extractInputPublicKey({ ...t, scriptSig: otherRedeem })).toBeNull(); // hash mismatch
    const p2wsh = concatBytes(Uint8Array.of(0x22, 0, 0x20), new Uint8Array(32));
    expect(extractInputPublicKey({ ...t, scriptSig: concatBytes(p2wsh, new Uint8Array(0)) })).toBeNull();
  });

  it('P2TR: annex is ignored, NUMS script-path spends skipped, invalid x and empty witness skipped', () => {
    const t = p2trInput('tr').input;
    const annex = Uint8Array.of(0x50, 1, 2);
    expect(extractInputPublicKey({ ...t, witness: [new Uint8Array(64), annex] })).not.toBeNull();
    const nums = Uint8Array.from(
      Buffer.from('50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0', 'hex'),
    );
    const controlNums = concatBytes(Uint8Array.of(0xc0), nums);
    const controlOther = concatBytes(Uint8Array.of(0xc0), new Uint8Array(32).fill(2));
    expect(
      extractInputPublicKey({ ...t, witness: [Uint8Array.of(1), Uint8Array.of(0x51), controlNums] }),
    ).toBeNull();
    expect(
      extractInputPublicKey({ ...t, witness: [Uint8Array.of(1), Uint8Array.of(0x51), controlOther] }),
    ).not.toBeNull();
    // annex + NUMS control block still skipped
    expect(extractInputPublicKey({ ...t, witness: [Uint8Array.of(0x51), controlNums, annex] })).toBeNull();
    expect(extractInputPublicKey({ ...t, witness: [] })).toBeNull();
    const badX = concatBytes(Uint8Array.of(0x51, 0x20), new Uint8Array(32).fill(0xff));
    expect(extractInputPublicKey(withSpk(t, badX))).toBeNull();
    // single empty-looking item that starts with 0x50 is NOT an annex (stack of one)
    expect(extractInputPublicKey({ ...t, witness: [annex] })).not.toBeNull();
  });
});

describe('transaction eligibility', () => {
  it('spendsFutureSegwit flags v2..v16 programs only', () => {
    const base = p2wpkhInput('fs').input;
    const prog = (version: number, len: number): Uint8Array =>
      concatBytes(Uint8Array.of(version, len), new Uint8Array(len));
    expect(spendsFutureSegwit(withSpk(base, prog(0x52, 32)))).toBe(true);
    expect(spendsFutureSegwit(withSpk(base, prog(0x60, 2)))).toBe(true);
    expect(spendsFutureSegwit(withSpk(base, prog(0x51, 32)))).toBe(false); // v1 taproot
    expect(spendsFutureSegwit(withSpk(base, prog(0x00, 20)))).toBe(false);
    expect(spendsFutureSegwit(withSpk(base, prog(0x61, 32)))).toBe(false);
    expect(spendsFutureSegwit(withSpk(base, concatBytes(Uint8Array.of(0x52, 31), new Uint8Array(32))))).toBe(
      false,
    ); // push length mismatch
    expect(spendsFutureSegwit(withSpk(base, Uint8Array.of(0x52)))).toBe(false);
  });

  it('skips a transaction that spends a SegWit v2+ output even with an eligible input', () => {
    const ok = p2wpkhInput('elig').input;
    const future = withSpk(
      p2wpkhInput('fut').input,
      concatBytes(Uint8Array.of(0x52, 0x20), new Uint8Array(32)),
    );
    expect(computeTransactionTweak([ok])).not.toBeNull();
    expect(computeTransactionTweak([ok, future])).toBeNull();
  });

  it('skips transactions with no inputs or no eligible inputs', () => {
    expect(computeTransactionTweak([])).toBeNull();
    const unknown = withSpk(p2wpkhInput('u').input, Uint8Array.of(0x6a));
    expect(computeTransactionTweak([unknown])).toBeNull();
  });

  it('non-eligible inputs still count for outpoint_L but not for A', () => {
    const a = p2wpkhInput('a', 0);
    const noise = { ...withSpk(p2wpkhInput('noise').input, Uint8Array.of(0x6a)), txid: fakeTxid('0000') };
    const t1 = computeTransactionTweak([a.input]);
    const t2 = computeTransactionTweak([a.input, noise]);
    expect(toHex(t1?.inputPublicKeySum ?? new Uint8Array())).toBe(
      toHex(t2?.inputPublicKeySum ?? new Uint8Array(1)),
    );
  });
});
