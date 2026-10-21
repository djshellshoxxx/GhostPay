import { describe, expect, it } from 'vitest';
import { createBitcoinAdapter, BITCOIN_FEES } from './adapter.js';
import type { BitcoinChainAdapter, BitcoinInvoice, DetectedBitcoinPayment } from './adapter-types.js';
import { decodeSilentPaymentAddress } from './address.js';
import { toHex } from './ecc.js';
import { SilentPaymentError } from './errors.js';
import { generateSilentPaymentKeys } from './keys.js';
import { labeledAddress, silentPaymentAddress } from './labels.js';
import { spendPrivateKey } from './receiver.js';
import { seededRng } from './rng.testutil.js';
import { InMemoryTweakSource } from './scan/memory.js';
import { makeBlock, p2wpkhInput } from './fixtures.testutil.js';
import { parseBitcoinUri } from './uri.js';

const alice = generateSilentPaymentKeys(seededRng('ad-alice'));
const mainAddr = silentPaymentAddress(alice, 'mainnet');
const testAddr = silentPaymentAddress(alice, 'testnet');

function code(fn: () => unknown): string | undefined {
  try {
    fn();
  } catch (e) {
    return e instanceof SilentPaymentError ? e.code : 'OTHER';
  }
  return undefined;
}

const inv = (over: Partial<BitcoinInvoice> = {}): BitcoinInvoice => ({
  chainId: 'btc-mainnet',
  address: mainAddr,
  amountSats: 50_000n,
  ...over,
});

