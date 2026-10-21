import { generateKeySet } from '@ghostpay/core-crypto';
import { describe, expect, it } from 'vitest';
import { TRON_FEES, TRON_NETWORKS, createTronAdapter } from './adapter.js';
import { decodeRawTx } from './tx.js';
import { encodeTronMetaAddress } from './meta.js';
import { seededRng } from './rng.testutil.js';

const USDT = 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t';
const PAYER = 'TMVQGm1qAQYVdetCeGRRkTWYYrLXuHK2HC';
const keys = generateKeySet(seededRng('ad'));
const meta = encodeTronMetaAddress(keys);
const refBlock = { number: 7n, blockId: 'ab'.repeat(32) };
const bo = { payer: PAYER, refBlock, timestampMs: 1_700_000_000_000n, feeLimitSun: 100n };

describe('createTronAdapter', () => {
  it('mainnet is unconditionally disabled; nile/shasta/local work', () => {
    expect(() => createTronAdapter({ network: 'mainnet' })).toThrow(/disabled/);
    expect(() => createTronAdapter({ network: 'bogus' as never })).toThrow();
    expect(TRON_NETWORKS.mainnet.enabled).toBe(false);
    expect(createTronAdapter({ network: 'nile' }).chainId).toBe('tron-nile');
    expect(createTronAdapter({ network: 'shasta' }).chainId).toBe('tron-shasta');
    expect(createTronAdapter({ network: 'local' }).chainId).toBe('tron-local');
  });
  const a = createTronAdapter({ network: 'nile' });
  it('fees are honest: nothing enforced', () => {
    expect(a.fees).toBe(TRON_FEES);
    expect(Object.values(TRON_FEES).every((v) => v === 'not_deployed')).toBe(true);
    expect(a.family).toBe('tron');
  });
  it('parseRecipient canonicalises', () => {
    const r = a.parseRecipient(meta);
    expect(r.canonical).toBe(meta);
    expect(r.family).toBe('tron');
    expect(() => a.parseRecipient('st:eth:0x00')).toThrow();
  });
  it('builds TRC-20 and TRX payments with matching reviewed preview', () => {
    const req = a.buildPaymentRequest({ chainId: 'tron-nile', recipient: meta, asset: { kind: 'trc20', contract: USDT }, amount: 1000n });
    expect(req).toMatchObject({ grossAmount: 1000n, netAmount: 1000n, feeAmount: 0n, asset: USDT });
    const p = req.build(bo);
    const d = decodeRawTx(p.tx.rawData);
    expect(d).toMatchObject({ kind: 'trc20', owner: PAYER, to: p.stealthAddress, contract: USDT, amount: 1000n, feeLimitSun: 100n });
    expect(p.preview).toEqual({ from: PAYER, to: p.stealthAddress, asset: USDT, amount: 1000n, feeLimitSun: 100n });
    const trx = a.buildPaymentRequest({ chainId: 'tron-nile', recipient: meta, asset: { kind: 'native' } }, { quotedTokenAmount: 5n });
    const q = trx.build({ payer: PAYER, refBlock, timestampMs: 1_700_000_000_000n, expirationMs: 1_700_000_001_000n });
    expect(decodeRawTx(q.tx.rawData)).toMatchObject({ kind: 'trx', amount: 5n, expirationMs: 1_700_000_001_000n });
    expect(q.preview.feeLimitSun).toBe(0n);
  });
  it('validates invoice and build inputs', () => {
    const inv = { chainId: 'tron-nile', recipient: meta, asset: { kind: 'native' } as const, amount: 1n };
    expect(() => a.buildPaymentRequest({ ...inv, chainId: 'tron-shasta' })).toThrow(/another chain/);
    expect(() => a.buildPaymentRequest({ ...inv, recipient: 'x' })).toThrow();
    expect(() => a.buildPaymentRequest({ ...inv, amount: 0n })).toThrow();
    expect(() => a.buildPaymentRequest({ ...inv, amount: undefined } as never)).toThrow();
    expect(() => a.buildPaymentRequest({ ...inv, amount: 1n << 64n })).toThrow();
    expect(() => a.buildPaymentRequest({ ...inv, asset: { kind: 'trc20', contract: 'bad' } })).toThrow();
    const t = a.buildPaymentRequest({ ...inv, asset: { kind: 'trc20', contract: USDT } });
    expect(() => t.build({ ...bo, feeLimitSun: undefined as never })).toThrow();
    expect(() => t.build({ ...bo, payer: 'bad' })).toThrow();
  });
});
