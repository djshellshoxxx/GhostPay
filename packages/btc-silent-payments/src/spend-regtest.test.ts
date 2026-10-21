import { Address, TEST_NETWORK } from '@scure/btc-signer';
import { describe, expect, it } from 'vitest';
import { toHex } from './ecc.js';
import { fakeTxid, p2wpkhInput } from './fixtures.testutil.js';
import { generateSilentPaymentKeys } from './keys.js';
import { changeAddress } from './labels.js';
import { computeTransactionTweak, scanOutputsForTweak } from './receiver.js';
import { seededRng } from './rng.testutil.js';
import { createSilentPaymentOutputs } from './sender.js';
import { buildSpendTransaction, type SpendableOutput } from './spend.js';

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
