import { decodeFunctionData } from 'viem';
import { describe, expect, it } from 'vitest';
import {
  ERC20_TRANSFER_ABI,
  buildDonationCall,
  buildSendCallsBatch,
  resolveDonation,
  DEFAULT_SETTINGS,
  supportsSendCalls,
} from './index.js';
import { FAKE } from './recipient.test.js';

const TOKEN = '0x00000000000000000000000000000000000070c3' as const;

describe('buildDonationCall', () => {
  it('ERC-20 calldata decodes back', () => {
    const r = buildDonationCall({ chainId: 1, token: TOKEN, recipient: FAKE, amount: 12345n });
    if (!r.ok) throw new Error('expected ok');
    expect(r.call.to).toBe(TOKEN);
    expect(r.call.value).toBe(0n);
    const d = decodeFunctionData({ abi: ERC20_TRANSFER_ABI, data: r.call.data });
    expect(d.functionName).toBe('transfer');
    expect(d.args?.[0].toLowerCase()).toBe(FAKE);
    expect(d.args?.[1]).toBe(12345n);
  });
  it('native is a plain send', () => {
    const r = buildDonationCall({ chainId: 1, token: 'native', recipient: FAKE, amount: 5n });
    expect(r).toEqual({ ok: true, chainId: 1, call: { to: FAKE, data: '0x', value: 5n } });
  });
  it('refuses bad inputs', () => {
    const b = { chainId: 1, token: TOKEN, recipient: FAKE, amount: 1n } as const;
    expect(buildDonationCall({ ...b, amount: 0n })).toEqual({ ok: false, reason: 'zero_amount' });
    expect(buildDonationCall({ ...b, amount: -1n })).toEqual({ ok: false, reason: 'bad_amount' });
    expect(buildDonationCall({ ...b, amount: 1n << 256n })).toEqual({ ok: false, reason: 'bad_amount' });
    expect(buildDonationCall({ ...b, recipient: '0x0000000000000000000000000000000000000000' })).toEqual({
      ok: false,
      reason: 'bad_recipient',
    });
    expect(buildDonationCall({ ...b, token: '0x12' })).toEqual({ ok: false, reason: 'bad_token' });
    expect(buildDonationCall({ ...b, chainId: 0 })).toEqual({ ok: false, reason: 'bad_chain' });
    expect(buildDonationCall({ ...b, chainId: 1.5 })).toEqual({ ok: false, reason: 'bad_chain' });
  });
  it('unavailable recipient means no call is built', () => {
    const res = resolveDonation(DEFAULT_SETTINGS, {});
    expect(res.status).toBe('unavailable');
    const recipient = res.status === 'unavailable' ? ('0x' as never) : FAKE;
    expect(buildDonationCall({ chainId: 1, token: 'native', recipient, amount: 1n }).ok).toBe(false);
  });
});

describe('buildSendCallsBatch', () => {
  const main = { to: TOKEN, data: '0xdeadbeef', value: 0n } as const;
  it('puts donation last, non-atomic, hex chain id and values', () => {
    const r = buildDonationCall({ chainId: 10, token: 'native', recipient: FAKE, amount: 255n });
    if (!r.ok) throw new Error('x');
    const p = buildSendCallsBatch(10, [main, { ...main, data: '0x01' }], r.call);
    expect(p.version).toBe('2.0.0');
    expect(p.atomicRequired).toBe(false);
    expect(p.chainId).toBe('0xa');
    expect(p.calls.map((c) => c.data)).toEqual(['0xdeadbeef', '0x01', '0x']);
    expect(p.calls[2]).toEqual({ to: FAKE, data: '0x', value: '0xff' });
    expect(p.calls[0]?.value).toBe('0x0');
  });
  it('works without donation and validates input', () => {
    expect(buildSendCallsBatch(1, [main]).calls).toHaveLength(1);
    expect(() => buildSendCallsBatch(1, [])).toThrow(RangeError);
    expect(() => buildSendCallsBatch(0, [main])).toThrow(RangeError);
    expect(() => buildSendCallsBatch(1, [{ ...main, to: '0x12' }])).toThrow(RangeError);
  });
});

describe('supportsSendCalls', () => {
  it('detects chain entries case-insensitively', () => {
    expect(supportsSendCalls({ '0xA': { atomic: { status: 'supported' } } }, 10)).toBe(true);
    expect(supportsSendCalls({ '0x1': {} }, 10)).toBe(false);
    expect(supportsSendCalls({ '0xa': null }, 10)).toBe(false);
    expect(supportsSendCalls(null, 10)).toBe(false);
    expect(supportsSendCalls('x', 10)).toBe(false);
  });
});
