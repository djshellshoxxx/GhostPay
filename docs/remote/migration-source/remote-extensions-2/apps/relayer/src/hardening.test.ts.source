import { connect } from 'node:net';
import { describe, expect, it, vi, afterEach } from 'vitest';
import { SimulationRevert } from './errors.js';
import { CHAIN_ID, DEST, FEE_TO, OWNER, OTHER_KEY, STRANGER, USDC, call, errCode, prepare, startHarness, testConfig, FakeChain, type Harness } from './harness.testutil.js';
import { CircuitBreaker } from './breaker.js';
import { DailyBudget } from './budget.js';
import { createLogger } from './log.js';
import { buildRelayer } from './runtime.js';
import { ConfigError } from './secrets.js';
import type { Alert } from './alerts.js';

let h: Harness | undefined;
afterEach(async () => {
  await h?.stop();
  h?.relayer.dispose();
  h = undefined;
});
async function start(o: Parameters<typeof startHarness>[0] = {}): Promise<Harness> {
  h = await startHarness(o);
  return h;
}
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20));
const sweepBody = async (s: Harness, o: Parameters<typeof prepare>[1] = {}): Promise<Record<string, unknown>> => (await prepare(s, o)).body;
const post = (s: Harness, body: unknown) => call(s, 'POST', '/v1/sweep', body);
const health = async (s: Harness): Promise<{ status: number; body: { status: string; chains: { breaker: string }[] } }> => {
  const r = await call(s, 'GET', '/healthz');
  return { status: r.status, body: r.json as { status: string; chains: { breaker: string }[] } };
};

describe('CircuitBreaker probe state machine (S3-05)', () => {
  const mk = (): { b: CircuitBreaker; t: { ms: number } } => {
    const t = { ms: 0 };
    return { t, b: new CircuitBreaker({ windowSize: 10, minSamples: 3, failureRatio: 0.5, cooldownMs: 1000, halfOpenTimeoutMs: 400 }, () => t.ms) };
  };
  it('admits one probe, blocks others, and success closes', () => {
    const { b, t } = mk();
    b.trip();
    expect(b.allow()).toBe(false);
    t.ms = 1000;
    expect(b.allow()).toBe(true);
    expect(b.state).toBe('half_open');
    expect(b.allow()).toBe(false); // a probe is in flight
    b.recordSuccess();
    expect(b.state).toBe('closed');
  });
  it('releaseProbe frees the slot without a verdict: the next request becomes the probe', () => {
    const { b, t } = mk();
    b.trip();
    t.ms = 1000;
    expect(b.allow()).toBe(true);
    b.releaseProbe();
    expect(b.state).toBe('half_open');
    expect(b.allow()).toBe(true);
    b.recordFailure();
    expect(b.state).toBe('open');
  });
  it('a probe that never resolves times out and re-opens (cannot latch)', () => {
    const { b, t } = mk();
    b.trip();
    t.ms = 1000;
    expect(b.allow()).toBe(true);
    t.ms = 1399;
    expect(b.state).toBe('half_open');
    t.ms = 1400;
    expect(b.state).toBe('open');
    expect(b.isBlocking()).toBe(true);
    t.ms = 2400;
    expect(b.allow()).toBe(true); // a fresh probe after the new cooldown
    t.ms = 2900;
    expect(b.isBlocking()).toBe(true); // timed out and re-opened (cooldown restarted); isBlocking evaluated the timeout itself
    expect(b.state).toBe('open');
  });
  it('defaults the half-open timeout to the cooldown', () => {
    const t = { ms: 0 };
    const b = new CircuitBreaker({ windowSize: 4, minSamples: 2, failureRatio: 0.5, cooldownMs: 100 }, () => t.ms);
    b.trip();
    t.ms = 100;
    b.allow();
    t.ms = 199;
    expect(b.state).toBe('half_open');
    t.ms = 200;
    expect(b.state).toBe('open');
  });
});

