import { GuardedBreaker, LossBudget, TokenBucketLimiter } from '@ghostpay/relayer-guard';
import { describe, expect, it } from 'vitest';
import { RelayerError } from './errors.js';
import { PoolRelayerService, toSnarkjsProof, type ProofVerifier } from './service.js';
import { createLogger } from './log.js';
import { DEST, FEE_TO, POOL, RELAYER, SCOPE, TX, config, fakeChain, goodRequest } from './harness.testutil.js';
import { feeCap, minAcceptableFee, quoteFee } from './quote.js';
import { buildConfig } from './config.js';
import { zeroAddress } from 'viem';

const ctx = { clientKey: 'k1', requestId: 'abcdef12-3456' };

function make(over: { chain?: ReturnType<typeof fakeChain>; verify?: ProofVerifier; breaker?: GuardedBreaker; limiter?: TokenBucketLimiter; loss?: LossBudget; lines?: string[] } = {}) {
  const chain = over.chain ?? fakeChain();
  const lines = over.lines ?? [];
  const svc = new PoolRelayerService({
    config: config(),
    chains: new Map([[31337, chain]]),
    verifyProof: over.verify ?? (() => Promise.resolve(true)),
    ...(over.breaker ? { breaker: over.breaker } : {}),
    limiter: over.limiter ?? new TokenBucketLimiter({ ratePerSecond: 1000, burst: 1000, maxKeys: 100 }),
    ...(over.loss ? { lossBudget: over.loss } : {}),
    logger: createLogger((l) => lines.push(l)),
    receiptTimeoutMs: 10,
  });
  return { chain, svc, lines };
}
const code = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
    return 'ok';
  } catch (e) {
    return e instanceof RelayerError ? `${String(e.status)}:${e.code}` : 'other';
  }
};

describe('quote maths', () => {
  it('is deterministic and capped', () => {
    const cfg = config();
    const e = cfg.pools[0] as never;
    expect(quoteFee(cfg, e, 1_000n)).toBe((100_000n * 1_000n * 12_000n + 9_999n) / 10_000n);
    expect(quoteFee(cfg, e, 10n ** 30n)).toBe(quoteFee(cfg, e, cfg.maxGasPrice));
    const cfg2 = buildConfig({ pools: [{ chainId: 31337, pool: POOL, rate: { num: 3n, den: 7n } }], feeTo: FEE_TO });
    expect(quoteFee(cfg2, cfg2.pools[0] as never, 7n)).toBeGreaterThan(0n);
    expect(minAcceptableFee(cfg, 1000n)).toBe(900n);
    expect(feeCap(cfg, 10_000n)).toBe(500n);
  });
});

describe('config', () => {
  it('validates', () => {
    const base = { pools: [{ chainId: 31337, pool: POOL, rate: { num: 1n, den: 1n } }], feeTo: FEE_TO };
    expect(() => buildConfig({ ...base, pools: [] })).toThrow(/no pools/);
    expect(() => buildConfig({ ...base, pools: [{ chainId: 1, pool: POOL, rate: { num: 1n, den: 1n } }] })).toThrow(/testnet/);
    expect(() => buildConfig({ ...base, pools: [{ chainId: 31337, pool: POOL, rate: { num: 0n, den: 1n } }] })).toThrow(/rate/);
    expect(() => buildConfig({ ...base, pools: [base.pools[0] as never, base.pools[0] as never] })).toThrow(/duplicate/);
    for (const bad of [{ maxFeeBps: 1001 }, { marginBps: -1 }, { slackBps: 6000 }, { gasEstimate: 0n }, { quoteTtlSeconds: 0 }, { minDeadlineSeconds: 10_000 }, { port: 70000 }]) {
      expect(() => buildConfig({ ...base, ...bad })).toThrow(/config/);
    }
    expect(buildConfig(base).port).toBe(8788);
  });
});

