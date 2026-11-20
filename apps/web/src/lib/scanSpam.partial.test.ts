import { CHAINS } from '@ghostpay/chain-adapters';
import { describe, expect, it } from 'vitest';
import { anonymitySet } from './scanSpam';

const chain = CHAINS.find((c) => c.chainId === 84532)!;
const day = BigInt(Math.ceil(86_400_000 / chain.blockTimeMs));
const head = 40n * day;
const routerBlocks = [head - 2n * day, head - 9n * day, head - 35n * day];

describe('privacy-set announcement coverage', () => {
  it('marks ten days of scanned history partial for a displayed 30-day count', () => {
    const r = anonymitySet({ chain, routerBlocks, head, scannedFrom: head - 10n * day });
    expect(r.count7d).toBe(1);
    expect(r.count30d).toBe(2);
    expect(r.partial).toBe(true);
  });

  it('does not mark full available 30-day history partial', () => {
    const r = anonymitySet({ chain, routerBlocks, head, scannedFrom: head - 30n * day });
    expect(r.count7d).toBe(1);
    expect(r.count30d).toBe(2);
    expect(r.partial).toBe(false);
  });

  it('does not demand blocks older than genesis for a young chain', () => {
    const youngHead = 2n * day;
    const r = anonymitySet({ chain, routerBlocks: [youngHead], head: youngHead, scannedFrom: 0n });
    expect(r.partial).toBe(false);
    expect(r.count7d).toBe(1);
    expect(r.count30d).toBe(1);
  });

  it('marks coverage partial when a scan has not reached the requested head', () => {
    const r = anonymitySet({ chain, routerBlocks, head, scannedFrom: 0n, scannedTo: head - 1n });
    expect(r.partial).toBe(true);
  });
});