describe('S3-05 regression of poc-11: user-error probe must not latch the breaker', () => {
  it('recovers after a user-error probe and /healthz reports half_open as unhealthy', async () => {
    const s = await start();
    expect((await post(s, await sweepBody(s, { nonce: 1n }))).status).toBe(200);
    expect((await health(s)).body.status).toBe('ok');

    s.fake.balance = 0n; // breaker trips on the hot-key balance floor
    expect(errCode(await post(s, await sweepBody(s, { nonce: 2n })))).toBe('breaker_open');
    const open = await health(s);
    expect(open.status).toBe(503);
    expect(open.body.chains[0]?.breaker).toBe('open');

    s.fake.balance = 10n ** 18n;
    s.clock.ms += 61_000; // cooldown elapsed; the next request is the probe
    s.fake.simulateError = new SimulationRevert('NonceAlreadyUsed'); // user-class failure on the probe
    expect(errCode(await post(s, await sweepBody(s, { nonce: 3n })))).toBe('nonce_used');
    const half = await health(s);
    expect(half.body.chains[0]?.breaker).toBe('half_open');
    expect(half.body.status).toBe('unhealthy'); // not "ok" any more
    expect(half.status).toBe(503);

    s.fake.simulateError = undefined; // problem fixed: a valid sweep must be admitted as the next probe
    expect((await post(s, await sweepBody(s, { nonce: 4n }))).status).toBe(200);
    expect((await health(s)).body).toMatchObject({ status: 'ok', chains: [{ breaker: 'closed' }] });
  });

  it('every non-verdict exit releases the probe (gas price cap, budget, gas limit)', async () => {
    const s = await start();
    s.fake.balance = 0n;
    await post(s, await sweepBody(s, { nonce: 1n }));
    s.fake.balance = 10n ** 18n;
    s.clock.ms += 61_000;
    s.fake.gasLimit = 500_000n; // above maxGasLimit 400000
    expect(errCode(await post(s, await sweepBody(s, { nonce: 2n })))).toBe('gas_limit_too_high');
    expect((await health(s)).body.chains[0]?.breaker).toBe('half_open');
    s.fake.gasLimit = 150_000n;
    expect((await post(s, await sweepBody(s, { nonce: 3n }))).status).toBe(200);
  });

  it('an abandoned half-open breaker re-opens after the timeout instead of staying latched', async () => {
    const s = await start();
    s.fake.balance = 0n;
    await post(s, await sweepBody(s, { nonce: 1n }));
    s.fake.balance = 10n ** 18n;
    s.clock.ms += 61_000;
    s.fake.simulateError = new SimulationRevert('Expired');
    await post(s, await sweepBody(s, { nonce: 2n }));
    expect((await health(s)).body.chains[0]?.breaker).toBe('half_open');
    s.clock.ms += 31_000; // > halfOpenTimeoutSeconds (30)
    expect((await health(s)).body.chains[0]?.breaker).toBe('open');
    s.clock.ms += 61_000;
    s.fake.simulateError = undefined;
    expect((await post(s, await sweepBody(s, { nonce: 3n }))).status).toBe(200);
  });

  it('reports degraded when only some chains are impaired', async () => {
    const a = new FakeChain(11155111);
    const b = new FakeChain(84532);
    const base = testConfig();
    const chain2 = { ...base.chains[0]!, chainId: 84532, name: 'Base Sepolia' };
    const r = await buildRelayer({
      config: { ...base, chains: [base.chains[0]!, chain2] },
      hotKey: new Uint8Array(32).fill(3),
      quoteSecret: new Uint8Array(32).fill(9),
      logger: createLogger(() => undefined),
      clients: new Map([[11155111, a], [84532, b]]),
    });
    expect(r.service.health().status).toBe('ok');
    b.balance = 0n;
    await r.service.monitorOnce();
    expect(r.service.health().status).toBe('ok'); // the monitor only alerts; a job trips the breaker
    (r.service as unknown as { chains: Map<number, { breaker: CircuitBreaker }> }).chains.get(84532)?.breaker.trip();
    expect(r.service.health()).toMatchObject({ status: 'degraded' });
    (r.service as unknown as { chains: Map<number, { breaker: CircuitBreaker }> }).chains.get(11155111)?.breaker.trip();
    expect(r.service.health()).toMatchObject({ status: 'unhealthy' });
    r.dispose();
  });
});