describe('service', () => {
  it('constructor needs a chain port per pool', () => {
    expect(() => new PoolRelayerService({ config: config(), chains: new Map() })).toThrow(/no chain port/);
  });
  it('info and health', () => {
    const { svc } = make();
    expect(svc.info()).toMatchObject({ relayer: RELAYER, feeTo: FEE_TO, chainIds: [31337] });
    expect(svc.health()).toEqual({ status: 'ok' });
  });
  it('quote', async () => {
    const { svc, chain } = make();
    const q = await svc.quote({ chainId: 31337, pool: POOL, withdrawnValue: 10n ** 12n }, ctx);
    expect(q.relayerFee).toBe(quoteFee(config(), config().pools[0] as never, 1_000n).toString());
    expect(q.deadline).toBe('1000600');
    expect(await code(svc.quote({ chainId: 31337, pool: POOL, withdrawnValue: 10n }, ctx))).toBe('400:value_too_small');
    expect(await code(svc.quote({ chainId: 31337, pool: DEST, withdrawnValue: 10n ** 12n }, ctx))).toBe('400:unknown_pool');
    chain.state.gasPrice = 10n ** 15n;
    expect(await code(svc.quote({ chainId: 31337, pool: POOL, withdrawnValue: 10n ** 12n }, ctx))).toBe('503:gas_price_too_high');
    chain.state.gasPrice = 1n;
    chain.state.rpcDown = true;
    expect(await code(svc.quote({ chainId: 31337, pool: POOL, withdrawnValue: 10n ** 12n }, ctx))).toBe('502:rpc_error');
  });
  it('relays a valid request and logs only allowlisted fields', async () => {
    const lines: string[] = [];
    const { svc, chain } = make({ lines });
    expect(await svc.relay(goodRequest(), ctx)).toEqual({ txHash: TX, status: 'confirmed' });
    expect(chain.sent).toBe(1);
    const all = lines.join('\n');
    expect(all).not.toContain(DEST);
    expect(all).not.toContain('1000000');
    for (const l of lines) expect(Object.keys(JSON.parse(l) as object).every((k) => ['ts', 'level', 'event', 'requestId', 'route', 'status', 'chainId', 'txHash', 'errorClass'].includes(k))).toBe(true);
  });
  it('rejects bad requests before spending gas', async () => {
    const cases: [string, Parameters<typeof goodRequest>[0], string][] = [
      ['wrong relayer', { w: { relayer: DEST } }, '400:wrong_relayer'],
      ['wrong feeTo', { w: { feeTo: DEST } }, '400:wrong_fee_to'],
      ['zero recipient', { w: { recipient: zeroAddress } }, '400:bad_recipient'],
      ['pool recipient', { w: { recipient: POOL } }, '400:bad_recipient'],
      ['announce too large', { w: { announce: `0x${'00'.repeat(1025)}` } }, '400:announce_too_large'],
      ['asp flag mismatch', { w: { aspPublisher: DEST } }, '400:asp_mismatch'],
      ['asp flag 2', { sig: { 5: 2n } }, '400:asp_mismatch'],
      ['zero value', { sig: { 2: 0n } }, '400:fee_too_high'],
      ['fee > cap', { fee: 600_000_000n }, '400:fee_too_high'],
      ['fee too low', { fee: 1n }, '400:fee_too_low'],
      ['deadline soon', { w: { deadline: 1_000_010n } }, '400:deadline_too_soon'],
      ['context tampered', { sig: { 8: 5n } }, '400:context_mismatch'],
    ];
    for (const [name, o, expected] of cases) {
      const { svc, chain } = make();
      const got = await code(svc.relay(goodRequest(o), ctx));
      // a tampered withdrawal field changes the context only when the signal is not recomputed
      expect([name, got]).toEqual([name, expected]);
      expect(chain.sent).toBe(0);
      expect(chain.simulated).toBe(0);
    }
  });
  it('field tampering after proof binding fails on context', async () => {
    const { svc } = make();
    const good = goodRequest();
    for (const t of [{ recipient: '0x5000000000000000000000000000000000000005' as const }, { relayerFee: good.withdrawal.relayerFee + 1n }, { deadline: good.withdrawal.deadline + 1n }, { announce: '0x01' as const }]) {
      const bad = { ...good, withdrawal: { ...good.withdrawal, ...t } };
      expect(await code(svc.relay(bad, ctx))).toBe('400:context_mismatch');
    }
    expect(SCOPE).toBeGreaterThan(0n);
  });
  it('chain-state and proof checks', async () => {
    let r = make();
    r.chain.state.knownRoot = false;
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('400:unknown_root');
    r = make();
    r.chain.state.spent = true;
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('400:nullifier_spent');
    r = make({ verify: () => Promise.resolve(false) });
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('400:invalid_proof');
    expect(r.chain.simulated).toBe(0);
    r = make();
    r.chain.state.gasPrice = 10n ** 15n;
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('503:gas_price_too_high');
    r = make();
    r.chain.state.rpcDown = true;
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('502:rpc_error');
    expect(await code(make().svc.relay({ ...goodRequest(), pool: DEST }, ctx))).toBe('400:unknown_pool');
  });
  it('simulation revert is neutral for the breaker; operational failures open it', async () => {
    const clock = { t: 0 };
    const breaker = new GuardedBreaker({ windowSize: 4, minSamples: 2, failureRatio: 0.5, cooldownMs: 1000, probeTimeoutMs: 1000 }, () => clock.t);
    const r = make({ breaker });
    r.chain.state.simulate = 'revert';
    for (let i = 0; i < 5; i++) expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('400:simulation_reverted');
    expect(breaker.state).toBe('closed');
    r.chain.state.simulate = 'rpc';
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('502:rpc_error');
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('502:rpc_error');
    expect(breaker.state).toBe('open');
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('503:breaker_open');
    expect(r.svc.health().status).toBe('unhealthy');
    r.chain.state.simulate = 'ok';
    r.chain.state.send = 'fail';
    clock.t = 5000;
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('502:send_failed');
  });
  it('mined revert charges the loss budget; budget then blocks', async () => {
    const loss = new LossBudget({ windowMs: 1e9, perKeyLimit: 100n, globalLimit: 1000n, maxKeys: 10 });
    const r = make({ loss });
    r.chain.state.receipt = 'reverted';
    r.chain.state.costWei = 100n;
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('502:mined_revert');
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('429:loss_budget_exhausted');
    expect(r.chain.sent).toBe(1);
  });
  it('CONTRACTS-POOLS-02: refuses a simulation far above the gas the fee is priced for', async () => {
    const r = make();
    r.chain.state.gasLimit = 3_652_993n;
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('400:gas_too_high');
    expect(r.chain.sent).toBe(0);
    r.chain.state.gasLimit = 150_000n;
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('ok');
    r.chain.state.gasLimit = 150_001n;
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('400:gas_too_high');
  });
  it('CONTRACTS-POOLS-02: confirmed relay charges the loss budget gasCost - fee', async () => {
    const fee = goodRequest().withdrawal.relayerFee;
    const loss = new LossBudget({ windowMs: 1e9, perKeyLimit: 100n, globalLimit: 1000n, maxKeys: 10 });
    const r = make({ loss });
    r.chain.state.costWei = fee + 100n;
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('ok');
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('429:loss_budget_exhausted');
    const r2 = make({ loss: new LossBudget({ windowMs: 1e9, perKeyLimit: 100n, globalLimit: 1000n, maxKeys: 10 }) });
    r2.chain.state.costWei = fee - 1n;
    expect(await code(r2.svc.relay(goodRequest(), ctx))).toBe('ok');
    expect(await code(r2.svc.relay(goodRequest(), ctx))).toBe('ok');
  });
  it('receipt timeout returns pending', async () => {
    const r = make();
    r.chain.state.receipt = 'timeout';
    expect(await r.svc.relay(goodRequest(), ctx)).toEqual({ txHash: TX, status: 'pending' });
  });
  it('rate limits per client key', async () => {
    const limiter = new TokenBucketLimiter({ ratePerSecond: 0.001, burst: 5, maxKeys: 4 });
    const r = make({ limiter });
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('ok');
    expect(await code(r.svc.relay(goodRequest(), ctx))).toBe('429:rate_limited');
    expect(await code(r.svc.quote({ chainId: 31337, pool: POOL, withdrawnValue: 10n ** 12n }, { clientKey: 'other' }))).toBe('ok');
    const tiny = new TokenBucketLimiter({ ratePerSecond: 1, burst: 1, maxKeys: 4 });
    expect(await code(make({ limiter: tiny }).svc.relay(goodRequest(), ctx))).toBe('429:rate_limited');
  });
  it('serialises sends per chain', async () => {
    const r = make();
    const out = await Promise.all([r.svc.relay(goodRequest(), ctx), r.svc.relay(goodRequest(), { clientKey: 'k2' }), r.svc.relay(goodRequest(), { clientKey: 'k3' })]);
    expect(out.length).toBe(3);
    expect(r.chain.sent).toBe(3);
  });
  it('hot-key floor trips the breaker', async () => {
    const r = make();
    expect(await r.svc.checkHotKeys(1n)).toBe(true);
    expect(r.svc.health().status).toBe('ok');
    expect(await r.svc.checkHotKeys(10n ** 19n)).toBe(false);
    expect(r.svc.health().status).toBe('unhealthy');
    const r2 = make();
    r2.chain.getBalance = () => Promise.reject(new Error('rpc'));
    expect(await r2.svc.checkHotKeys(1n)).toBe(false);
  });
  it('snarkjs proof conversion swaps G2', () => {
    const p = toSnarkjsProof(goodRequest().proof);
    expect(p.pi_b[0]).toEqual(['4', '3']);
    expect(p.pi_a[2]).toBe('1');
  });
});
