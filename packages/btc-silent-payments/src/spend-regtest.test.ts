import { Address, TEST_NETWORK } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { toHex } from './ecc.js';
import { fakeTxid, p2wpkhInput } from './fixtures.testutil.js';
import { generateSilentPaymentKeys } from './keys.js';
import { changeAddress } from './labels.js';
import { computeTransactionTweak, scanOutputsForTweak } from './receiver.js';
import { seededRng } from './rng.testutil.js';
import { createSilentPaymentOutputs } from './sender.js';
import { buildSpendTransaction, previewSweep, type SpendableOutput } from './spend.js';

const wallet = generateSilentPaymentKeys(seededRng('regtest-wallet'));

function funded(): SpendableOutput {
  const t = p2wpkhInput('regtest-fund');
  const addr = changeAddress(wallet, 'testnet');
  const [out] = createSilentPaymentOutputs({
    inputs: [t.key],
    outpoints: [{ txid: t.input.txid, vout: t.input.vout }],
    recipients: [addr],
    network: 'testnet',
  });
  const tw = computeTransactionTweak([t.input]);
  if (tw === null || out === undefined) throw new Error('fixture');
  const found = scanOutputsForTweak(
    { scanSecret: wallet.scanSecret, spendPublicKey: wallet.spendPublicKey },
    tw.tweak,
    [out.xOnlyPublicKey],
  );
  const f = found[0];
  if (f === undefined) throw new Error('not found');
  return {
    txid: fakeTxid('regtest-funding'),
    vout: 0,
    amountSats: 100_000n,
    xOnlyPublicKey: f.xOnlyPublicKey,
    spendTweak: f.spendTweak,
  };
}

const bcrt = Address({ ...TEST_NETWORK, bech32: 'bcrt' }).encode({ type: 'wpkh', hash: new Uint8Array(20).fill(3) });
const tb = Address(TEST_NETWORK).encode({ type: 'wpkh', hash: new Uint8Array(20).fill(3) });

describe('regtest address support in buildSpendTransaction', () => {
  const base = { outputs: [funded()], spendSecret: wallet.spendSecret, feeRate: 1, network: 'testnet' as const };

  it('sweeps to a bcrt address only when regtest is set', () => {
    const ok = buildSpendTransaction({ ...base, destinations: [{ address: bcrt }], regtest: true });
    expect(ok.feeSats).toBeGreaterThan(0n);
    expect(toHex(ok.rawTx).length).toBeGreaterThan(0);
    expect(() => buildSpendTransaction({ ...base, destinations: [{ address: bcrt }] })).toThrow();
  });

  it('rejects tb addresses on regtest', () => {
    expect(() => buildSpendTransaction({ ...base, destinations: [{ address: tb }], regtest: true })).toThrow();
    expect(buildSpendTransaction({ ...base, destinations: [{ address: tb }] }).txid).toHaveLength(64);
  });
});

describe('previewSweep', () => {
  const out = funded();
  const common = { inputAmountsSats: [out.amountSats], feeRate: 1.5, network: 'testnet' as const };

  it('matches buildSpendTransaction fee, vsize and amount', () => {
    for (const address of [bcrt, changeAddress(wallet, 'testnet')]) {
      const pv = previewSweep({ ...common, address, regtest: true });
      const built = buildSpendTransaction({
        outputs: [out],
        spendSecret: wallet.spendSecret,
        destinations: [{ address }],
        feeRate: 1.5,
        network: 'testnet',
        regtest: true,
      });
      expect(pv.feeSats).toBe(built.feeSats);
      expect(pv.vsize).toBe(built.vsize);
      expect(pv.sendSats).toBe(out.amountSats - built.feeSats);
      expect(pv.destinationIsSilentPayment).toBe(address.startsWith('tsp1'));
    }
  });

  it('rejects the same bad inputs as the builder', () => {
    const code = (f: () => unknown): string => {
      try {
        f();
      } catch (e) {
        return (e as { code?: string }).code ?? 'other';
      }
      return 'none';
    };
    expect(code(() => previewSweep({ ...common, inputAmountsSats: [], address: bcrt, regtest: true }))).toBe('INVALID_INPUT');
    expect(code(() => previewSweep({ ...common, feeRate: 0, address: bcrt, regtest: true }))).toBe('INVALID_INPUT');
    expect(code(() => previewSweep({ ...common, feeRate: 1e9, address: bcrt, regtest: true }))).toBe('FEE_TOO_HIGH');
    expect(code(() => previewSweep({ ...common, address: tb, regtest: true }))).toBe('INVALID_ADDRESS');
    expect(code(() => previewSweep({ ...common, inputAmountsSats: [100n], address: bcrt, regtest: true }))).toBe('INSUFFICIENT_FUNDS');
    expect(code(() => previewSweep({ ...common, inputAmountsSats: [690n], address: bcrt, regtest: true }))).toBe('DUST_OUTPUT');
    expect(code(() => previewSweep({ ...common, dustLimitSats: -1n, address: bcrt, regtest: true }))).toBe('INVALID_INPUT');
    expect(code(() => previewSweep({ ...common, inputAmountsSats: [0n], address: bcrt, regtest: true }))).toBe('INVALID_AMOUNT');
    expect(code(() => previewSweep({ ...common, inputAmountsSats: [100_000n], feeRate: 600, address: bcrt, regtest: true }))).toBe('FEE_TOO_HIGH');
  });
});