describe('S3-06 gas griefing', () => {
  it('pre-checks nonce, balance and allowance on chain before any simulation', async () => {
    const s = await start();
    s.fake.ownerBalance = 1n;
    const low = await post(s, await sweepBody(s, { nonce: 1n }));
    expect(low.status).toBe(422);
    expect(errCode(low)).toBe('insufficient_token_balance');
    s.fake.ownerBalance = 10n ** 12n;
    s.fake.allowance = 5n;
    expect(errCode(await post(s, await sweepBody(s, { nonce: 2n })))).toBe('insufficient_allowance');
    expect(s.fake.simulations).toBe(0);
    expect(s.fake.sent).toHaveLength(0);
    // a permit supplies the allowance, so the existing allowance is not required
    expect((await post(s, await sweepBody(s, { nonce: 3n, permit: true }))).status).toBe(200);
    s.fake.used.add(`${OWNER}:9`);
    const used = await post(s, await sweepBody(s, { nonce: 9n, permit: true }));
    expect(used.status).toBe(409);
    expect(errCode(used)).toBe('nonce_used');
    expect((await health(s)).body.status).toBe('ok'); // user errors never touch the breaker
  });

  it('treats a failing pre-check read as an RPC failure', async () => {
    const s = await start();
    s.fake.stateError = new Error('boom');
    expect(errCode(await post(s, await sweepBody(s, { nonce: 1n })))).toBe('rpc_unavailable');
  });

  it('re-simulates right before sending; a state change costs the source a strike, not the breaker', async () => {
    const s = await start();
    s.fake.simulateErrorFrom = { n: 2, error: new SimulationRevert('SafeERC20FailedOperation') };
    const r = await post(s, await sweepBody(s, { nonce: 1n }));
    expect(errCode(r)).toBe('token_transfer_failed');
    expect(s.fake.simulations).toBe(2);
    expect(s.fake.sent).toHaveLength(0);
    expect((await health(s)).body.status).toBe('ok');
    // a second-simulation RPC failure is operational, not a strike
    s.fake.simulateErrorFrom = { n: 4, error: new Error('rpc') };
    expect(errCode(await post(s, await sweepBody(s, { nonce: 2n })))).toBe('rpc_unavailable');
    s.fake.simulateErrorFrom = undefined;
    // two strikes recorded so far for neither? only the revert one: one strike; two more exhaust the owner budget (3)
    for (const n of [3n, 4n]) {
      s.fake.simulateErrorFrom = { n: s.fake.simulations + 2, error: new SimulationRevert('SafeERC20FailedOperation') };
      expect(errCode(await post(s, await sweepBody(s, { nonce: n })))).toBe('token_transfer_failed');
    }
    s.fake.simulateErrorFrom = undefined;
    const blocked = await post(s, await sweepBody(s, { nonce: 5n }));
    expect(blocked.status).toBe(429);
    expect(errCode(blocked)).toBe('failure_budget_exceeded');
    expect(Number(blocked.headers.get('retry-after'))).toBeGreaterThan(0);
    s.clock.ms += 3_601_000; // window passed: allowed again
    expect((await post(s, await sweepBody(s, { nonce: 6n }))).status).toBe(200);
  });

  it('mined reverts spend gas budget and the source budget but never open the breaker', async () => {
    const s = await start({ config: { abuse: { ownerMaxFailures: 2, destinationMaxFailures: 5, windowSeconds: 3600 } } });
    s.fake.receipt = { status: 'reverted', gasUsed: 100_000n };
    for (const n of [1n, 2n, 3n, 4n]) {
      const r = await post(s, await sweepBody(s, { nonce: n }));
      if (n <= 2n) {
        expect(r.status).toBe(200);
        await settle();
      } else {
        expect(errCode(r)).toBe('failure_budget_exceeded');
      }
    }
    expect((await health(s)).body.status).toBe('ok');
    expect(s.relayer.service.renderMetrics()).toContain('ghostpay_relayer_failed_gas_wei_total{chain="11155111"} 200000000000000');
    expect(s.relayer.service.renderMetrics()).toContain('ghostpay_relayer_sweeps_total{chain="11155111",result="reverted"} 2');
    expect(s.relayer.service.renderMetrics()).toContain('ghostpay_relayer_daily_budget_used_wei{chain="11155111"} 200000000000000');
    expect(s.logs.join('\n')).toContain('sweep_reverted');
  });

  it('a destination budget stops fresh owners paying the same beneficiary after reverts', async () => {
    const s = await start({ config: { abuse: { ownerMaxFailures: 100, destinationMaxFailures: 2, windowSeconds: 3600 } } });
    s.fake.receipt = { status: 'reverted', gasUsed: 50_000n };
    for (const n of [1n, 2n]) {
      expect((await post(s, await sweepBody(s, { nonce: n }))).status).toBe(200);
      await settle();
    }
    const other = await prepare(s, { nonce: 3n });
    expect(errCode(await post(s, other.body))).toBe('failure_budget_exceeded');
    // a different destination is unaffected
    expect((await post(s, await sweepBody(s, { nonce: 4n, destination: STRANGER }))).status).toBe(200);
  });

  it('re-checks the failure budget when a queued job finally runs', async () => {
    const s = await start({ config: { abuse: { ownerMaxFailures: 1, destinationMaxFailures: 5, windowSeconds: 3600 }, queue: { maxPending: 4, receiptTimeoutSeconds: 30 } } });
    let release: () => void = () => undefined;
    s.fake.receiptGate = new Promise<void>((r) => {
      release = r;
    });
    s.fake.receipt = { status: 'reverted', gasUsed: 10_000n };
    const first = post(s, await sweepBody(s, { nonce: 1n }));
    const second = post(s, await sweepBody(s, { nonce: 2n }));
    await settle();
    release();
    expect((await first).status).toBe(200);
    expect(errCode(await second)).toBe('failure_budget_exceeded'); // admitted while queued, refused in the lane
  });

  it('refuses a sweep whose fee no longer covers the gas at send time', async () => {
    const s = await start();
    s.fake.gasLimit = 200_000n; // 0.2 USDC/100k gas at 1 gwei and $3000 => 0.6 USDC > 0.5 USDC fee
    const r = await post(s, await sweepBody(s, { nonce: 1n }));
    expect(r.status).toBe(422);
    expect(errCode(r)).toBe('fee_below_gas_cost');
    expect(s.fake.sent).toHaveLength(0);
    // the estimate (without headroom) is what must be covered when the client reports it
    const orig = s.fake.simulateSweep.bind(s.fake);
    s.fake.simulateSweep = async (c) => ({ ...(await orig(c)), gasEstimate: 100_000n });
    expect((await post(s, await sweepBody(s, { nonce: 2n }))).status).toBe(200);
  });

  it('rejects when the gas price moved beyond the bound, and re-prices the fee check when within it', async () => {
    const s = await start();
    const orig = s.fake.simulateSweep.bind(s.fake);
    s.fake.simulateSweep = async (c) => {
      const r = await orig(c);
      if (s.fake.simulations === 1) s.fake.gasPrice = 5_000_000_000n; // +400 %
      return r;
    };
    const moved = await post(s, await sweepBody(s, { nonce: 1n }));
    expect(moved.status).toBe(503);
    expect(errCode(moved)).toBe('gas_price_moved');
    expect(s.fake.sent).toHaveLength(0);

    const t = await start({ config: { gas: { coverPercent: 100, maxMovePercent: 1000, quoteCacheSeconds: 0 } } });
    const orig2 = t.fake.simulateSweep.bind(t.fake);
    t.fake.simulateSweep = async (c) => {
      const r = await orig2(c);
      if (t.fake.simulations === 1) t.fake.gasPrice = 1_900_000_000n; // within the bound but the fee no longer covers it
      return r;
    };
    expect(errCode(await post(t, await sweepBody(t, { nonce: 1n })))).toBe('fee_below_gas_cost');
  });

  it('reserves the budget for the fresh simulation: a larger second gas limit can exhaust it', async () => {
    const s = await start({
      config: { chains: [{ ...testConfig().chains[0]!, dailyBudgetWei: 150_000n * 1_000_000_000n }] },
    });
    const orig = s.fake.simulateSweep.bind(s.fake);
    s.fake.simulateSweep = async (c) => {
      const r = await orig(c);
      if (s.fake.simulations === 1) s.fake.gasLimit = 160_000n;
      return r;
    };
    const r = await post(s, await sweepBody(s, { nonce: 1n }));
    expect(r.status).toBe(503);
    expect(errCode(r)).toBe('budget_exhausted');
    expect(s.fake.sent).toHaveLength(0);
  });

  it('a second simulation above the gas cap is refused', async () => {
    const s = await start();
    const orig = s.fake.simulateSweep.bind(s.fake);
    s.fake.simulateSweep = async (c) => {
      const r = await orig(c);
      if (s.fake.simulations === 1) s.fake.gasLimit = 450_000n;
      return r;
    };
    expect(errCode(await post(s, await sweepBody(s, { nonce: 1n })))).toBe('gas_limit_too_high');
  });

  it('refuses to quote when the cover percentage cannot be met', async () => {
    const s = await start({ config: { gas: { coverPercent: 200, maxMovePercent: 25, quoteCacheSeconds: 0 } } });
    const small = await call(s, 'POST', '/v1/quote', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' });
    expect(errCode(small)).toBe('amount_too_small'); // 0.5 USDC fee vs 2 x 0.3 USDC gas
  });

  it('S3-18(g): releasing a reservation after a UTC rollover does not reduce the new day', () => {
    const t = { ms: 0 };
    const b = new DailyBudget(1000n, () => t.ms);
    expect(b.reserve(400n)).toBe(true);
    const day = b.currentDay;
    expect(b.remaining).toBe(600n);
    t.ms = 86_400_000;
    expect(b.reserve(100n)).toBe(true);
    b.release(400n, day); // stale reservation: ignored
    expect(b.used).toBe(100n);
    b.release(100n, b.currentDay);
    expect(b.used).toBe(0n);
    expect(b.remaining).toBe(1000n);
    expect(new DailyBudget(1n, () => 0).remaining).toBe(1n);
    const over = new DailyBudget(5n, () => 0);
    over.reserve(5n);
    expect(over.remaining).toBe(0n);
  });
});

describe('alerts and monitor (G-11)', () => {
  const capture = async (over: Parameters<typeof startHarness>[0] = {}): Promise<{ s: Harness; alerts: Alert[] }> => {
    const alerts: Alert[] = [];
    const s = await start(over);
    // replace the sink the service uses
    (s.relayer.service as unknown as { alerts: unknown }).alerts = { notify: (a: Alert) => alerts.push(a) };
    return { s, alerts };
  };
  it('raises low_balance when a job finds the balance under the floor and balance_warning under twice the floor', async () => {
    const { s, alerts } = await capture();
    s.fake.balance = 1_500_000_000_000_000n; // < 2 x 1e15 but above the floor
    expect((await post(s, await sweepBody(s, { nonce: 1n }))).status).toBe(200);
    expect(alerts).toEqual([{ kind: 'balance_warning', severity: 'warning', chainId: CHAIN_ID }]);
    s.fake.balance = 0n;
    await post(s, await sweepBody(s, { nonce: 2n }));
    expect(alerts.at(-1)).toEqual({ kind: 'low_balance', severity: 'critical', chainId: CHAIN_ID });
  });
  it('the monitor alerts without traffic and survives RPC failures', async () => {
    const { s, alerts } = await capture();
    s.fake.balance = 0n;
    await s.relayer.service.monitorOnce();
    expect(alerts).toHaveLength(1);
    s.fake.rpcDown = true;
    await s.relayer.service.monitorOnce();
    expect(alerts).toHaveLength(1);
    expect(s.relayer.service.renderMetrics()).toContain('ghostpay_relayer_errors_total{class="monitor_rpc"} 1');
    s.relayer.service.startMonitor(3_600_000);
    s.relayer.service.stopMonitor();
    s.relayer.service.stopMonitor();
  });
  it('raises error_rate once when RPC failures open the breaker', async () => {
    const { s, alerts } = await capture();
    s.fake.simulateError = new Error('rpc exploded');
    for (let i = 1; i <= 5; i++) await post(s, await sweepBody(s, { nonce: BigInt(i) }));
    expect(alerts.filter((a) => a.kind === 'error_rate')).toEqual([{ kind: 'error_rate', severity: 'critical', chainId: CHAIN_ID }]);
  });
  it('builds a webhook sink from config and delivers a payload with no secrets or user data', async () => {
    const posts: { url: string; body: string }[] = [];
    const base = testConfig();
    const fake = new FakeChain();
    const r = await buildRelayer({
      config: { ...base, alerts: { webhookUrl: 'https://hooks.example.org/path/SECRETPATH', cooldownSeconds: 60 } },
      hotKey: new Uint8Array(32).fill(3),
      quoteSecret: new Uint8Array(32).fill(9),
      logger: createLogger(() => undefined),
      clients: new Map([[CHAIN_ID, fake]]),
      alertPost: (u, b) => {
        posts.push({ url: u.href, body: b });
        return Promise.resolve(204);
      },
    });
    fake.balance = 0n;
    await r.service.monitorOnce();
    await r.service.monitorOnce(); // throttled by the cooldown
    expect(posts).toHaveLength(1);
    const payload = JSON.parse(posts[0]?.body ?? '{}') as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(['at', 'chainId', 'kind', 'severity', 'source']);
    expect(payload).toMatchObject({ source: 'ghostpay-relayer', kind: 'low_balance', severity: 'critical', chainId: CHAIN_ID });
    expect(posts[0]?.body).not.toContain('SECRETPATH');
    expect(posts[0]?.body).not.toMatch(/0x[0-9a-fA-F]{8}/);
    r.dispose();
  });
});

describe('/metrics (G-11)', () => {
  const TOKEN = 'm'.repeat(40);
  const authed = { authorization: `Bearer ${TOKEN}` };
  it('is a 404 when disabled', async () => {
    const s = await start();
    expect((await call(s, 'GET', '/metrics', undefined, authed)).status).toBe(404);
  });
  it('requires the bearer token when configured, and exposes no identifying labels', async () => {
    const s = await start({ config: { metrics: { enabled: true, bearerToken: TOKEN } } });
    await call(s, 'POST', '/v1/quote', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' });
    await post(s, await sweepBody(s, { nonce: 1n }));
    const none = await call(s, 'GET', '/metrics');
    expect(none.status).toBe(401);
    expect(none.headers.get('www-authenticate')).toBe('Bearer');
    expect((await call(s, 'GET', '/metrics', undefined, { authorization: `Bearer ${TOKEN}x` })).status).toBe(401);
    expect((await call(s, 'GET', '/metrics', undefined, { authorization: TOKEN })).status).toBe(401);
    const ok = await fetch(`${s.url}/metrics`, { headers: authed });
    expect(ok.status).toBe(200);
    expect(ok.headers.get('content-type')).toContain('text/plain');
    const text = await ok.text();
    expect(text).toContain('# TYPE ghostpay_relayer_http_requests_total counter');
    expect(text).toContain('ghostpay_relayer_http_requests_total{route="/v1/quote",status="200"} 1');
    expect(text).toContain('ghostpay_relayer_sweeps_total{chain="11155111",result="sent"} 1');
    expect(text).toContain('ghostpay_relayer_breaker_state{chain="11155111"} 0');
    expect(text).toContain('ghostpay_relayer_hot_balance_wei{chain="11155111"} 1000000000000000000');
    expect(text).toContain('ghostpay_relayer_errors_total{class="unauthorized"}');
    for (const pii of [OWNER, DEST, FEE_TO, OTHER_KEY, '127.0.0.1', TOKEN]) expect(text.toLowerCase()).not.toContain(pii.toLowerCase());
    expect(text).not.toMatch(/0x[0-9a-fA-F]{8}/);
    expect((await call(s, 'POST', '/metrics', {}, authed)).status).toBe(405);
  });
  it('without a token it is for loopback scraping only: a forwarded request is refused', async () => {
    const s = await start({ config: { metrics: { enabled: true, bearerToken: undefined } } });
    expect((await call(s, 'GET', '/metrics')).status).toBe(200);
    expect((await call(s, 'GET', '/metrics', undefined, { 'x-forwarded-for': '203.0.113.9' })).status).toBe(401);
  });
  it('is IP rate limited', async () => {
    const s = await start({
      config: {
        metrics: { enabled: true, bearerToken: TOKEN },
        rateLimit: { ipPerMinute: 1, ipBurst: 1, ownerPerMinute: 60, ownerBurst: 20, maxKeys: 100, saltRotationHours: 24, quotePerMinute: 100, quoteBurst: 100 },
      },
    });
    expect((await call(s, 'GET', '/metrics', undefined, authed)).status).toBe(200);
    expect((await call(s, 'GET', '/metrics', undefined, authed)).status).toBe(429);
  });
  it('series are bounded and label values sanitised', async () => {
    const { Metrics } = await import('./metrics.js');
    const m = new Metrics();
    m.inc('ghostpay_relayer_errors_total', { class: '0xABCDEF user@example.com' });
    expect(m.render()).toContain('{class="other"} 1');
    for (let i = 0; i < 600; i++) m.inc('ghostpay_relayer_errors_total', { class: `c${String(i)}` });
    expect(m.render().split('\n').filter((l) => l.startsWith('ghostpay_relayer_errors_total{')).length).toBeLessThanOrEqual(512);
    const nan = new Metrics();
    nan.set('ghostpay_relayer_queue_pending', { chain: 1 }, Number.NaN);
    expect(nan.render()).toContain('ghostpay_relayer_queue_pending{chain="1"} 0');
    expect(m.render().endsWith('\n')).toBe(true);
    expect(new Metrics().render()).toBe('\n');
    const noLabels = new Metrics();
    noLabels.inc('ghostpay_relayer_alerts_total');
    expect(noLabels.render()).toContain('ghostpay_relayer_alerts_total 1');
  });
});

describe('S3-18 server hardening', () => {
  const open = async (s: Harness): Promise<ReturnType<typeof connect>> => {
    const u = new URL(s.url);
    const sock = connect(Number(u.port), u.hostname);
    await new Promise<void>((r) => sock.once('connect', r));
    return sock;
  };
  it('answers 408 and closes when the body trickles in slower than bodyTimeoutMs', async () => {
    const s = await start({ config: { server: { ...testConfig().server, bodyTimeoutMs: 300 } } });
    const sock = await open(s);
    let data = '';
    sock.on('data', (d: Buffer) => {
      data += d.toString();
    });
    const closed = new Promise<void>((r) => sock.once('close', r));
    sock.write('POST /v1/quote HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 50\r\n\r\n{"a"');
    await closed;
    expect(data).toContain('408');
    expect(data).toContain('request_timeout');
    expect((await call(s, 'GET', '/healthz')).status).toBe(200);
  });
  it('caps concurrent connections per peer and frees the slot on close', async () => {
    const s = await start({ config: { server: { ...testConfig().server, maxConnectionsPerIp: 2 } } });
    const a = await open(s);
    const b = await open(s);
    const c = connect(Number(new URL(s.url).port), '127.0.0.1');
    const refused = await new Promise<boolean>((resolve) => {
      c.once('close', () => {
        resolve(true);
      });
      c.once('error', () => undefined);
      setTimeout(() => {
        resolve(false);
      }, 1000);
    });
    expect(refused).toBe(true);
    a.destroy();
    await settle();
    await settle();
    const d = await open(s);
    d.write('GET /healthz HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
    const text = await new Promise<string>((resolve) => {
      let t = '';
      d.on('data', (x: Buffer) => {
        t += x.toString();
      });
      d.on('close', () => {
        resolve(t);
      });
    });
    expect(text).toContain('200');
    b.destroy();
  });
  it('exempts trusted proxies from the per-peer cap', async () => {
    const s = await start({ config: { trustProxy: ['127.0.0.0/8'], server: { ...testConfig().server, maxConnectionsPerIp: 1 } } });
    const socks = [await open(s), await open(s), await open(s)];
    socks[2]?.write('GET /healthz HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
    const text = await new Promise<string>((resolve) => {
      let t = '';
      socks[2]?.on('data', (x: Buffer) => {
        t += x.toString();
      });
      socks[2]?.on('close', () => {
        resolve(t);
      });
    });
    expect(text).toContain('200');
    for (const x of socks) x.destroy();
  });
  it('drops headers beyond maxHeadersCount (a late Content-Type never arrives)', async () => {
    const s = await start({ config: { server: { ...testConfig().server, maxHeadersCount: 8 } } });
    const sock = await open(s);
    const filler = Array.from({ length: 20 }, (_, i) => `X-H${String(i)}: v`).join('\r\n');
    let data = '';
    sock.on('data', (d: Buffer) => {
      data += d.toString();
    });
    const closed = new Promise<void>((r) => sock.once('close', r));
    sock.write(`POST /v1/quote HTTP/1.1\r\nHost: x\r\nConnection: close\r\n${filler}\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n{}`);
    await closed;
    expect(data).toMatch(/^HTTP\/1\.1 (415|400|431)/);
  });
  it('keeps answering /healthz while draining and marks connections for close', async () => {
    const s = await start();
    const sock = await open(s);
    sock.write('GET /healthz HTTP/1.1\r\nHost: x\r\n');
    await settle();
    const closing = s.relayer.server.close();
    let data = '';
    const done = new Promise<void>((r) => {
      sock.on('data', (d: Buffer) => {
        data += d.toString();
      });
      sock.on('close', () => {
        r();
      });
    });
    sock.write('\r\n');
    await done;
    expect(data).toContain('"status":"shutting_down"');
    expect(data.toLowerCase()).toContain('connection: close');
    await closing;
  });
});

describe('runtime wiring (S3-21, S3-27)', () => {
  const mk = (over: Partial<Parameters<typeof buildRelayer>[0]>): Promise<Awaited<ReturnType<typeof buildRelayer>>> =>
    buildRelayer({
      config: testConfig(),
      hotKey: new Uint8Array(32).fill(3),
      quoteSecret: new Uint8Array(32).fill(9),
      logger: createLogger(() => undefined),
      clients: new Map([[CHAIN_ID, new FakeChain()]]),
      ...over,
    });
  it('refuses a quote secret equal to, or starting with, the hot key', async () => {
    await expect(mk({ quoteSecret: new Uint8Array(32).fill(3) })).rejects.toThrow(ConfigError);
    await expect(mk({ quoteSecret: new Uint8Array(32).fill(3) })).rejects.toThrow(/differ from the hot key/);
    await expect(mk({ quoteSecret: Uint8Array.from([...new Uint8Array(32).fill(3), 1, 2, 3]) })).rejects.toThrow(/hot key/);
    await expect(mk({ previousQuoteSecret: new Uint8Array(32).fill(3) })).rejects.toThrow(/hot key/);
    await expect(mk({ previousQuoteSecret: new Uint8Array(32).fill(9) })).rejects.toThrow(/previous quote secret must differ/);
  });
  it('accepts quotes signed under the previous secret during a rotation window, and not after it', async () => {
    const oldSecret = new Uint8Array(32).fill(5);
    const before = await startHarness({ quoteSecret: oldSecret });
    const { body } = await prepare(before, { nonce: 1n });
    await before.stop();
    before.relayer.dispose();
    const during = await startHarness({ previousQuoteSecret: oldSecret });
    expect((await post(during, body)).status).toBe(200);
    await during.stop();
    during.relayer.dispose();
    const after = await start();
    const rejected = await post(after, body);
    expect(rejected.status).toBe(400);
    expect(errCode(rejected)).toBe('invalid_quote');
  });
  it('rotates the rate-limit salt eagerly, without any request', async () => {
    vi.useFakeTimers();
    try {
      const { KeyHasher, RateLimiter } = await import('./limiter.js');
      const t = { ms: 0 };
      const hasher = new KeyHasher(1000, () => t.ms);
      const lim = new RateLimiter({ perMinute: 1, burst: 1, maxKeys: 10 }, hasher, () => t.ms);
      expect(lim.take('a').ok).toBe(true);
      expect(lim.take('a').ok).toBe(false);
      let rotations = 0;
      hasher.onRotate(() => {
        rotations += 1;
      });
      hasher.startTimer(500);
      hasher.startTimer(500); // restarting replaces the timer
      t.ms = 1200;
      vi.advanceTimersByTime(600);
      expect(rotations).toBe(1); // rotated by the timer with no request in between
      hasher.stopTimer();
      hasher.stopTimer();
      t.ms = 1300; // same instant as no refill: bucket was dropped at rotation, a fresh one is full
      expect(lim.take('a').ok).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });
});
