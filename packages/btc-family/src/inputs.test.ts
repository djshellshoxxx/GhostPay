import { concatBytes } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { compress, mulG, toHex } from './ecc.js';
import { classifyInput, extractInputPublicKey, spendsFutureSegwit } from './inputs.js';
import {
  asTestnet,
  fakeTxid,
  hash160,
  p2pkhInput,
  p2shP2wpkhInput,
  p2trInput,
  p2wpkhInput,
} from './fixtures.testutil.js';
import { BITCOIN_CASH_MAINNET, BITCOIN_MAINNET, DOGECOIN_MAINNET, LITECOIN_TESTNET } from './params.js';
import { computeTransactionTweak } from './receiver.js';
import type { TxInput } from './tx.js';

function withSpk(base: TxInput, spk: Uint8Array): TxInput {
  return { ...base, prevoutScriptPubKey: spk };
}

describe('classifyInput', () => {
  it('classifies the four types and unknown scripts', () => {
    expect(classifyInput(p2pkhInput('c').input)).toBe('p2pkh');
    expect(classifyInput(p2shP2wpkhInput('c').input)).toBe('p2sh-p2wpkh');
    expect(classifyInput(p2wpkhInput('c').input)).toBe('p2wpkh');
    expect(classifyInput(p2trInput('c').input)).toBe('p2tr');
    expect(classifyInput(withSpk(p2wpkhInput('c').input, Uint8Array.of(0x6a)))).toBeNull();
  });
});

describe('eligibility per chain', () => {
  const all = [p2trInput('e'), p2wpkhInput('e'), p2shP2wpkhInput('e'), p2pkhInput('e')];

  it('Bitcoin extracts a key from all four types', () => {
    for (const t of all) {
      const e = extractInputPublicKey(BITCOIN_MAINNET, t.input);
      expect(e?.type).toBe(t.key.type);
      expect(e?.isTaproot).toBe(t.key.type === 'p2tr');
      if (t.key.type !== 'p2tr') {
        expect(toHex(e?.publicKey ?? new Uint8Array())).toBe(
          toHex(compress(mulG(BigInt(`0x${toHex(t.key.privateKey)}`)))),
        );
      } else {
        expect(e?.publicKey[0]).toBe(0x02);
      }
    }
  });

  it('Litecoin (taproot not verified) skips p2tr but takes segwit and legacy inputs', () => {
    expect(extractInputPublicKey(LITECOIN_TESTNET, all[0]?.input as TxInput)).toBeNull();
    for (const t of all.slice(1)) expect(extractInputPublicKey(LITECOIN_TESTNET, t.input)).not.toBeNull();
  });

  it('Dogecoin and Bitcoin Cash take only p2pkh', () => {
    for (const chain of [DOGECOIN_MAINNET, BITCOIN_CASH_MAINNET]) {
      expect(extractInputPublicKey(chain, all[3]?.input as TxInput)).not.toBeNull();
      for (const t of all.slice(0, 3)) expect(extractInputPublicKey(chain, t.input)).toBeNull();
    }
  });

  it('a transaction with only ineligible inputs yields no tweak', () => {
    expect(computeTransactionTweak(DOGECOIN_MAINNET, [p2wpkhInput('only').input])).toBeNull();
    expect(computeTransactionTweak(BITCOIN_MAINNET, [])).toBeNull();
  });

  it('ineligible inputs are skipped, but still count for outpoint_L', () => {
    const doge = asTestnet(DOGECOIN_MAINNET);
    const a = p2pkhInput('mix-a').input;
    const b = p2wpkhInput('mix-b').input;
    const withB = computeTransactionTweak(doge, [a, b]);
    const withoutB = computeTransactionTweak(doge, [a]);
    expect(withB).not.toBeNull();
    expect(toHex(withB?.inputPublicKeySum ?? new Uint8Array())).toBe(
      toHex(withoutB?.inputPublicKeySum ?? new Uint8Array()),
    );
  });
});

