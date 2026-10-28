import { encodeSilentPaymentAddress, SilentPaymentError, taprootScriptPubKey, verifyKeyPathSpend } from '@ghostpay/btc-silent-payments';
import { bech32 } from '@scure/base';
import { describe, expect, it } from 'vitest';
import { EsploraClient } from './esplora';
import { mockChain, walletA } from './fixtures.testutil';
import { scanForPayments, type FoundPayment } from './scan';
import { btcErrorMessage, checkDestination, formatBtc, reviewSweep, signSweep } from './sweep';
import { paymentUri } from './wallet';

function addr(hrp: string, byte: number): string {
  return bech32.encode(hrp, [0, ...bech32.toWords(new Uint8Array(20).fill(byte))]);
}
const BCRT = addr('bcrt', 3);
const TB = addr('tb', 3);
const MAIN = addr('bc', 3);

async function payments(count = 1): Promise<FoundPayment[]> {
  const w = walletA();
  const chain = mockChain('regtest', w, { payments: count });
  const client = new EsploraClient({ baseUrl: 'https://esplora.test/api', fetchFn: chain.fetchFn });
  return [...(await scanForPayments({ client, wallet: w, fromHeight: 0 })).found];
}

function code(f: () => unknown): string {
  try {
    f();
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : 'other';
  }
  return 'none';
}

async function codeAsync(p: () => Promise<unknown>): Promise<string> {
  try {
    await p();
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : 'other';
  }
  return 'none';
}

describe('reviewSweep', () => {
  it('shows exact amounts before any signing', async () => {
    const w = walletA();
    const p = await payments();
    const r = reviewSweep(w, p, BCRT, 2);
    expect(r.totalSats).toBe(50_000n);
    expect(r.feeSats + r.sendSats).toBe(50_000n);
    expect(r.destinationKind).toBe('regular address');
    expect(r.rbf).toBe(true);
    expect(r.warnings).toEqual([]);
  });

  it('rejects wrong-network and malformed destinations, empty selections and bad fees', async () => {
    const w = walletA();
    const p = await payments();
    expect(code(() => reviewSweep(w, p, TB, 2))).toBe('INVALID_ADDRESS');
    expect(code(() => reviewSweep(w, p, MAIN, 2))).toBe('INVALID_ADDRESS');
    expect(code(() => reviewSweep(w, p, 'garbage', 2))).toBe('INVALID_ADDRESS');
    expect(code(() => reviewSweep(w, [], BCRT, 2))).toBe('INVALID_INPUT');
    expect(code(() => reviewSweep(w, p, '  ', 2))).toBe('INVALID_INPUT');
    expect(code(() => reviewSweep(w, p, BCRT, Number.NaN))).toBe('INVALID_INPUT');
    expect(code(() => reviewSweep(w, p, BCRT, 100_000))).toBe('FEE_TOO_HIGH');
  });

  it('warns about high fee rates, big fee share and sweeping to self', async () => {
    const w = walletA();
    const p = await payments();
    const hi = reviewSweep(w, p, BCRT, 60);
    expect(hi.warnings.some((x) => x.includes('high'))).toBe(true);
    expect(hi.warnings.some((x) => x.includes('10%'))).toBe(true);
    expect(reviewSweep(w, p, w.address, 1).warnings.some((x) => x.includes('own receive'))).toBe(true);
    expect(reviewSweep(w, p, w.address, 1).destinationKind).toBe('silent payment address');
  });

  it('warns that spending several payments in one transaction links them publicly', async () => {
    const w = walletA();
    expect(reviewSweep(w, await payments(), BCRT, 2).warnings.some((x) => x.includes('link'))).toBe(false);
    const two = await payments(2);
    expect(two).toHaveLength(2);
    const r = reviewSweep(w, two, BCRT, 2);
    expect(r.warnings.filter((x) => x.includes('spends 2 payments in one transaction') && x.includes('links them publicly'))).toHaveLength(1);
    expect(r.warnings.some((x) => x.includes('separate sweeps to the same address also link them'))).toBe(true);
  });

  it('refuses a silent payment address for another network, or a malformed one, at review rather than at signing', async () => {
    const w = walletA();
    const p = await payments();
    const mainnetSp = encodeSilentPaymentAddress('mainnet', w.keys.scanPublicKey, w.keys.spendPublicKey);
    expect(code(() => reviewSweep(w, p, mainnetSp, 2))).toBe('INVALID_ADDRESS');
    expect(code(() => reviewSweep(w, p, `${w.address.slice(0, -1)}${w.address.endsWith('q') ? 'p' : 'q'}`, 2))).toBe('INVALID_ADDRESS');
    expect(code(() => reviewSweep(w, p, w.address.toUpperCase(), 2))).toBe('INVALID_ADDRESS');
  });
});

