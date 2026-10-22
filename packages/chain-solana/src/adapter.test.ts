import { describe, expect, it } from 'vitest';
import { createSolanaAdapter, SOLANA_FEES } from './adapter.js';
import type { AnnouncementRecord, AnnouncementSource } from './adapter-types.js';
import { encodeAnnouncement } from './announcement.js';
import { encodeMetaAddress, generateStealthKeys } from './keys.js';
import { getAssociatedTokenAddress } from './pda.js';
import { seededRng } from './rng.testutil.js';
import { deriveStealthPayment, deriveStealthSpendScalar } from './stealth.js';

const code = (c: string): unknown => expect.objectContaining({ code: c });
const rng = seededRng('adapter.test');
const MINT = 'So11111111111111111111111111111111111111112';

function sourceOf(
  records: AnnouncementRecord[],
  seen?: { from?: bigint; to?: bigint | undefined },
): AnnouncementSource {
  return {
    async *announcements(range) {
      if (seen) {
        seen.from = range.fromSlot;
        seen.to = range.toSlot;
      }
      for (const r of records) {
        await Promise.resolve();
        yield r;
      }
    },
  };
}

async function collect<T>(it: AsyncIterable<T>): Promise<T[]> {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
}

describe('createSolanaAdapter', () => {
  it('only enables devnet/testnet', () => {
    expect(() => createSolanaAdapter({ chainId: 'sol-mainnet', source: sourceOf([]) })).toThrow(
      code('CHAIN_DISABLED'),
    );
    const a = createSolanaAdapter({ chainId: 'sol-devnet', source: sourceOf([]) });
    expect(a.family).toBe('solana');
    expect(a.chainId).toBe('sol-devnet');
    expect(a.fees).toBe(SOLANA_FEES);
    expect(a.fees).toEqual({
      checkout: 'not_enforceable',
      gasSponsorship: 'not_enforceable',
      flatSecurity: 'not_enforceable',
    });
  });

  it('parseRecipient canonicalizes and validates', () => {
    const keys = generateStealthKeys(rng);
    const meta = encodeMetaAddress(keys);
    const a = createSolanaAdapter({ chainId: 'sol-testnet', source: sourceOf([]) });
    const rec = a.parseRecipient(meta);
    expect(rec).toEqual({
      family: 'solana',
      canonical: meta,
      spendingPublicKey: keys.spendPublicKey,
      viewingPublicKey: keys.viewPublicKey,
    });
    expect(() => a.parseRecipient('nope')).toThrow(code('INVALID_META_ADDRESS'));
  });

  it('buildPaymentRequest: zero fee, native and SPL, quote, validation', () => {
    const keys = generateStealthKeys(rng);
    const metaAddress = encodeMetaAddress(keys);
    const a = createSolanaAdapter({ chainId: 'sol-devnet', source: sourceOf([]) });
    const req = a.buildPaymentRequest({ chainId: 'sol-devnet', metaAddress, asset: 'native', amount: 1000n });
    expect([req.grossAmount, req.netAmount, req.feeAmount]).toEqual([1000n, 1000n, 0n]);
    const built = req.build({ rng });
    expect(built.associatedTokenAddress).toBeUndefined();
    expect(built.memo.startsWith('gpst1:')).toBe(true);
    expect(built.announcement.length).toBe(34);
    expect(req.build().stealthAddress).not.toBe(built.stealthAddress);

    const spl = a.buildPaymentRequest(
      { chainId: 'sol-devnet', metaAddress, asset: MINT },
      { quotedTokenAmount: 5n },
    );
    expect(spl.grossAmount).toBe(5n);
    const b2 = spl.build({ rng });
    expect(b2.associatedTokenAddress).toBe(getAssociatedTokenAddress(b2.stealthAddress, MINT));

    const bad = [
      { chainId: 'sol-testnet', metaAddress, asset: 'native', amount: 1n },
      { chainId: 'sol-devnet', metaAddress, asset: 'native' },
      { chainId: 'sol-devnet', metaAddress, asset: 'native', amount: 0n },
      { chainId: 'sol-devnet', metaAddress, asset: 'native', amount: 1n << 64n },
    ];
    for (const inv of bad) expect(() => a.buildPaymentRequest(inv)).toThrow(code('INVALID_INVOICE'));
    expect(() =>
      a.buildPaymentRequest({ chainId: 'sol-devnet', metaAddress, asset: 'bad', amount: 1n }),
    ).toThrow(code('INVALID_ADDRESS'));
    expect(() =>
      a.buildPaymentRequest({ chainId: 'sol-devnet', metaAddress: 'x', asset: 'native', amount: 1n }),
    ).toThrow(code('INVALID_META_ADDRESS'));
  });

  it('scan detects own payments over memo and binary payloads and skips junk', async () => {
    const keys = generateStealthKeys(rng);
    const other = generateStealthKeys(rng);
    const mine1 = deriveStealthPayment(keys, rng);
    const mine2 = deriveStealthPayment(keys, rng);
    const foreign = deriveStealthPayment(other, rng);
    const withMeta = encodeAnnouncement({ ...mine2, metadata: Uint8Array.of(9, 9) });
    const memo = (p: typeof mine1): string => 'gpst1:' + Buffer.from(p.announcement).toString('base64url');
    const records: AnnouncementRecord[] = [
      { slot: 1n, signature: 'a', payload: memo(mine1), destination: mine1.stealthAddress },
      { slot: 2n, signature: 'b', payload: withMeta, destination: mine2.stealthAddress },
      { slot: 3n, signature: 'c', payload: foreign.announcement, destination: foreign.stealthAddress },
      { slot: 4n, signature: 'd', payload: 'garbage' },
      { slot: 5n, signature: 'e', payload: new Uint8Array(3) },
      { slot: 6n, signature: 'f', payload: mine1.announcement, destination: '0OIl-not-base58' },
      { slot: 7n, signature: 'g', payload: mine1.announcement, destination: mine2.stealthAddress },
      { slot: 8n, signature: 'h', payload: mine1.announcement },
    ];
    const seen: { from?: bigint; to?: bigint | undefined } = {};
    const a = createSolanaAdapter({ chainId: 'sol-devnet', source: sourceOf(records, seen) });
    const found = await collect(
      a.scan(
        { fromBlock: 1n, toBlock: 9n },
        { viewingSecret: keys.viewSecret, spendingPublicKey: keys.spendPublicKey },
        new AbortController().signal,
      ),
    );
    expect(seen).toEqual({ from: 1n, to: 9n });
    expect(found.map((f) => f.slot)).toEqual([1n, 2n, 8n]);
    expect(found[0]?.stealthAddress).toBe(mine1.stealthAddress);
    expect(Array.from(found[1]?.metadata ?? [])).toEqual([9, 9]);
    const x = deriveStealthSpendScalar(keys.spendSecret, found[1]!.tweak, mine2.stealthPublicKey);
    expect(x.length).toBe(32);

    const seen2: { from?: bigint; to?: bigint | undefined } = {};
    const a2 = createSolanaAdapter({ chainId: 'sol-devnet', source: sourceOf([], seen2) });
    await collect(
      a2.scan(
        { fromBlock: 3n },
        { viewingSecret: keys.viewSecret, spendingPublicKey: keys.spendPublicKey },
        new AbortController().signal,
      ),
    );
    expect(seen2).toEqual({ from: 3n, to: undefined });
  });

  it('scan honours abort and propagates non-stealth errors', async () => {
    const keys = generateStealthKeys(rng);
    const p = deriveStealthPayment(keys, rng);
    const view = { viewingSecret: keys.viewSecret, spendingPublicKey: keys.spendPublicKey };
    const pre = new AbortController();
    pre.abort();
    const a = createSolanaAdapter({
      chainId: 'sol-devnet',
      source: sourceOf([{ slot: 1n, signature: 'a', payload: p.announcement }]),
    });
    await expect(collect(a.scan({ fromBlock: 0n }, view, pre.signal))).rejects.toEqual(code('ABORTED'));

    const mid = new AbortController();
    const it = a.scan({ fromBlock: 0n }, view, mid.signal)[Symbol.asyncIterator]();
    const two = createSolanaAdapter({
      chainId: 'sol-devnet',
      source: sourceOf([
        { slot: 1n, signature: 'a', payload: p.announcement },
        { slot: 2n, signature: 'b', payload: p.announcement },
      ]),
    });
    const it2 = two.scan({ fromBlock: 0n }, view, mid.signal)[Symbol.asyncIterator]();
    expect((await it2.next()).done).toBe(false);
    mid.abort();
    await expect(it2.next()).rejects.toEqual(code('ABORTED'));
    await expect(it.next()).rejects.toEqual(code('ABORTED'));

    const boom = createSolanaAdapter({
      chainId: 'sol-devnet',
      source: sourceOf([{ slot: 1n, signature: 'a', payload: { length: 40 } as unknown as Uint8Array }]),
    });
    await expect(collect(boom.scan({ fromBlock: 0n }, view, new AbortController().signal))).resolves.toEqual(
      [],
    );

    const hostile = new Proxy(new Uint8Array(40), {
      get(t, k) {
        if (k === 'length') throw new RangeError('hostile payload');
        return Reflect.get(t, k) as unknown;
      },
    });
    const hostileAdapter = createSolanaAdapter({
      chainId: 'sol-devnet',
      source: sourceOf([{ slot: 1n, signature: 'a', payload: hostile }]),
    });
    await expect(
      collect(hostileAdapter.scan({ fromBlock: 0n }, view, new AbortController().signal)),
    ).rejects.toBeInstanceOf(RangeError);

    const badKey = {
      viewingSecret: new Uint8Array(32) as unknown as typeof keys.viewSecret,
      spendingPublicKey: keys.spendPublicKey,
    };
    await expect(collect(a.scan({ fromBlock: 0n }, badKey, new AbortController().signal))).rejects.toEqual(
      code('INVALID_SCALAR'),
    );

    const throwing = createSolanaAdapter({
      chainId: 'sol-devnet',
      source: {
        announcements: () => ({
          [Symbol.asyncIterator]: () => ({ next: () => Promise.reject(new RangeError('rpc down')) }),
        }),
      },
    });
    await expect(
      collect(throwing.scan({ fromBlock: 0n }, view, new AbortController().signal)),
    ).rejects.toBeInstanceOf(RangeError);
  });
});