describe('Bitcoin ChainAdapter', () => {
  const main = createBitcoinAdapter({ network: 'mainnet' });
  const test = createBitcoinAdapter({ network: 'testnet' });

  it('identifies itself', () => {
    expect([main.family, main.chainId, test.family, test.chainId]).toEqual([
      'bitcoin',
      'btc-mainnet',
      'bitcoin',
      'btc-testnet',
    ]);
    const typed: BitcoinChainAdapter = main;
    expect(typed.family).toBe('bitcoin');
  });

  it('fee capability is "none": nothing enforceable on any line', () => {
    expect(main.fees).toEqual({
      checkout: 'not_enforceable',
      gasSponsorship: 'not_enforceable',
      flatSecurity: 'not_enforceable',
    });
    expect(main.fees).toBe(BITCOIN_FEES);
    expect(main.fees.checkoutBps).toBeUndefined();
  });

  it('parseRecipient returns viewing = B_scan, spending = B_m and a canonical address', () => {
    const labeled = labeledAddress(alice, 'mainnet', 4);
    const r = main.parseRecipient(labeled);
    expect(r.family).toBe('bitcoin');
    expect(r.canonical).toBe(labeled);
    expect(toHex(r.viewingPublicKey)).toBe(toHex(alice.scanPublicKey));
    expect(toHex(r.spendingPublicKey)).toBe(toHex(decodeSilentPaymentAddress(labeled).spendPublicKey));
  });

  it('parseRecipient rejects other-network and garbage input', () => {
    expect(code(() => main.parseRecipient(testAddr))).toBe('NETWORK_MISMATCH');
    expect(code(() => test.parseRecipient(mainAddr))).toBe('NETWORK_MISMATCH');
    expect(code(() => main.parseRecipient('bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq'))).toBe(
      'INVALID_ADDRESS',
    );
  });

  it('builds a payment request with sats, no fee and a BIP-21 style URI', () => {
    const req = main.buildPaymentRequest(inv({ amountSats: 150_000_000n }));
    expect(req).toMatchObject({
      family: 'bitcoin',
      chainId: 'btc-mainnet',
      asset: 'native',
      grossAmount: 150_000_000n,
      netAmount: 150_000_000n,
      feeAmount: 0n,
      address: mainAddr,
    });
    expect(req.uri).toBe(`bitcoin:?sp=${mainAddr}&amount=1.5`);
    expect(parseBitcoinUri(req.uri, 'mainnet').amountSats).toBe(150_000_000n);
  });

  it('uses quotedTokenAmount for quote-based invoices and carries label/message', () => {
    const q = main.buildPaymentRequest(
      { chainId: 'btc-mainnet', address: mainAddr, label: 'Shop' },
      { quotedTokenAmount: 1234n },
    );
    expect(q.netAmount).toBe(1234n);
    expect(parseBitcoinUri(q.uri).label).toBe('Shop');
    const fixedWins = main.buildPaymentRequest(inv({ message: 'hi' }), { quotedTokenAmount: 1n });
    expect(fixedWins.netAmount).toBe(50_000n);
    expect(parseBitcoinUri(fixedWins.uri).message).toBe('hi');
  });

  it('rejects missing, zero, negative and oversized amounts', () => {
    const noAmount = { chainId: 'btc-mainnet', address: mainAddr } satisfies BitcoinInvoice;
    expect(code(() => main.buildPaymentRequest(noAmount))).toBe('INVALID_AMOUNT');
    expect(code(() => main.buildPaymentRequest(inv({ amountSats: 0n })))).toBe('INVALID_AMOUNT');
    expect(code(() => main.buildPaymentRequest(inv({ amountSats: -1n })))).toBe('INVALID_AMOUNT');
    expect(code(() => main.buildPaymentRequest(inv({ amountSats: 2_100_000_000_000_001n })))).toBe(
      'INVALID_AMOUNT',
    );
  });

  it('chain mismatch: an invoice for one chain is never payable through another adapter', () => {
    expect(code(() => main.buildPaymentRequest(inv({ chainId: 'btc-testnet' })))).toBe('CHAIN_MISMATCH');
    expect(code(() => main.buildPaymentRequest(inv({ chainId: '1' })))).toBe('CHAIN_MISMATCH');
    expect(code(() => main.buildPaymentRequest(inv({ chainId: 'sol-mainnet' })))).toBe('CHAIN_MISMATCH');
    // right chainId label but wrong-network address
    expect(code(() => main.buildPaymentRequest(inv({ address: testAddr })))).toBe('NETWORK_MISMATCH');
    expect(code(() => test.buildPaymentRequest(inv({ chainId: 'btc-testnet', address: mainAddr })))).toBe(
      'NETWORK_MISMATCH',
    );
    expect(code(() => test.buildPaymentRequest(inv()))).toBe('CHAIN_MISMATCH');
    expect(test.buildPaymentRequest(inv({ chainId: 'btc-testnet', address: testAddr })).uri).toMatch(
      /^bitcoin:\?sp=tsp1q/,
    );
  });

  describe('scan', () => {
    const source = new InMemoryTweakSource([
      makeBlock(10, [
        { inputs: [p2wpkhInput('s1')], recipients: [mainAddr, labeledAddress(alice, 'mainnet', 2)] },
      ]),
      makeBlock(11, []),
      makeBlock(12, [{ inputs: [p2wpkhInput('s2')], recipients: [mainAddr] }]),
    ]);
    const adapter = createBitcoinAdapter({ network: 'mainnet', source });
    const view = { viewingSecret: alice.scanSecret, spendingPublicKey: alice.spendPublicKey, labels: [2] };

    async function all(
      a: BitcoinChainAdapter,
      from: bigint,
      to: bigint | undefined,
      ctl = new AbortController(),
      v = view,
    ): Promise<DetectedBitcoinPayment[]> {
      const out: DetectedBitcoinPayment[] = [];
      for await (const p of a.scan(
        to === undefined ? { fromBlock: from } : { fromBlock: from, toBlock: to },
        v,
        ctl.signal,
      ))
        out.push(p);
      return out;
    }

    it('yields detected payments with spendable tweaks', async () => {
      const found = await all(adapter, 10n, undefined);
      expect(found.map((f) => [f.blockHeight, f.k, f.label])).toEqual([
        [10n, 0, null],
        [10n, 1, 2],
        [12n, 0, null],
      ]);
      for (const f of found) {
        expect(f.family).toBe('bitcoin');
        expect(toHex(spendPrivateKey(alice.spendSecret, f.spendTweak).xOnlyPublicKey)).toBe(
          toHex(f.xOnlyPublicKey),
        );
      }
    });

    it('NC-03: results are unverified without a verifier; a verifier is honoured and a seenKeys set is shared', async () => {
      const unverified = await all(adapter, 10n, 10n);
      expect(unverified.every((f) => f.verified === false)).toBe(true);
      const seenKeys = new Set<string>();
      const strict = createBitcoinAdapter({ network: 'mainnet', source, verifier: () => Promise.resolve(true), seenKeys });
      const ok = await all(strict, 10n, 10n);
      expect(ok.length).toBeGreaterThan(0);
      expect(ok.every((f) => f.verified === true && f.duplicateKey === false)).toBe(true);
      expect((await all(strict, 10n, 10n)).every((f) => f.duplicateKey === true)).toBe(true);
      const rejecting = createBitcoinAdapter({ network: 'mainnet', source, verifier: () => Promise.resolve(false) });
      expect(await all(rejecting, 10n, 10n)).toEqual([]);
    });

    it('respects the range and the label list', async () => {
      expect(await all(adapter, 11n, 11n)).toEqual([]);
      const noLabel = await all(adapter, 10n, 10n, new AbortController(), {
        viewingSecret: alice.scanSecret,
        spendingPublicKey: alice.spendPublicKey,
      } as typeof view);
      expect(noLabel).toHaveLength(1);
    });

    it('is unsupported without a tweak source and rejects out-of-range heights', async () => {
      await expect(all(main, 0n, 1n)).rejects.toSatisfy(
        (e) =>
          code(() => {
            throw e;
          }) === 'UNSUPPORTED',
      );
      await expect(all(adapter, -1n, undefined)).rejects.toSatisfy(
        (e) =>
          code(() => {
            throw e;
          }) === 'INVALID_INPUT',
      );
      await expect(all(adapter, 0n, 2n ** 32n)).rejects.toSatisfy(
        (e) =>
          code(() => {
            throw e;
          }) === 'INVALID_INPUT',
      );
    });

    it('stops when the signal is aborted', async () => {
      const ctl = new AbortController();
      ctl.abort();
      expect(await all(adapter, 10n, undefined, ctl)).toEqual([]);
    });

    it('never gives the source anything but block heights', async () => {
      await all(adapter, 10n, 12n);
      for (const r of source.requests) {
        expect(
          Object.keys(r)
            .sort()
            .every((k) => k === 'method' || k === 'height'),
        ).toBe(true);
        expect(
          r.height === undefined || (Number.isInteger(r.height) && r.height >= 10 && r.height <= 12),
        ).toBe(true);
      }
    });
  });
});
