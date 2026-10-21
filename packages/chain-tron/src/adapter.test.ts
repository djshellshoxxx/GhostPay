import { encodeMetaAddress, generateKeySet } from '@ghostpay/core-crypto';
import { bytesToHex } from '@noble/hashes/utils.js';
import { describe, expect, it } from 'vitest';
import { evmToTronAddress, tronAddressToHex } from './address.js';
import { createTronAdapter, TRON_FEES, type TronAnnouncementSource } from './adapter.js';
import { TronError } from './errors.js';
import { deriveTronStealthPayment, type TronAnnouncement } from './stealth.js';
import { seededRng } from './testutil.testutil.js';

const OWNER = evmToTronAddress(`0x${'aa'.repeat(20)}`);
const TOKEN = evmToTronAddress(`0x${'bb'.repeat(20)}`);

function fixture() {
  const keys = generateKeySet(seededRng(11));
  const meta = encodeMetaAddress(keys);
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
  it('parseRecipient round-trips', () => {
    const { keys, meta } = fixture();
    const r = createTronAdapter('tron-nile', empty).parseRecipient(meta);
    expect(r.family).toBe('tron');
    expect(r.canonical).toBe(meta);
    expect(r.spendingPublicKey).toEqual(keys.spendingPublicKey);
    expect(() => createTronAdapter('x', empty).parseRecipient('garbage')).toThrow();
  });
  it('builds payment request and transfer to a stealth address', () => {
    const { meta } = fixture();
    const req = createTronAdapter('tron-nile', empty).buildPaymentRequest({
      metaAddress: meta, owner: OWNER, tokenContract: TOKEN, amount: 5_000_000n, feeLimit: 50_000_000n,
    });
    expect(req).toMatchObject({ family: 'tron', grossAmount: 5_000_000n, netAmount: 5_000_000n, feeAmount: 0n, asset: TOKEN });
    const built = req.build({ rng: seededRng(3) });
    expect(built.request.parameter.slice(24, 64)).toBe(tronAddressToHex(built.stealth.stealthAddress).slice(2));
    const again = deriveTronStealthPayment(meta, seededRng(3));
    expect(built.stealth.stealthAddress).toBe(again.stealthAddress);
    expect(built.request.function_selector).toBe('transfer(address,uint256)');
    expect(req.build().stealth.stealthAddress).not.toBe(built.stealth.stealthAddress);
  });
  it('rejects bad payment inputs', () => {
    const { meta } = fixture();
    const a = createTronAdapter('tron-nile', empty);
    const ok = { metaAddress: meta, owner: OWNER, tokenContract: TOKEN, amount: 1n, feeLimit: 1n };
    expect(() => a.buildPaymentRequest({ ...ok, metaAddress: 'bad' })).toThrow();
    expect(() => a.buildPaymentRequest({ ...ok, owner: 'bad' })).toThrow();
    expect(() => a.buildPaymentRequest({ ...ok, tokenContract: 'bad' })).toThrow();
    expect(() => a.buildPaymentRequest({ ...ok, amount: 0n }).build()).toThrow();
  });
  it('scan yields only matching announcements and honours abort', async () => {
    const { keys, meta } = fixture();
    const mine = deriveTronStealthPayment(meta, seededRng(21));
    const other = deriveTronStealthPayment(encodeMetaAddress(generateKeySet(seededRng(12))), seededRng(22));
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
