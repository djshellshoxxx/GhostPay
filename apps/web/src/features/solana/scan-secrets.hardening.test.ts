import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mockChain, walletA } from './fixtures.testutil';
import { createRpc } from './rpc';
import { scanForPayments } from './scan';

const observed = vi.hoisted(() => ({ tweaks: [] as Uint8Array[] }));

// Observe real derived secrets as they cross the app/package boundary. Do not replace scanning,
// matching, key derivation or network parsing with fabricated successful detections.
vi.mock('@ghostpay/solana-stealth', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@ghostpay/solana-stealth')>();
  return {
    ...actual,
    async *scanAnnouncements(...args: Parameters<typeof actual.scanAnnouncements>) {
      for await (const payment of actual.scanAnnouncements(...args)) {
        observed.tweaks.push(payment.tweak);
        yield payment;
      }
    },
  };
});

describe('Solana scan pending-secret cleanup', () => {
  beforeEach(() => { observed.tweaks.length = 0; });
  afterEach(() => { for (const tweak of observed.tweaks) tweak.fill(0); });

  it('wipes the current derived tweak if the balance request fails before it is retained', async () => {
    const wallet = walletA();
    const chain = mockChain('localnet', wallet);
    chain.failMethod = 'getBalance';
    await expect(scanForPayments({ rpc: createRpc('http://127.0.0.1:8899', chain.fetchFn), wallet, fromSlot: 0n })).rejects.toMatchObject({ code: 'TRANSPORT_FAILURE' });
    expect(observed.tweaks).toHaveLength(1);
    expect(observed.tweaks[0]?.every((byte) => byte === 0)).toBe(true);
  });

  it('wipes the current derived tweak if the progress consumer throws', async () => {
    const wallet = walletA();
    const chain = mockChain('localnet', wallet);
    const failure = new Error('progress consumer stopped');
    await expect(scanForPayments({
      rpc: createRpc('http://127.0.0.1:8899', chain.fetchFn),
      wallet,
      fromSlot: 0n,
      onFound: () => { throw failure; },
    })).rejects.toBe(failure);
    expect(observed.tweaks).toHaveLength(1);
    expect(observed.tweaks[0]?.every((byte) => byte === 0)).toBe(true);
  });

  it('wipes a duplicate-address tweak while retaining only one funded address', async () => {
    const wallet = walletA();
    const chain = mockChain('localnet', wallet);
    const rpc = createRpc('http://127.0.0.1:8899', async (url, init) => {
      const response = await chain.fetchFn(url, init);
      const request = JSON.parse(init.body as string) as { method: string; params: unknown[] };
      const envelope = await response.json() as { result: unknown };
      if (request.method === 'getSignaturesForAddress') {
        const records = envelope.result as { signature: string; slot: number; err: null }[];
        const first = records[0];
        if (first === undefined) throw new Error('fixture must have a signature');
        envelope.result = [first, { ...first, signature: 'SecondFundingSignature' }];
      }
      if (request.method === 'getTransaction') {
        const tx = envelope.result as { transaction: { signatures: string[] } };
        tx.transaction.signatures = [String(request.params[0])];
      }
      return new Response(JSON.stringify(envelope));
    });
    const result = await scanForPayments({ rpc, wallet, fromSlot: 0n });
    expect(result.found).toHaveLength(1);
    expect(chain.calls.filter((method) => method === 'getBalance')).toHaveLength(1);
    expect(observed.tweaks).toHaveLength(2);
    expect(observed.tweaks[1]?.every((byte) => byte === 0)).toBe(true);
    result.found[0]?.tweak.fill(0);
  });
});
