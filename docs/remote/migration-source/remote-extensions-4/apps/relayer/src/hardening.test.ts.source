import { afterEach, describe, expect, it } from 'vitest';
import { CircuitBreaker } from './breaker.js';
import { KeyHasher, RateLimiter } from './limiter.js';
import { SimulationRevert } from './errors.js';
import { parseConfig, type ConfigContext } from './config.js';
import { DEST, HOT_ADDRESS, ORIGIN, STRANGER, SWEEP_CONTRACT, USDC, FEE_TO, call, errCode, prepare, startHarness, testConfig, type Harness } from './harness.testutil.js';

let h: Harness | undefined;
afterEach(async () => {
  await h?.stop();
  h = undefined;
});
async function start(o: Parameters<typeof startHarness>[0] = {}): Promise<Harness> {
  h = await startHarness(o);
  return h;
}
const chainOver = (over: Record<string, unknown>) => ({ chains: [{ ...(testConfig().chains[0] as object), ...over }] }) as never;
const sweep = async (s: Harness, nonce: bigint, extra = {}) => call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce, ...extra })).body);

/** Trips the breaker through three RPC failures, then moves past the cooldown. */
async function openThenCool(s: Harness): Promise<void> {
  s.fake.simulateError = new Error('rpc exploded');
  for (let i = 0; i < 3; i++) expect(['rpc_unavailable', 'breaker_open']).toContain(errCode(await sweep(s, BigInt(i + 1))));
  expect(errCode(await sweep(s, 10n))).toBe('breaker_open');
  s.clock.ms += 61_000;
  s.fake.simulateError = undefined;
}

describe('R1 breaker half-open probe never wedges', () => {
  it('CircuitBreaker.releaseProbe re-admits a probe without closing', () => {
    let t = 0;
    const b = new CircuitBreaker({ windowSize: 4, minSamples: 2, failureRatio: 0.5, cooldownMs: 100 }, () => t);
    b.trip();
    t = 100;
    expect(b.allow()).toBe(true);
    expect(b.allow()).toBe(false);
    b.releaseProbe();
    expect(b.state).toBe('open');
    expect(b.isBlocking()).toBe(false);
    expect(b.allow()).toBe(true);
    b.recordSuccess();
    b.releaseProbe();
    expect(b.state).toBe('closed');
  });

  it('a probe that is a user-caused simulation revert closes the breaker', async () => {
    const s = await start();
    await openThenCool(s);
    s.fake.simulateError = new SimulationRevert('ERC20InsufficientBalance');
    expect((await sweep(s, 11n)).status).toBe(422);
    s.fake.simulateError = undefined;
    const next = await sweep(s, 12n);
    expect(next.status).toBe(200);
    expect(s.relayer.service.health().status).toBe('ok');
  });

  it('a probe refused for gas_price_too_high releases the probe', async () => {
    const s = await start();
    await openThenCool(s);
    const body = (await prepare(s, { nonce: 11n })).body;
    s.fake.gasPrice = 10n ** 12n;
    expect(errCode(await call(s, 'POST', '/v1/sweep', body))).toBe('gas_price_too_high');
    s.fake.gasPrice = 10n ** 9n;
    expect((await sweep(s, 12n)).status).toBe(200);
  });

  it('a probe refused for budget_exhausted releases the probe', async () => {
    const s = await start({ config: chainOver({ dailyBudgetWei: 2n * 10n ** 14n }) });
    expect((await sweep(s, 20n)).status).toBe(200); // uses 1e14 of the 2e14 budget
    await new Promise((r) => setTimeout(r, 30));
    await openThenCool(s);
    expect(errCode(await sweep(s, 11n))).toBe('budget_exhausted');
    s.clock.ms += 86_400_000;
    expect((await sweep(s, 12n)).status).toBe(200);
  });

  it('a probe refused for gas_limit_too_high releases the probe', async () => {
    const s = await start();
    await openThenCool(s);
    s.fake.gasLimit = 10_000_000n;
    expect(errCode(await sweep(s, 11n))).toBe('gas_limit_too_high');
    s.fake.gasLimit = 150_000n;
    expect((await sweep(s, 12n)).status).toBe(200);
  });

  it('health is not ok while a chain is not closed', async () => {
    const s = await start();
    await openThenCool(s);
    let release: () => void = () => undefined;
    s.fake.sendGate = new Promise<void>((r) => { release = r; }); // probe in flight keeps half_open
    const inflight = sweep(s, 11n);
    await new Promise((r) => setTimeout(r, 30));
    expect(s.relayer.service.health().status).toBe('degraded');
    release();
    await inflight;
  });
});

