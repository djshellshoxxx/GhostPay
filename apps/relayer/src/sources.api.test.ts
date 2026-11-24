import { qualifiedFeed } from './feedFixture.testutil.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { encodeAbiParameters } from 'viem';
import { type RpcClient } from '@ghostpay/chain-adapters';
import { CHAIN_ID, NOW_SEC, OWNER, DEST, USDC, call, prepare, startHarness, testConfig, type Harness } from './harness.testutil.js';
import type { AlertEvent } from './alerts.js';
import { buildRelayer } from './runtime.js';
import { createLogger } from './log.js';
import { FakeChain } from './harness.testutil.js';

let h: Harness | undefined;
afterEach(async () => { await h?.stop(); h = undefined; });
const hash = `0x${'11'.repeat(32)}` as const;
function sources() {
  const state = { updatedAt: BigInt(NOW_SEC - 10), hash, badRound: false };
  const primary = { chainId: CHAIN_ID, blockNumber: vi.fn(() => Promise.resolve(1000n)), getLogs: vi.fn(),
    getBlock: vi.fn((number: bigint) => Promise.resolve({ number, hash, parentHash: hash, timestamp: BigInt(NOW_SEC) })),
    request: vi.fn((_method: string, params: readonly unknown[]) => {
      const data = (params[0] as { data: string }).data;
      return Promise.resolve(data === '0x313ce567'
        ? encodeAbiParameters([{ type: 'uint8' }], [8])
        : encodeAbiParameters([{ type: 'uint80' }, { type: 'int256' }, { type: 'uint256' }, { type: 'uint256' }, { type: 'uint80' }],
          [1n, state.badRound ? 0n : 300_000_000_000n, state.updatedAt, state.updatedAt, 1n]));
    }) } satisfies RpcClient;
  const secondary = { ...primary, getBlock: vi.fn((number: bigint) => Promise.resolve({ number, hash: state.hash, parentHash: hash, timestamp: BigInt(NOW_SEC) })) };
  const feed = qualifiedFeed;
  const config = testConfig(); const chain = config.chains[0]!;
  return { state, primary, secondary, clients: new Map([[CHAIN_ID, { primary, secondary }]]),
    config: { ...config, chains: [{ ...chain, secondaryRpcUrl: 'https://secondary.example', nativeUsdFeed: { feed: { ...feed, decimals: 8 }, maxAgeSeconds: 30 } }] } };
}
describe('configured source checks in relayer requests', () => {
  it('bounds the existing authenticated quote expiry by the actual feed deadline', async () => {
    const s = sources(); h = await startHarness({ config: s.config, sourceClients: s.clients });
    const prepared = await prepare(h); expect(prepared.quote.expiresAt).toBe(NOW_SEC + 20);
    h.clock.ms += 20_000; const reply = await call(h, 'POST', '/v1/sweep', prepared.body);
    expect(reply.status).toBe(410); expect(h.fake.sent).toEqual([]);
  });
  it('fails a quote on observed provider disagreement and keeps alert fields private', async () => {
    const s = sources(); const events: AlertEvent[] = []; h = await startHarness({ config: s.config, sourceClients: s.clients, alerts: { send: (event) => { events.push(event); } } });
    s.state.hash = `0x${'22'.repeat(32)}`;
    const reply = await call(h, 'POST', '/v1/quote', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' });
    expect(reply).toMatchObject({ status: 503, json: { error: { code: 'rpc_disagree' } } });
    expect(events).toEqual([{ kind: 'rpc_disagree', chainId: CHAIN_ID }]); expect(JSON.stringify(events)).not.toContain('0x');
  });
  it('checks a new sweep before simulation and checks again after the final simulation', async () => {
    const s = sources(); h = await startHarness({ config: s.config, sourceClients: s.clients }); const prepared = await prepare(h);
    s.state.hash = `0x${'22'.repeat(32)}`;
    expect((await call(h, 'POST', '/v1/sweep', prepared.body)).status).toBe(503); expect(h.fake.simulations).toBe(0);
    s.state.hash = hash;
    const simulate = h.fake.simulateSweep.bind(h.fake);
    vi.spyOn(h.fake, 'simulateSweep').mockImplementation(async (requested) => { const result = await simulate(requested); if (h!.fake.simulations === 2) s.state.hash = `0x${'22'.repeat(32)}`; return result; });
    expect((await call(h, 'POST', '/v1/sweep', prepared.body)).status).toBe(503); expect(h.fake.simulations).toBe(2); expect(h.fake.sent).toEqual([]);
  });
  it('rereads configured prices during execution and refuses a stale or invalid feed without fallback', async () => {
    const s = sources(); const events: AlertEvent[] = []; h = await startHarness({ config: s.config, sourceClients: s.clients, alerts: { send: (event) => { events.push(event); } } });
    const prepared = await prepare(h); s.state.updatedAt = BigInt(NOW_SEC - 31);
    expect(await call(h, 'POST', '/v1/sweep', prepared.body)).toMatchObject({ status: 503, json: { error: { code: 'price_stale' } } });
    expect(events).toEqual([{ kind: 'price_stale', chainId: CHAIN_ID }]); expect(h.fake.sent).toEqual([]);
    s.state.updatedAt = BigInt(NOW_SEC - 10); s.state.badRound = true;
    expect(await call(h, 'POST', '/v1/sweep', prepared.body)).toMatchObject({ status: 503, json: { error: { code: 'price_unavailable' } } });
    expect(events).toHaveLength(1); expect(h.fake.sent).toEqual([]);
  });
  it('executes a valid sweep with fresh source reads and same-chain agreement', async () => {
    const s = sources(); h = await startHarness({ config: s.config, sourceClients: s.clients }); const prepared = await prepare(h);
    expect((await call(h, 'POST', '/v1/sweep', prepared.body)).status).toBe(200);
    expect(s.primary.getBlock).toHaveBeenCalledTimes(3); expect(s.primary.request).toHaveBeenCalledTimes(6); expect(h.fake.sent).toHaveLength(1);
  });
  it.each(['nonce', 'signing'] as const)('refuses neutrally when feed validity lapses during %s and releases the reservation', async (phase) => {
    const s = sources(); const events: AlertEvent[] = [];
    h = await startHarness({ config: s.config, sourceClients: s.clients, alerts: { send: (event) => { events.push(event); } } });
    const prepared = await prepare(h); s.state.updatedAt = BigInt(NOW_SEC - 29);
    const fake = h.fake;
    if (phase === 'nonce') {
      vi.spyOn(fake, 'getPendingNonce').mockImplementationOnce(() => { h!.clock.ms += 1000; return Promise.resolve(fake.pendingNonce); });
    } else {
      const send = fake.sendSweep.bind(fake);
      vi.spyOn(fake, 'sendSweep').mockImplementationOnce((requested, options) => { h!.clock.ms += 1000; return send(requested, options); });
    }
    expect(await call(h, 'POST', '/v1/sweep', prepared.body)).toMatchObject({ status: 503, json: { error: { code: 'price_stale' } } });
    expect(fake.sent).toEqual([]); expect(fake.signed).toEqual([]);
    expect(events).toEqual([{ kind: 'price_stale', chainId: CHAIN_ID }]);
    expect(h.relayer.metrics.render()).toContain(`relayer_daily_budget_used_wei{chain_id="${String(CHAIN_ID)}"} 0`);
    expect(h.relayer.metrics.render()).toContain(`relayer_breaker_state{chain_id="${String(CHAIN_ID)}"} 0`);
    s.state.updatedAt = BigInt(NOW_SEC + 1);
    expect((await call(h, 'POST', '/v1/sweep', prepared.body)).status).toBe(200);
    expect(fake.sent).toHaveLength(1); expect(fake.sent[0]!.opts.nonce).toBe(fake.pendingNonce);
  });
  it('refuses missing configured source clients instead of silently disabling checks', async () => {
    const s = sources(); const common = { config: s.config, clients: new Map([[CHAIN_ID, new FakeChain()]]), hotKey: new Uint8Array(32).fill(3), quoteSecret: new Uint8Array(32).fill(9), logger: createLogger(() => undefined) };
    await expect(buildRelayer({ ...common, sourceClients: new Map() })).rejects.toThrow('configured secondary RPC is unavailable');
    await expect(buildRelayer({ ...common, sourceClients: new Map([[CHAIN_ID, { primary: s.primary }]]) })).rejects.toThrow('configured secondary RPC is unavailable');
  });
});
