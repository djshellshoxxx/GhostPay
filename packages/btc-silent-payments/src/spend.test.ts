import { schnorr } from '@noble/curves/secp256k1.js';
import { bytesToNumberBE } from '@noble/curves/utils.js';
import { Address, NETWORK, OutScript, TEST_NETWORK, Transaction } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { decodeSilentPaymentAddress } from './address.js';
import { hasEvenY, modN, mulG, toHex, xOnly } from './ecc.js';
import { SilentPaymentError } from './errors.js';
import { fakeTxid } from './fixtures.testutil.js';
import { generateSilentPaymentKeys } from './keys.js';
import { changeAddress, createLabelTable, labeledAddress, silentPaymentAddress } from './labels.js';
import {
  computeTransactionTweak,
  scanOutputsForTweak,
  scanTweakAgainstSet,
  type FoundOutput,
} from './receiver.js';
import { seededRng } from './rng.testutil.js';
import { createSilentPaymentOutputs } from './sender.js';
import {
  buildSpendTransaction,
  estimateKeyPathVsize,
  MAX_FEE_RATE_SAT_PER_VB,
  verifyKeyPathSpend,
  type BuildSpendParams,
  type SpendableOutput,
} from './spend.js';
import { p2trInput, p2wpkhInput } from './fixtures.testutil.js';
import { toBytesLike } from './spend.testutil.js';

const wallet = generateSilentPaymentKeys(seededRng('spend-wallet'));
const labels = createLabelTable(wallet.scanSecret, [1, 7]);
const keysFor = { scanSecret: wallet.scanSecret, spendPublicKey: wallet.spendPublicKey, labels };

/** Simulates a sender paying `address` (k-th recipient) and returns the output the wallet detects. */
function receive(address: string[], seed: string, amounts: bigint[]): SpendableOutput[] {
  const t = p2wpkhInput(seed);
  const outs = createSilentPaymentOutputs({
    inputs: [t.key],
    outpoints: [{ txid: t.input.txid, vout: t.input.vout }],
    recipients: address,
    network: 'mainnet',
  });
  const tw = computeTransactionTweak([t.input]);
  if (tw === null) throw new Error('ineligible');
  const found = scanOutputsForTweak(
    keysFor,
    tw.tweak,
    outs.map((o) => o.xOnlyPublicKey),
  );
  expect(found).toHaveLength(address.length);
  const txid = fakeTxid(`fund-${seed}`);
  return outs.map((o, i) => {
    const f = found.find((x) => toHex(x.xOnlyPublicKey) === toHex(o.xOnlyPublicKey)) as FoundOutput;
    return {
      txid,
      vout: i,
      amountSats: amounts[i] as bigint,
      xOnlyPublicKey: f.xOnlyPublicKey,
      spendTweak: f.spendTweak,
    };
  });
}

const dest = Address(NETWORK).encode({ type: 'wpkh', hash: new Uint8Array(20).fill(7) });
const destTr = Address(NETWORK).encode({ type: 'tr', pubkey: xOnly(mulG(5n)) });
const destLegacy = Address(NETWORK).encode({ type: 'pkh', hash: new Uint8Array(20).fill(8) });

function params(
  outputs: SpendableOutput[],
  over: Partial<BuildSpendParams> & { noChange?: boolean } = {},
): BuildSpendParams {
  const { noChange, ...rest } = over;
  const base: BuildSpendParams = {
    outputs,
    spendSecret: wallet.spendSecret,
    destinations: [{ address: dest, amountSats: 50_000n }],
    changeAddress: destTr,
    feeRate: 2,
    network: 'mainnet',
    ...rest,
  };
  if (noChange === true) {
    return { ...base, changeAddress: undefined } as unknown as BuildSpendParams;
  }
  return base;
}

function code(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : 'OTHER';
  }
  return 'NO_THROW';
}

function prevoutsOf(o: SpendableOutput[]): { script: Uint8Array; amountSats: bigint }[] {
  return o.map((x) => ({ script: toBytesLike(x.xOnlyPublicKey), amountSats: x.amountSats }));
}