describe('R3 pre-lane funding check', () => {
  it('rejects an unfunded owner before taking the lane or simulating', async () => {
    const s = await start();
    s.fake.tokenBalance = 0n;
    const r = await sweep(s, 1n);
    expect(r.status).toBe(422);
    expect(errCode(r)).toBe('insufficient_balance');
    expect(s.fake.simulations).toBe(0);
    expect(s.relayer.service.health().chains[0]?.breaker).toBe('closed');
  });
  it('rejects missing allowance when no permit is supplied, but not with a permit', async () => {
    const s = await start();
    s.fake.tokenAllowance = 0n;
    expect(errCode(await sweep(s, 1n))).toBe('insufficient_allowance');
    expect(s.fake.simulations).toBe(0);
    expect((await sweep(s, 2n, { permit: true })).status).toBe(200);
  });
  it('maps an RPC failure of the check to rpc_unavailable', async () => {
    const s = await start();
    const body = (await prepare(s, { nonce: 1n })).body;
    s.fake.rpcDown = true;
    expect(errCode(await call(s, 'POST', '/v1/sweep', body))).toBe('rpc_unavailable');
  });
});

describe('R4 limiter clock', () => {
  it('a backwards clock step does not remove tokens', () => {
    let t = 10_000;
    const rl = new RateLimiter({ perMinute: 60, burst: 5, maxKeys: 4 }, new KeyHasher(3_600_000, () => t), () => t);
    expect(rl.take('k').ok).toBe(true); // 4 left
    t = 0; // clock steps back 10 s
    for (let i = 0; i < 4; i++) expect(rl.take('k').ok).toBe(true);
  });
});

describe('R5 quote during shutdown', () => {
  it('refuses to quote once shutting down', async () => {
    const s = await start();
    await s.relayer.service.shutdown();
    await expect(s.relayer.service.quote({ chainId: 11155111, token: USDC, owner: STRANGER, destination: DEST, amount: 100_000_000n })).rejects.toMatchObject({ status: 503, code: 'shutting_down' });
  });
});

describe('R6 fee vs gas at send time (now enforced, RA-FG-3)', () => {
  it('refuses a quoted sweep when gas rose so far that the signed fee no longer covers it', async () => {
    const s = await start();
    const body = (await prepare(s, { nonce: 1n })).body;
    s.fake.gasPrice = 40_000_000_000n; // 40x the quote-time price, still under the 50 gwei cap
    const r = await call(s, 'POST', '/v1/sweep', body);
    expect(r.status).toBe(422);
    expect(errCode(r)).toBe('fee_below_gas');
  });
});

describe('R2 feeTo must equal the manifest feeRecipient', () => {
  const MANIFEST = (feeRecipient: string): string =>
    JSON.stringify({
      chainId: 11155111,
      announcer: '0x55649e01b5df198d18d95b5cc5051630cfd45564',
      router: DEST,
      sweepRelayer: SWEEP_CONTRACT,
      feeRecipient,
      feeBps: 25,
      deployTx: { router: `0x${'11'.repeat(32)}`, sweepRelayer: `0x${'22'.repeat(32)}` },
      solcVersion: '0.8.28',
      commit: 'a'.repeat(40),
      bytecodeHashes: { router: `0x${'33'.repeat(32)}`, sweepRelayer: `0x${'44'.repeat(32)}` },
      date: '2026-10-01T00:00:00Z',
    });
  const chain = (over = {}) => ({
    chainId: 11155111, rpcUrl: 'https://rpc.example/key', tokens: [{ address: USDC, usdStable: true }], nativeUsdPrice: '3000.5',
    gasUnits: { sweep: '100000', sweepWithPermit: '130000' }, maxGasLimit: '400000', maxGasPriceWei: '50000000000',
    dailyBudgetWei: '100000000000000000', minBalanceWei: '1000000000000000', ...over,
  });
  const parse = (c: object, manifest: string | undefined) => {
    const ctx: ConfigContext = { env: {}, hotKeyAddress: HOT_ADDRESS, readManifest: () => manifest };
    return parseConfig({ allowedOrigins: [ORIGIN], chains: [c] }, ctx);
  };
  it('refuses a feeTo that differs from the manifest feeRecipient', () => {
    expect(() => parse(chain({ feeTo: FEE_TO }), MANIFEST(STRANGER))).toThrow(/feeRecipient/);
  });
  it('never defaults to the hot key when a manifest is loaded', () => {
    expect(parse(chain(), MANIFEST(STRANGER)).chains[0]?.feeTo).toBe(STRANGER);
  });
  it('accepts a matching feeTo', () => {
    expect(parse(chain({ feeTo: STRANGER }), MANIFEST(STRANGER)).chains[0]?.feeTo).toBe(STRANGER);
  });
  it('without a manifest (dev/test chains) the documented hot-key default stays', () => {
    expect(parse(chain({ sweepRelayer: SWEEP_CONTRACT }), undefined).chains[0]?.feeTo).toBe(HOT_ADDRESS);
  });
});
