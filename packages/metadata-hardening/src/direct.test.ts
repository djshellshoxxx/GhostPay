import { describe, expect, it } from 'vitest';
import { bytesToHex } from '@noble/hashes/utils.js';
import { decodeFunctionData, parseAbi } from 'viem';
import { deriveStealthPayment } from '@ghostpay/core-crypto';
import { buildDirectPayment, type DirectPaymentInput } from './direct.js';
import { deriveInvoiceKeys } from './derive.js';
import { CANONICAL_ANNOUNCER, buildMinimalMetadata } from './tags.js';
import { MetadataHardeningError } from './guard.js';
import { SEED } from './testutil.testutil.js';

const pay = deriveStealthPayment(deriveInvoiceKeys(SEED, 0).metaAddress);
const ROUTER = '0x' + '77'.repeat(20);
const TOKEN = '0x' + '22'.repeat(20);
const base: DirectPaymentInput = {
  chainId: 31337,
  announcer: CANONICAL_ANNOUNCER,
  routerAddress: ROUTER,
  stealthAddress: pay.stealthAddress,
  asset: { kind: 'erc20', token: TOKEN },
  amount: 1_000_000n,
  ephemeralPublicKey: pay.ephemeralPublicKey,
  metadata: buildMinimalMetadata(pay.viewTag[0] as number),
};
const announceAbi = parseAbi(['function announce(uint256,address,bytes,bytes)']);
const erc20Abi = parseAbi(['function transfer(address,uint256) returns (bool)']);

describe('MH-FEE-1 buildDirectPayment', () => {
  it('erc20: transfer to stealth then announce(1, ...) on the announcer, never the router', () => {
    const r = buildDirectPayment(base);
    const [t, a] = r.calls;
    expect(t.to).toBe(TOKEN);
    expect(t.data.slice(0, 10)).toBe('0xa9059cbb');
    const td = decodeFunctionData({ abi: erc20Abi, data: t.data as `0x${string}` });
    expect(td.args).toEqual([pay.stealthAddress, 1_000_000n]);
    expect(a.to).toBe(CANONICAL_ANNOUNCER);
    const ad = decodeFunctionData({ abi: announceAbi, data: a.data as `0x${string}` });
    expect(ad.args[0]).toBe(1n);
    expect(ad.args[1]).toBe(pay.stealthAddress);
    expect(ad.args[2]).toBe('0x' + bytesToHex(pay.ephemeralPublicKey));
    expect(ad.args[3]).toBe('0x' + bytesToHex(pay.viewTag));
    for (const c of r.calls) expect(c.to.toLowerCase()).not.toBe(ROUTER);
    expect(r.warning).toMatch(/No GhostPay fee, no router protection/);
  });
  it('native: value transfer to stealth address, empty data', () => {
    const r = buildDirectPayment({ ...base, asset: { kind: 'native' } });
    expect(r.calls[0]).toEqual({ label: 'transfer', to: pay.stealthAddress, data: '0x', value: 1_000_000n });
    expect(r.calls[1].value).toBe(0n);
  });
  it('57-byte metadata also allowed for direct payments', () => {
    expect(() => buildDirectPayment({ ...base, metadata: new Uint8Array(57) })).not.toThrow();
  });
  it('refuses the router as announcer, token or stealth target', () => {
    expect(() => buildDirectPayment({ ...base, announcer: ROUTER })).toThrowError(/router/);
    expect(() => buildDirectPayment({ ...base, asset: { kind: 'erc20', token: ROUTER } })).toThrow(MetadataHardeningError);
    expect(() => buildDirectPayment({ ...base, stealthAddress: ROUTER })).toThrow(MetadataHardeningError);
  });
  it('refuses mainnet, bad addresses, zero amount, bad key, empty metadata', () => {
    expect(() => buildDirectPayment({ ...base, chainId: 1 })).toThrowError(/testnet/);
    expect(() => buildDirectPayment({ ...base, stealthAddress: '0x123' })).toThrow(MetadataHardeningError);
    expect(() => buildDirectPayment({ ...base, stealthAddress: '0x' + '0'.repeat(40) })).toThrow(MetadataHardeningError);
    expect(() => buildDirectPayment({ ...base, amount: 0n })).toThrow(MetadataHardeningError);
    expect(() => buildDirectPayment({ ...base, ephemeralPublicKey: new Uint8Array(33) })).toThrow();
    expect(() => buildDirectPayment({ ...base, metadata: new Uint8Array(0) })).toThrow(MetadataHardeningError);
    expect(() => buildDirectPayment({ ...base, announcer: '0xAbC' })).toThrow(MetadataHardeningError);
  });
});