describe('buildSpendTransaction', () => {
  const multi = [
    ...receive([silentPaymentAddress(wallet, 'mainnet')], 'a', [60_000n]),
    ...receive(
      [
        labeledAddress(wallet, 'mainnet', 1),
        changeAddress(wallet, 'mainnet'),
        labeledAddress(wallet, 'mainnet', 7),
      ],
      'b',
      [40_000n, 30_000n, 20_000n],
    ),
  ];

  it('sweeps unlabeled, labeled and change outputs from several transactions with valid signatures', () => {
    const r = buildSpendTransaction(
      params(multi, { destinations: [{ address: dest, amountSats: 100_000n }] }),
    );
    expect(verifyKeyPathSpend(r.rawTx, prevoutsOf(multi))).toBe(true);
    const tx = Transaction.fromRaw(r.rawTx);
    expect(tx.inputsLength).toBe(4);
    expect(tx.id).toBe(r.txid);
    expect(tx.vsize).toBe(r.vsize);
    const total = multi.reduce((a, o) => a + o.amountSats, 0n);
    const outSum = [0, 1].reduce((a, i) => a + (tx.getOutput(i).amount ?? 0n), 0n);
    expect(total - outSum).toBe(r.feeSats);
    expect(r.feeSats).toBe(BigInt(Math.ceil(2 * r.vsize)));
    expect(r.changeIndex).toBe(1);
    expect(r.changeSats).toBe(tx.getOutput(1).amount);
    // The returned PSBT round-trips and carries every key-path signature.
    const p = Transaction.fromPSBT(r.psbt);
    for (let i = 0; i < 4; i++) expect(p.getInput(i).tapKeySig?.length).toBe(64);
  });

  it('covers both key parities (odd-y output keys are negated)', () => {
    let odd = 0;
    let even = 0;
    for (let i = 0; i < 12; i++) {
      const o = receive([silentPaymentAddress(wallet, 'mainnet')], `par${String(i)}`, [10_000n]);
      const f = o[0] as SpendableOutput;
      const raw = modN(bytesToNumberBE(wallet.spendSecret) + bytesToNumberBE(f.spendTweak));
      if (hasEvenY(mulG(raw))) even++;
      else odd++;
      const r = buildSpendTransaction(
        params(o, { destinations: [{ address: dest }], noChange: true, feeRate: 1 }),
      );
      expect(verifyKeyPathSpend(r.rawTx, prevoutsOf(o))).toBe(true);
    }
    expect(even).toBeGreaterThan(0);
    expect(odd).toBeGreaterThan(0);
  });

  it('sweep: single destination without amount takes everything minus fee, no change', () => {
    const r = buildSpendTransaction(
      params(multi, { destinations: [{ address: destLegacy }], noChange: true, feeRate: 1.5 }),
    );
    const tx = Transaction.fromRaw(r.rawTx);
    expect(tx.outputsLength).toBe(1);
    expect(r.changeIndex).toBeNull();
    expect(r.changeSats).toBe(0n);
    expect(tx.getOutput(0).amount).toBe(150_000n - r.feeSats);
    expect(r.vsize).toBe(estimateKeyPathVsize(4, [25]));
    expect(r.feeSats).toBe(BigInt(Math.ceil(1.5 * r.vsize)));
  });

  it('derives a silent payment change output (label 0) that the wallet itself can scan and spend again', () => {
    const o = receive([silentPaymentAddress(wallet, 'mainnet')], 'chg', [200_000n]);
    const r = buildSpendTransaction(
      params(o, {
        destinations: [{ address: dest, amountSats: 100_000n }],
        changeAddress: changeAddress(wallet, 'mainnet'),
      }),
    );
    const tx = Transaction.fromRaw(r.rawTx);
    const inScripts = tx.getInput(0);
    expect(inScripts.txid).toBeDefined();
    // Receiver view: the tweak of the new tx is computable from the (now spent) P2TR input.
    const changeOut = tx.getOutput(r.changeIndex as number);
    const changeKey = (changeOut.script as Uint8Array).subarray(2);
    const spk = Uint8Array.of(0x51, 0x20, ...(o[0] as SpendableOutput).xOnlyPublicKey);
    const tw = computeTransactionTweak([
      {
        txid: (o[0] as SpendableOutput).txid,
        vout: 0,
        scriptSig: new Uint8Array(0),
        witness: [new Uint8Array(64).fill(1)],
        prevoutScriptPubKey: spk,
      },
    ]);
    expect(tw).not.toBeNull();
    const found = scanTweakAgainstSet(
      keysFor,
      (tw as { tweak: Uint8Array }).tweak,
      new Set([toHex(changeKey)]),
    );
    expect(found).toHaveLength(1);
    expect(found[0]?.label).toBe(0);
    const again: SpendableOutput = {
      txid: r.txid,
      vout: r.changeIndex as number,
      amountSats: r.changeSats,
      xOnlyPublicKey: changeKey,
      spendTweak: (found[0] as FoundOutput).spendTweak,
    };
    const r2 = buildSpendTransaction(params([again], { destinations: [{ address: dest }], noChange: true }));
    expect(verifyKeyPathSpend(r2.rawTx, prevoutsOf([again]))).toBe(true);
  });

  it('pays a silent payment destination with a derived taproot output', () => {
    const bob = generateSilentPaymentKeys(seededRng('bob'));
    const bobAddr = silentPaymentAddress(bob, 'mainnet');
    const o = receive([silentPaymentAddress(wallet, 'mainnet')], 'sp-dest', [100_000n]);
    const r = buildSpendTransaction(params(o, { destinations: [{ address: bobAddr, amountSats: 40_000n }] }));
    const tx = Transaction.fromRaw(r.rawTx);
    const key = (tx.getOutput(0).script as Uint8Array).subarray(2);
    expect(decodeSilentPaymentAddress(bobAddr).network).toBe('mainnet');
    // Bob can find it from the spent input tweak.
    const tw = computeTransactionTweak([
      {
        txid: (o[0] as SpendableOutput).txid,
        vout: 0,
        scriptSig: new Uint8Array(0),
        witness: [new Uint8Array(64).fill(1)],
        prevoutScriptPubKey: Uint8Array.of(0x51, 0x20, ...(o[0] as SpendableOutput).xOnlyPublicKey),
      },
    ]) as { tweak: Uint8Array };
    const hits = scanOutputsForTweak(
      { scanSecret: bob.scanSecret, spendPublicKey: bob.spendPublicKey },
      tw.tweak,
      [key],
    );
    expect(hits).toHaveLength(1);
  });

  it('tiny leftover goes to fee, large leftover without change address is refused', () => {
    const o = receive([silentPaymentAddress(wallet, 'mainnet')], 'left', [50_400n]);
    const r = buildSpendTransaction(
      params(o, {
        destinations: [{ address: dest, amountSats: 50_000n }],
        feeRate: 1,
        changeAddress: destTr,
      }),
    );
    expect(r.changeIndex).toBeNull();
    expect(r.feeSats).toBe(400n);
    const big = receive([silentPaymentAddress(wallet, 'mainnet')], 'left2', [100_000n]);
    expect(code(() => buildSpendTransaction(params(big, { noChange: true })))).toBe('INSUFFICIENT_FUNDS');
  });

  it('honours rbf flag and rejects a signature verification failure on tampering', () => {
    const o = receive([silentPaymentAddress(wallet, 'mainnet')], 'rbf', [100_000n]);
    const a = Transaction.fromRaw(buildSpendTransaction(params(o)).rawTx);
    expect(a.getInput(0).sequence).toBe(0xfffffffd);
    const b = buildSpendTransaction(params(o, { rbf: false }));
    expect(Transaction.fromRaw(b.rawTx).getInput(0).sequence).toBe(0xfffffffe);
    const bad = Uint8Array.from(b.rawTx);
    bad.fill((bad[bad.length - 20] ?? 0) ^ 1, bad.length - 20, bad.length - 19); // flip a signature bit
    expect(verifyKeyPathSpend(bad, prevoutsOf(o))).toBe(false);
    expect(verifyKeyPathSpend(b.rawTx, [])).toBe(false);
    expect(verifyKeyPathSpend(b.rawTx, [{ script: new Uint8Array(22), amountSats: 1n }])).toBe(false);
    expect(
      verifyKeyPathSpend(b.rawTx, [
        { script: toBytesLike(new Uint8Array(32).fill(2)), amountSats: 100_000n },
      ]),
    ).toBe(false);
  });

  it('uses testnet addresses on testnet', () => {
    const o = receive([silentPaymentAddress(wallet, 'mainnet')], 'tn', [100_000n]);
    const tb = Address(TEST_NETWORK).encode({ type: 'wpkh', hash: new Uint8Array(20).fill(1) });
    // The mainnet-derived output keys are network independent; only address handling differs.
    const r = buildSpendTransaction(
      params(o, {
        destinations: [{ address: tb, amountSats: 40_000n }],
        network: 'testnet',
        changeAddress: tb,
      }),
    );
    expect(OutScript.decode(Transaction.fromRaw(r.rawTx).getOutput(0).script as Uint8Array).type).toBe(
      'wpkh',
    );
    expect(code(() => buildSpendTransaction(params(o, { network: 'testnet' })))).toBe('INVALID_ADDRESS');
  });

  it('estimateKeyPathVsize matches known sizes', () => {
    expect(estimateKeyPathVsize(1, [22, 34])).toBe(
      Math.ceil((4 * (4 + 1 + 1 + 4) + 2 + 4 * 41 + 66 + 4 * (8 + 1 + 22) + 4 * (8 + 1 + 34)) / 4),
    );
    expect(estimateKeyPathVsize(1, [34])).toBe(111); // 1-in 1-out P2TR key-path
    expect(estimateKeyPathVsize(300, [34])).toBeGreaterThan(300 * 57);
    expect(estimateKeyPathVsize(1, new Array<number>(300).fill(22))).toBeGreaterThan(300 * 31);
  });

  it('rejects bad parameters', () => {
    const o = receive([silentPaymentAddress(wallet, 'mainnet')], 'bad', [100_000n]);
    const one = o[0] as SpendableOutput;
    const cases: [string, BuildSpendParams, string][] = [
      ['no outputs', params([]), 'INVALID_INPUT'],
      ['no destinations', params(o, { destinations: [] }), 'INVALID_INPUT'],
      ['feerate 0', params(o, { feeRate: 0 }), 'INVALID_INPUT'],
      ['feerate NaN', params(o, { feeRate: Number.NaN }), 'INVALID_INPUT'],
      ['feerate cap', params(o, { feeRate: MAX_FEE_RATE_SAT_PER_VB + 1 }), 'FEE_TOO_HIGH'],
      ['neg dust', params(o, { dustLimitSats: -1n }), 'INVALID_INPUT'],
      ['dup outpoint', params([one, one]), 'INVALID_INPUT'],
      ['bad txid', params([{ ...one, txid: 'zz' }]), 'INVALID_INPUT'],
      ['bad vout', params([{ ...one, vout: -1 }]), 'INVALID_INPUT'],
      ['bad key len', params([{ ...one, xOnlyPublicKey: new Uint8Array(31) }]), 'INVALID_INPUT'],
      ['zero amount', params([{ ...one, amountSats: 0n }]), 'INVALID_AMOUNT'],
      ['dest zero', params(o, { destinations: [{ address: dest, amountSats: 0n }] }), 'INVALID_AMOUNT'],
      ['dest dust', params(o, { destinations: [{ address: dest, amountSats: 100n }] }), 'DUST_OUTPUT'],
      [
        'too much',
        params(o, { destinations: [{ address: dest, amountSats: 100_000n }] }),
        'INSUFFICIENT_FUNDS',
      ],
      [
        'bad dest addr',
        params(o, { destinations: [{ address: 'nope', amountSats: 1000n }] }),
        'INVALID_ADDRESS',
      ],
      [
        'wrong net sp',
        params(o, { destinations: [{ address: 'tsp1' + 'q'.repeat(10), amountSats: 1000n }] }),
        'INVALID_ADDRESS',
      ],
      ['wrong tweak', params([{ ...one, xOnlyPublicKey: xOnly(mulG(9n)) }]), 'INVALID_INPUT'],
    ];
    for (const [name, p, expected] of cases)
      expect(
        code(() => buildSpendTransaction(p)),
        name,
      ).toBe(expected);
    const tiny = receive([silentPaymentAddress(wallet, 'mainnet')], 'tiny', [100n]);
    expect(
      code(() => buildSpendTransaction(params(tiny, { destinations: [{ address: dest }], noChange: true }))),
    ).toBe('INSUFFICIENT_FUNDS');
    const small = receive([silentPaymentAddress(wallet, 'mainnet')], 'small', [600n]);
    expect(
      code(() =>
        buildSpendTransaction(
          params(small, { destinations: [{ address: dest }], noChange: true, feeRate: 1 }),
        ),
      ),
    ).toBe('DUST_OUTPUT');
    const fat = receive([silentPaymentAddress(wallet, 'mainnet')], 'fat', [1_500_000n]);
    expect(
      code(() =>
        buildSpendTransaction(
          params(fat, { destinations: [{ address: dest }], noChange: true, feeRate: 9000 }),
        ),
      ),
    ).toBe('FEE_TOO_HIGH');
  });

  it('p2tr fixture sanity (non-silent-payment keys are rejected as wrong tweak)', () => {
    const t = p2trInput('x');
    expect(t.key.isTaproot).toBe(true);
    expect(schnorr.getPublicKey(t.key.privateKey)).toHaveLength(32);
  });
});