describe('checkDestination', () => {
  it('checks a destination for the wallet network without any selected payment', () => {
    const w = walletA();
    expect(checkDestination(w, ` ${BCRT} `)).toBe(BCRT);
    expect(checkDestination(w, w.address)).toBe(w.address);
    for (const bad of [TB, MAIN, 'garbage', encodeSilentPaymentAddress('mainnet', w.keys.scanPublicKey, w.keys.spendPublicKey)]) {
      expect(code(() => checkDestination(w, bad))).toBe('INVALID_ADDRESS');
    }
    expect(code(() => checkDestination(w, '  '))).toBe('INVALID_INPUT');
  });
});

describe('signSweep', () => {
  it('signs exactly what was reviewed, with valid key-path signatures', async () => {
    const w = walletA();
    const p = await payments();
    const review = reviewSweep(w, p, BCRT, 2);
    const s = await signSweep(w, p, review);
    expect(s.feeSats).toBe(review.feeSats);
    expect(s.vsize).toBe(review.vsize);
    expect(s.txid).toMatch(/^[0-9a-f]{64}$/);
    const raw = Uint8Array.from(s.rawHex.match(/../g)?.map((h) => Number.parseInt(h, 16)) ?? []);
    const ok = verifyKeyPathSpend(raw, p.map((x) => ({ script: taprootScriptPubKey(x.xOnlyPublicKey), amountSats: x.amountSats })));
    expect(ok).toBe(true);
  });

  it('sweeps to a silent payment address too', async () => {
    const w = walletA();
    const p = await payments();
    const review = reviewSweep(w, p, w.address, 1);
    expect((await signSweep(w, p, review)).rawHex.length).toBeGreaterThan(100);
  });

  it('refuses when the selection differs from the review', async () => {
    const w = walletA();
    const p = await payments();
    const review = reviewSweep(w, p, BCRT, 2);
    const first = p[0];
    if (first === undefined) throw new Error('fixture');
    expect(await codeAsync(() => signSweep(w, [], review))).toBe('INVALID_INPUT');
    expect(await codeAsync(() => signSweep(w, [{ ...first, amountSats: first.amountSats + 1n }], review))).toBe('INVALID_INPUT');
    expect(await codeAsync(() => signSweep(w, [{ ...first, vout: 7 }], review))).toBe('INVALID_INPUT');
    expect(await codeAsync(() => signSweep(w, p, { ...review, feeSats: review.feeSats + 1n, feeRate: review.feeRate + 5 }))).toBe('SIGNATURE_INVALID');
  });

  it('refuses a payment the wallet cannot spend (wrong output key)', async () => {
    const w = walletA();
    const p = await payments();
    const first = p[0];
    if (first === undefined) throw new Error('fixture');
    const bad = { ...first, xOnlyPublicKey: new Uint8Array(32).fill(1) };
    const review = reviewSweep(w, [bad], BCRT, 2);
    expect(await codeAsync(() => signSweep(w, [bad], review))).toBe('INVALID_INPUT');
  });
});

describe('helpers', () => {
  it('formats amounts and maps errors without leaking input', () => {
    expect(formatBtc(150_000_000n)).toBe('1.5 BTC');
    for (const c of ['INVALID_ADDRESS', 'INSUFFICIENT_FUNDS', 'TRANSPORT_FAILURE', 'REORG_DETECTED', 'ABORTED'] as const) {
      expect(btcErrorMessage(new SilentPaymentError(c))).not.toBe('Bitcoin operation failed.');
    }
    expect(btcErrorMessage(new SilentPaymentError('RNG_FAILURE'))).toBe('Bitcoin operation failed.');
    expect(btcErrorMessage(new Error('plain'))).toBe('plain');
    expect(btcErrorMessage('x')).toBe('Bitcoin operation failed.');
  });

  it('builds a payment URI with optional amount and label', () => {
    const w = walletA();
    expect(paymentUri(w)).toBe(`bitcoin:?sp=${w.address}`);
    expect(paymentUri(w, 150_000n, 'Shop')).toContain('amount=0.0015');
    expect(paymentUri(w, undefined, '')).toBe(`bitcoin:?sp=${w.address}`);
  });
});