describe('extraction edge cases', () => {
  it('ignores unknown scripts (P2WSH, bare, OP_RETURN, empty)', () => {
    const base = p2wpkhInput('y').input;
    for (const spk of [
      concatBytes(Uint8Array.of(0, 0x20), new Uint8Array(32)),
      Uint8Array.of(0x6a),
      new Uint8Array(0),
      concatBytes(Uint8Array.of(0x51, 0x21), new Uint8Array(33)),
    ]) {
      expect(extractInputPublicKey(BITCOIN_MAINNET, withSpk(base, spk))).toBeNull();
    }
  });

  it('P2WPKH: uncompressed, hybrid or empty witness yields nothing', () => {
    const t = p2wpkhInput('uc').input;
    expect(
      extractInputPublicKey(BITCOIN_MAINNET, {
        ...t,
        witness: [new Uint8Array(71), new Uint8Array(65).fill(4)],
      }),
    ).toBeNull();
    expect(extractInputPublicKey(BITCOIN_MAINNET, { ...t, witness: [] })).toBeNull();
    expect(
      extractInputPublicKey(BITCOIN_MAINNET, { ...t, witness: [new Uint8Array(71), new Uint8Array(33)] }),
    ).toBeNull();
  });

  it('P2PKH: finds the key in a malleated scriptSig, rejects missing/invalid keys', () => {
    const t = p2pkhInput('mall').input;
    const dummy = concatBytes(Uint8Array.of(0x01, 0x00, 0x75), t.scriptSig);
    expect(extractInputPublicKey(BITCOIN_MAINNET, { ...t, scriptSig: dummy })).not.toBeNull();
    expect(extractInputPublicKey(BITCOIN_MAINNET, { ...t, scriptSig: new Uint8Array(10) })).toBeNull();
    // 33 bytes with the right hash160 but an invalid point
    const bogus = new Uint8Array(33).fill(5);
    const spk = concatBytes(Uint8Array.of(0x76, 0xa9, 0x14), hash160(bogus), Uint8Array.of(0x88, 0xac));
    expect(
      extractInputPublicKey(BITCOIN_MAINNET, {
        ...t,
        scriptSig: concatBytes(Uint8Array.of(33), bogus),
        prevoutScriptPubKey: spk,
      }),
    ).toBeNull();
  });

  it('P2SH: only the P2SH-P2WPKH redeem script shape with a matching hash is accepted', () => {
    const t = p2shP2wpkhInput('sh').input;
    expect(extractInputPublicKey(BITCOIN_MAINNET, { ...t, scriptSig: new Uint8Array(5) })).toBeNull();
    expect(
      extractInputPublicKey(BITCOIN_MAINNET, {
        ...t,
        scriptSig: concatBytes(Uint8Array.of(0x17), new Uint8Array(23)),
      }),
    ).toBeNull();
    const wrongRedeem = concatBytes(Uint8Array.of(0x16, 0, 0x14), new Uint8Array(20));
    expect(extractInputPublicKey(BITCOIN_MAINNET, { ...t, scriptSig: wrongRedeem })).toBeNull();
    const notP2wpkh = concatBytes(Uint8Array.of(0x16, 0x51, 0x14), new Uint8Array(20));
    expect(extractInputPublicKey(BITCOIN_MAINNET, { ...t, scriptSig: notP2wpkh })).toBeNull();
    expect(extractInputPublicKey(BITCOIN_MAINNET, { ...t, witness: [] })).toBeNull();
  });

  it('P2TR: annex ignored, NUMS script-path skipped, empty witness and off-curve key rejected', () => {
    const t = p2trInput('tr').input;
    const annex = concatBytes(Uint8Array.of(0x50), new Uint8Array(4));
    expect(
      extractInputPublicKey(BITCOIN_MAINNET, { ...t, witness: [new Uint8Array(64), annex] }),
    ).not.toBeNull();
    const nums = new Uint8Array(33);
    nums.set(
      Uint8Array.from(Buffer.from('50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0', 'hex')),
      1,
    );
    expect(
      extractInputPublicKey(BITCOIN_MAINNET, {
        ...t,
        witness: [new Uint8Array(10), new Uint8Array(3), nums],
      }),
    ).toBeNull();
    expect(
      extractInputPublicKey(BITCOIN_MAINNET, {
        ...t,
        witness: [new Uint8Array(10), new Uint8Array(3), new Uint8Array(33).fill(1)],
      }),
    ).not.toBeNull();
    expect(extractInputPublicKey(BITCOIN_MAINNET, { ...t, witness: [] })).toBeNull();
    const off = concatBytes(Uint8Array.of(0x51, 0x20), new Uint8Array(32).fill(0xff));
    expect(extractInputPublicKey(BITCOIN_MAINNET, withSpk(t, off))).toBeNull();
  });
});

describe('future SegWit rule', () => {
  const t = p2wpkhInput('fut').input;
  const v2 = withSpk(p2pkhInput('fut2').input, concatBytes(Uint8Array.of(0x52, 0x20), new Uint8Array(32)));

  it('detects segwit v2..v16 programs', () => {
    expect(spendsFutureSegwit(v2)).toBe(true);
    expect(spendsFutureSegwit(t)).toBe(false);
    expect(spendsFutureSegwit(withSpk(t, new Uint8Array(0)))).toBe(false);
  });

  it('skips the transaction on SegWit chains but not on SegWit-less chains', () => {
    const p2pkh = p2pkhInput('fut3').input;
    expect(computeTransactionTweak(BITCOIN_MAINNET, [p2pkh, v2])).toBeNull();
    expect(computeTransactionTweak(DOGECOIN_MAINNET, [p2pkh, v2])).not.toBeNull();
    expect(fakeTxid('x')).toHaveLength(64);
  });
});
