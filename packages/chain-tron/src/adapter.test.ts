import { encodeMetaAddress, generateKeySet, type RandomSource } from '@ghostpay/core-crypto';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { evmToTronAddress } from './address.js';
import { createTronAdapter, TronAdapterError, TRON_FEES, type TronAnnouncementSource } from './adapter.js';
import { TronError } from './errors.js';
import { encodeTronMetaAddress } from './meta.js';
import { deriveTronStealthPayment, type TronAnnouncement } from './stealth.js';
import { MAX_FEE_LIMIT_SUN, UINT256_MAX } from './trc20.js';
import { seededRng } from './testutil.testutil.js';

const OWNER = evmToTronAddress(`0x${'aa'.repeat(20)}`);
const TOKEN = evmToTronAddress(`0x${'bb'.repeat(20)}`);

function fixture() {
  const keys = generateKeySet(seededRng(11));
  const meta = encodeTronMetaAddress(keys);
  return { keys, meta };
}

describe('Tron adapter skeleton', () => {
  const empty: TronAnnouncementSource = async function* () {};

  it('declares tron family and un-enforceable fees', () => {
    const a = createTronAdapter('tron-nile', empty);
    expect(a.family).toBe('tron');
    expect(a.chainId).toBe('tron-nile');
    expect(a.fees).toBe(TRON_FEES);
    expect(Object.values(TRON_FEES)).toEqual(['not_enforceable', 'not_enforceable', 'not_enforceable']);
    expect(Object.isFrozen(TRON_FEES)).toBe(true);
  });
  it('rejects empty chain id', () => {
    expect(() => createTronAdapter('', empty)).toThrow(TronError);
  });
  it('refuses mainnet chain ids unconditionally (ADR-0019)', () => {
    for (const id of ['tron-mainnet', 'mainnet', 'TRON-MAINNET', 'tron-Mainnet-1']) {
      expect(() => createTronAdapter(id, empty)).toThrow(expect.objectContaining({ name: 'TronError', code: 'INVALID_INPUT' }));
    }
  });
  it('parseRecipient round-trips', () => {
    const { keys, meta } = fixture();
    const r = createTronAdapter('tron-nile', empty).parseRecipient(meta);
    expect(r.family).toBe('tron');
    expect(r.canonical).toBe(meta);
    expect(r.spendingPublicKey).toEqual(keys.spendingPublicKey);
    expect(() => createTronAdapter('x', empty).parseRecipient('garbage')).toThrow(
      expect.objectContaining({ code: 'INVALID_META_ADDRESS' }),
    );
    expect(() => createTronAdapter('x', empty).parseRecipient(encodeMetaAddress(keys))).toThrow(
      expect.objectContaining({ code: 'LEGACY_META_ADDRESS' }),
    );
  });
  it('quotes a payment but refuses to build one without the GPT1 memo bound into raw_data.data (ADR-0019)', () => {
    const { meta } = fixture();
    const req = createTronAdapter('tron-nile', empty).buildPaymentRequest({
      metaAddress: meta, owner: OWNER, tokenContract: TOKEN, amount: 5_000_000n, feeLimit: 50_000_000n,
    });
    expect(req).toMatchObject({ family: 'tron', grossAmount: 5_000_000n, netAmount: 5_000_000n, feeAmount: 0n, asset: TOKEN });
    // The web scanner (tron-adapter parseCandidate) only reads the memo from the hashed raw_data.data; the
    // triggersmartcontract body this package can build carries no memo, so a payable result would be undetectable.
    let draws = 0;
    const seeded = seededRng(3);
    const rng: RandomSource = { getRandomValues: (array) => { draws += 1; return seeded.getRandomValues(array); } };
    for (const build of [() => req.build({ rng }), () => req.build()]) {
      expect(build).toThrow(expect.objectContaining({ name: 'TronAdapterError', code: 'MEMO_NOT_BOUND' }));
      expect(build).toThrow(TronAdapterError);
      expect(build).toThrow(/raw_data\.data/);
    }
    expect(draws).toBe(0);
  });
  it('rejects bad payment inputs', () => {
    const { meta } = fixture();
    const a = createTronAdapter('tron-nile', empty);
    const ok = { metaAddress: meta, owner: OWNER, tokenContract: TOKEN, amount: 1n, feeLimit: 1n };
    expect(() => a.buildPaymentRequest({ ...ok, metaAddress: 'bad' })).toThrow();
    expect(() => a.buildPaymentRequest({ ...ok, metaAddress: `st:eth:0x${meta.slice(9)}` })).toThrow(
      expect.objectContaining({ code: 'LEGACY_META_ADDRESS' }),
    );
    expect(() => a.buildPaymentRequest({ ...ok, owner: 'bad' })).toThrow();
    expect(() => a.buildPaymentRequest({ ...ok, tokenContract: 'bad' })).toThrow();
    for (const amount of [0n, 1n << 256n]) {
      expect(() => a.buildPaymentRequest({ ...ok, amount })).toThrow(expect.objectContaining({ code: 'INVALID_AMOUNT' }));
    }
    for (const feeLimit of [0n, MAX_FEE_LIMIT_SUN + 1n]) {
      expect(() => a.buildPaymentRequest({ ...ok, feeLimit })).toThrow(expect.objectContaining({ code: 'INVALID_FEE_LIMIT' }));
    }
    expect(a.buildPaymentRequest({ ...ok, amount: UINT256_MAX, feeLimit: MAX_FEE_LIMIT_SUN }).grossAmount).toBe(UINT256_MAX);
  });
  it('scan yields only matching announcements and honours abort', async () => {
    const { keys, meta } = fixture();
    const mine = deriveTronStealthPayment(meta, seededRng(21));
    const other = deriveTronStealthPayment(encodeTronMetaAddress(generateKeySet(seededRng(12))), seededRng(22));
    const ann = (p: typeof mine): TronAnnouncement => ({
      stealthAddress: p.stealthAddress,
      ephemeralPublicKey: `0x${bytesToHex(p.ephemeralPublicKey)}`,
      metadata: `0x${bytesToHex(p.metadataPrefix)}`,
    });
    const items = [ann(other), ann(mine)];
    let seenRange: unknown;
    const source: TronAnnouncementSource = async function* (range) {
      seenRange = range;
      await Promise.resolve();
      for (const i of items) yield i;
    };
    const adapter = createTronAdapter('tron-nile', source);
    const found = [];
    for await (const d of adapter.scan({ fromBlock: 5n }, keys, new AbortController().signal)) found.push(d);
    expect(found.map((f) => f.stealthAddress)).toEqual([mine.stealthAddress]);
    expect(seenRange).toEqual({ fromBlock: 5n });
    const ac = new AbortController();
    ac.abort();
    const none = [];
    for await (const d of adapter.scan({ fromBlock: 0n }, keys, ac.signal)) none.push(d);
    expect(none).toEqual([]);
  });
});
