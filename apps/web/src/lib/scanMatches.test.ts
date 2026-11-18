import type { Address, ScannedAnnouncement } from '@ghostpay/chain-adapters';
import { describe, expect, it } from 'vitest';
import type { ScanMatch } from './scanClient';
import { paymentKeyOf, placeScanMatch, sharedRouterAddresses } from './scanMatches';

const S = '0x00000000000000000000000000000000000000aa' as Address;
const E = `0x02${'11'.repeat(32)}`;
function match(id: string, viaRouter: boolean, over: { stealth?: Address; eph?: string } = {}): ScanMatch {
  const announcement = { id, ephemeralPublicKey: over.eph ?? E, blockNumber: 1n, logIndex: 0 } as unknown as ScannedAnnouncement;
  return { chainId: 84532, announcement, stealthAddress: over.stealth ?? S, metadata: undefined, viaRouter, tagMatches: true, receipt: viaRouter ? 'verified' : 'claimed' };
}

describe('placeScanMatch (F1)', () => {
  it('keeps every router record of one payment, upgrades a public replay in place and skips later replays', () => {
    const replay = match('r', false);
    const dust = match('d', true);
    const genuine = match('g', true);
    expect(placeScanMatch([], replay)).toBe('append');
    expect(placeScanMatch([replay], match('r2', false))).toBe('skip');
    expect(placeScanMatch([replay], dust)).toBe(0);
    expect(placeScanMatch([dust], genuine)).toBe('append');
    expect(placeScanMatch([dust, genuine], match('late', false))).toBe('skip');
    expect(placeScanMatch([dust, genuine], { ...genuine, receipt: 'pending' })).toBe(1);
    // another ephemeral key is another payment
    expect(placeScanMatch([dust], match('x', false, { eph: `0x03${'22'.repeat(32)}` }))).toBe('append');
    expect(paymentKeyOf(match('a', true, { stealth: S.toUpperCase().replace('0X', '0x') as Address }))).toBe(paymentKeyOf(dust));
  });
  it('reports addresses named by two or more router records only', () => {
    const other = '0x00000000000000000000000000000000000000bb' as Address;
    expect([...sharedRouterAddresses([match('d', true), match('r', false, { stealth: other }), match('g', true), match('o', true, { stealth: other })])]).toEqual([S]);
    expect(sharedRouterAddresses([match('d', true), match('r', false)]).size).toBe(0);
  });
});
