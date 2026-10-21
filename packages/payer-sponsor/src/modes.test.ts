import { describe, expect, it } from 'vitest';
import {
  PAYER_MODES,
  PAYER_MODE_IDS,
  PAYER_MODE_INFO,
  PAYER_PUBLIC_LINE,
  modeAvailability,
  modeNotices,
  parsePayerMode,
  type ChainCapabilities,
} from './modes.js';
import * as pkg from './index.js';

const ADDR = '0x1000000000000000000000000000000000000001' as const;
const FULL: ChainCapabilities = { chainId: 31337, supports7702: true, relay: ADDR, delegate: ADDR, entryPoint: ADDR, accountFactory: ADDR, paymaster: ADDR };

function allStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (typeof v === 'object' && v !== null) Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}

describe('PAYER_MODE_INFO (PH-GEN-3)', () => {
  it('has one row per mode and ids PH-0..PH-4', () => {
    expect(Object.keys(PAYER_MODE_INFO)).toEqual([...PAYER_MODES]);
    expect(PAYER_MODES.map((m) => PAYER_MODE_IDS[m])).toEqual(['PH-0', 'PH-1', 'PH-2', 'PH-3', 'PH-4']);
    for (const m of PAYER_MODES) expect(PAYER_MODE_INFO[m].mode).toBe(m);
  });
  it('never claims the payer is hidden', () => {
    for (const info of Object.values(PAYER_MODE_INFO)) {
      expect(info.hidesFromObservers as readonly string[]).not.toContain('payer');
    }
  });
  it('shipped strings contain none of the banned claim words', () => {
    const banned = /anonymous|untraceable|hidden payer|\bmix(er|ing)?\b|private payer/i;
    for (const s of [...allStrings(PAYER_MODE_INFO), ...PAYER_MODES.flatMap((m) => modeNotices(m))]) {
      expect(s).not.toMatch(banned);
    }
  });
  it('sponsored modes list every sponsor-visible field and need no native gas on the payer', () => {
    for (const m of ['permit-relay', 'eip7702-sponsored', 'erc4337-paymaster'] as const) {
      expect(PAYER_MODE_INFO[m].sponsorSees).toEqual(['payer', 'stealth', 'amount', 'token', 'ip', 'timing']);
      expect(PAYER_MODE_INFO[m].needsNativeGasOnPayer).toBe(false);
      expect(PAYER_MODE_INFO[m].hidesFromObservers).toContain('gas-funding-link');
    }
    expect(PAYER_MODE_INFO['permit-relay'].needsPermitToken).toBe(true);
    expect(PAYER_MODE_INFO['direct'].needsNativeGasOnPayer).toBe(true);
  });
  it('the public package surface carries no claim words either', () => {
    const banned = /anonymous|untraceable|hidden payer/i;
    for (const s of allStrings(pkg.PAYER_MODE_INFO)) expect(s).not.toMatch(banned);
    expect(pkg.PAYER_PUBLIC_LINE).toBe(PAYER_PUBLIC_LINE);
  });
});

describe('modeNotices (PH-GEN-5)', () => {
  it('always ends with the public payer line', () => {
    for (const m of PAYER_MODES) expect(modeNotices(m).at(-1)).toBe('The payer address is still public.');
  });
  it('direct has no sponsor or funding notice; others have the funding line; sponsored have the trust line', () => {
    expect(modeNotices('direct')).toHaveLength(3);
    expect(modeNotices('fresh-wallet')).toHaveLength(4);
    expect(modeNotices('permit-relay')).toHaveLength(5);
    expect(modeNotices('permit-relay').join(' ')).toContain('sponsor sees');
  });
});

describe('modeAvailability', () => {
  it('direct and fresh-wallet are always available on testnets', () => {
    expect(modeAvailability('direct', { chainId: 84532, supports7702: false })).toEqual({ available: true });
    expect(modeAvailability('fresh-wallet', { chainId: 11155111, supports7702: false })).toEqual({ available: true });
  });
  it('full capabilities enable everything', () => {
    for (const m of PAYER_MODES) expect(modeAvailability(m, FULL)).toEqual({ available: true });
  });
  it('reports a reason per missing piece', () => {
    expect(modeAvailability('permit-relay', { ...FULL, relay: undefined })).toEqual({ available: false, reason: 'NO_RELAY' });
    expect(modeAvailability('eip7702-sponsored', { ...FULL, supports7702: false })).toEqual({ available: false, reason: 'NO_7702' });
    expect(modeAvailability('eip7702-sponsored', { ...FULL, delegate: undefined })).toEqual({ available: false, reason: 'NO_DELEGATE' });
    for (const k of ['entryPoint', 'accountFactory', 'paymaster'] as const) {
      expect(modeAvailability('erc4337-paymaster', { ...FULL, [k]: undefined })).toEqual({ available: false, reason: 'NO_ENTRYPOINT' });
    }
  });
  it('refuses mainnet ids', () => {
    expect(() => modeAvailability('direct', { chainId: 1, supports7702: true })).toThrowError(expect.objectContaining({ code: 'MAINNET_FORBIDDEN' }) as Error);
  });
  it('parsePayerMode accepts only known modes', () => {
    expect(parsePayerMode('permit-relay')).toBe('permit-relay');
    expect(() => parsePayerMode('anonymous')).toThrowError(expect.objectContaining({ code: 'BAD_REQUEST' }) as Error);
    expect(() => parsePayerMode(3)).toThrow();
  });
});
