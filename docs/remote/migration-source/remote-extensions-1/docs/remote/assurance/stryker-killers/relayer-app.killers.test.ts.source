// Killer tests for surviving Stryker mutants in apps/relayer. Drop into apps/relayer/src/.
import { afterEach, describe, expect, it } from 'vitest';
import { FEE_TO, OWNER, DEST, USDC, STRANGER, NOW_SEC, FakeChain, call, errCode, prepare, startHarness, testConfig, type Harness } from './harness.testutil.js';

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 40));
const open: Harness[] = [];
const start = async (o: Parameters<typeof startHarness>[0] = {}): Promise<Harness> => { const h = await startHarness(o); open.push(h); return h; };
afterEach(async () => { await Promise.all(open.splice(0).map((h) => h.stop())); });
const chainCfg = (over: Record<string, unknown>) => { const c = testConfig(); return { chains: [{ ...c.chains[0]!, ...over }] } as never; };
const sweep = (h: Harness, body: unknown) => call(h, 'POST', '/v1/sweep', body);
const quoteReq = (over: Record<string, unknown> = {}) => ({ chainId: 11155111, token: USDC, owner: OWNER, destination: DEST, amount: '100000000', ...over });

describe('killers: relayer quote rules (service.ts:190-198)', () => {
  it('owner == feeTo, destination == feeTo and owner == destination are all rejected as invalid_order (service.ts:190)', async () => {
    const h = await start();
    for (const over of [{ owner: FEE_TO }, { destination: FEE_TO }, { destination: OWNER }]) {
      const r = await call(h, 'POST', '/v1/quote', quoteReq(over));
      expect(r.status, JSON.stringify(over)).toBe(422);
      expect(errCode(r)).toBe('invalid_order');
    }
    expect((await call(h, 'POST', '/v1/quote', quoteReq())).status).toBe(200);
  });
  it('a sweep is quoted exactly when the capped fee covers the gas cost: fee == gasCost is accepted (service.ts:198)', async () => {
    const h = await start();
    // default test config: permit token, sweepWithPermit 130 000 gas * 1 gwei = 1.3e14 wei = 0.00013 ETH * $3000 = $0.39 = 390 000 USDC units
    const gasCostUnits = 390_000n;
    const edge = 13_000_000n;                       // 3 % of 13 000 000 == 390 000 == gas cost -> the cap binds and fee == gasCost
    const at = await call(h, 'POST', '/v1/quote', quoteReq({ amount: edge.toString() }));
    expect(at.status).toBe(200);
    expect(BigInt((at.json as { fee: string }).fee)).toBe(gasCostUnits);
    const below = await call(h, 'POST', '/v1/quote', quoteReq({ amount: (edge - 1n).toString() }));
    expect(below.status).toBe(422);
    expect(errCode(below)).toBe('amount_too_small');
  });
});

describe('killers: relayer sweep validation boundaries (service.ts:241-246, 312, 347)', () => {
  it('fee must be within [quote.fee, 300 bps cap] inclusive (service.ts:243)', async () => {
    const h = await start();
    const amount = 100_000_000n;
    const cap = (amount * 300n) / 10_000n;
    expect((await sweep(h, (await prepare(h, { amount, fee: cap, nonce: 1n })).body)).status).toBe(200);
    const over = await sweep(h, (await prepare(h, { amount, fee: cap + 1n, nonce: 2n })).body);
    expect(over.status).toBe(422);
    expect(errCode(over)).toBe('fee_above_cap');
  });
  it('deadline must be strictly after now + min and at most now + max (service.ts:246-247)', async () => {
    const h = await start();
    const t = async (deadlineOffset: number, nonce: bigint) => sweep(h, (await prepare(h, { deadlineOffset, nonce })).body);
    expect(errCode(await t(30, 1n))).toBe('deadline_too_soon');
    expect((await t(31, 2n)).status).toBe(200);
    expect((await t(1800, 3n)).status).toBe(200);
    expect(errCode(await t(1801, 4n))).toBe('deadline_too_far');
  });
  it('a quote is expired at exactly expiresAt, valid one second earlier (service.ts:241)', async () => {
    const h = await start();
    const p = await prepare(h, { nonce: 1n });
    h.clock.ms = p.quote.expiresAt * 1000 - 1000;
    // still valid one second before expiry (deadline offset is relative to the old clock, so only the quote check matters here)
    const early = await sweep(h, p.body);
    expect(early.status === 200 || errCode(early) !== 'quote_expired').toBe(true);
    const p2 = await prepare(h, { nonce: 2n });
    h.clock.ms = p2.quote.expiresAt * 1000;
    const late = await sweep(h, p2.body);
    expect(errCode(late)).toBe('quote_expired');
  });
  it('gas price cap and gas limit cap are inclusive (service.ts:312, 347)', async () => {
    const cfg = testConfig().chains[0]!;
    const fake = new FakeChain(); fake.gasPrice = cfg.maxGasPriceWei; fake.gasLimit = cfg.maxGasLimit;
    const h = await start({ fake });
    const amount = 100_000_000_000n;   // large enough that the sweep is still economical at the maximum gas price
    expect((await sweep(h, (await prepare(h, { amount, nonce: 1n })).body)).status).toBe(200);
    fake.gasLimit = cfg.maxGasLimit + 1n;
    const r = await sweep(h, (await prepare(h, { amount, nonce: 2n })).body);
    expect(errCode(r)).toBe('gas_limit_too_high');
    fake.gasLimit = 150_000n; fake.gasPrice = cfg.maxGasPriceWei + 1n;
    const q = await call(h, 'POST', '/v1/quote', quoteReq({ amount: amount.toString() }));
    expect(q.status).toBe(503);
    expect(errCode(q)).toBe('gas_price_too_high');
  });
});

describe('killers: relayer hot-wallet safety (service.ts:334-377)', () => {
  it('a hot wallet below minBalance trips the breaker, which stays tripped after the balance recovers (service.ts:335)', async () => {
    const fake = new FakeChain();
    const h = await start({ fake });
    const min = testConfig().chains[0]!.minBalanceWei;
    fake.balance = min - 1n;
    expect(errCode(await sweep(h, (await prepare(h, { nonce: 1n })).body))).toBe('breaker_open');
    fake.balance = 10n ** 18n;
    expect(errCode(await sweep(h, (await prepare(h, { nonce: 2n })).body))).toBe('breaker_open');   // cooldown still running
    const hz = await call(h, 'GET', '/healthz');
    expect(JSON.stringify(hz.json)).not.toContain('"breaker":"closed"');
  });
  it('balance == minBalance is sufficient (service.ts:334)', async () => {
    const fake = new FakeChain(); fake.balance = testConfig().chains[0]!.minBalanceWei;
    const h = await start({ fake });
    expect((await sweep(h, (await prepare(h, { nonce: 1n })).body)).status).toBe(200);
  });
  it('a failed broadcast gives the reserved gas budget back and counts as a breaker failure (service.ts:360-361)', async () => {
    const reserved = 150_000n * 1_000_000_000n;
    const fake = new FakeChain();
    const h = await start({ fake, config: chainCfg({ dailyBudgetWei: reserved }) });
    fake.sendFails = true;
    expect(errCode(await sweep(h, (await prepare(h, { nonce: 1n })).body))).toBe('send_failed');
    fake.sendFails = false;
    // the whole budget was released: one more full reservation fits (without the release this is budget_exhausted)
    expect((await sweep(h, (await prepare(h, { nonce: 2n })).body)).status).toBe(200);
  });
  it('send failures feed the breaker: minSamples failures at ratio 0.5 open it (service.ts:361)', async () => {
    const fake = new FakeChain(); fake.sendFails = true;
    const h = await start({ fake });
    for (let i = 1n; i <= 3n; i++) expect(errCode(await sweep(h, (await prepare(h, { nonce: i })).body))).toBe('send_failed');
    fake.sendFails = false;
    expect(errCode(await sweep(h, (await prepare(h, { nonce: 9n })).body))).toBe('breaker_open');
  });
  it('after a mined sweep only the unused part of the reservation is released; a revert is a breaker failure (service.ts:374-377)', async () => {
    const reserved = 150_000n * 1_000_000_000n;           // gasLimit * gasPrice
    const used = 100_000n * 1_000_000_000n;               // receipt gasUsed * gasPrice
    const fake = new FakeChain();
    const h = await start({ fake, config: chainCfg({ dailyBudgetWei: 2n * used + reserved - 1n }) }); // after 2 mined sweeps 2*used is spent; a 3rd reservation no longer fits
    expect((await sweep(h, (await prepare(h, { nonce: 1n })).body)).status).toBe(200);
    await settle();
    expect((await sweep(h, (await prepare(h, { nonce: 2n })).body)).status).toBe(200);
    await settle();
    const third = await sweep(h, (await prepare(h, { nonce: 3n })).body);
    expect(third.status).toBe(503);
    expect(errCode(third)).toBe('budget_exhausted');
    // reverts count as failures
    const fake2 = new FakeChain(); fake2.receipt = { status: 'reverted', gasUsed: 100_000n };
    const h2 = await start({ fake: fake2 });
    for (let i = 1n; i <= 3n; i++) { await sweep(h2, (await prepare(h2, { nonce: i })).body); await settle(); }
    expect(errCode(await sweep(h2, (await prepare(h2, { nonce: 9n })).body))).toBe('breaker_open');
  });
});

describe('killers: relayer HTTP front end (server.ts:62-64, 189-191)', () => {
  const MAX = 16 * 1024;
  const padded = (n: number) => `{${' '.repeat(n - 2)}}`;
  it('body cap is inclusive: MAX bytes reach the validator (400), MAX+1 is 413 with Connection: close (server.ts:64,77,189-191)', async () => {
    const h = await start();
    const ok = await call(h, 'POST', '/v1/quote', padded(MAX));
    expect(ok.status).toBe(400);
    const big = await call(h, 'POST', '/v1/quote', padded(MAX + 1));
    expect(big.status).toBe(413);
    expect(big.headers.get('connection')).toBe('close');
  });
  it('error responses carry the fixed security headers and no stack traces', async () => {
    const h = await start();
    const r = await call(h, 'POST', '/v1/quote', '{not json');
    expect(r.status).toBe(400);
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
    expect(r.headers.get('cache-control')).toBe('no-store');
    expect(JSON.stringify(r.json)).not.toMatch(/at \w+|node_modules|\.ts:/);
  });
  it('content-type must be application/json (optionally ; charset=utf-8) (server.ts:32)', async () => {
    const h = await start();
    for (const ct of ['text/plain', 'application/jsonx', 'xapplication/json', 'application/json; charset=latin1', 'application/json;charset=utf-8x']) {
      const res = await fetch(`${h.url}/v1/quote`, { method: 'POST', headers: { 'content-type': ct }, body: JSON.stringify(quoteReq()) });
      expect(res.status, ct).toBe(415);
    }
    for (const ct of ['application/json', 'application/json; charset=utf-8', 'APPLICATION/JSON;charset=UTF-8']) {
      const res = await fetch(`${h.url}/v1/quote`, { method: 'POST', headers: { 'content-type': ct }, body: JSON.stringify(quoteReq()) });
      expect(res.status, ct).toBe(200);
    }
    void STRANGER; void NOW_SEC;
  });
});

// ---- config.ts ----
import { parseConfig, type ConfigContext } from './config.js';
import { HOT_ADDRESS, ORIGIN, SWEEP_CONTRACT } from './harness.testutil.js';

describe('killers: relayer config validation (config.ts:114-204)', () => {
  const chain = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    chainId: 11155111, rpcUrl: 'https://rpc.example/key', sweepRelayer: SWEEP_CONTRACT,
    tokens: [{ address: USDC, usdStable: true }], nativeUsdPrice: '3000.5',
    gasUnits: { sweep: '100000', sweepWithPermit: '130000' }, maxGasLimit: '400000', maxGasPriceWei: '50000000000',
    dailyBudgetWei: '100000000000000000', minBalanceWei: '1000000000000000', ...over,
  });
  const ctx = (env: Record<string, string> = {}): ConfigContext => ({ env, hotKeyAddress: HOT_ADDRESS, readManifest: () => undefined });
  const ok = (raw: Record<string, unknown>, e: Record<string, string> = {}) => { try { parseConfig({ allowedOrigins: [ORIGIN], chains: [chain()], ...raw }, ctx(e)); return 'ok'; } catch (err) { return (err as Error).message; } };

  it('CORS origins: exact https origins; http only for localhost / 127.0.0.1 (config.ts:123-124)', () => {
    expect(ok({ allowedOrigins: ['http://localhost:3000'] })).toBe('ok');
    expect(ok({ allowedOrigins: ['http://127.0.0.1:3000'] })).toBe('ok');
    expect(ok({ allowedOrigins: ['https://app.example'] })).toBe('ok');
    for (const o of ['http://app.example', 'http://localhost.evil.example', 'ftp://localhost', 'https://app.example/', 'https://app.example/path', '*', 'null', 'https://app.example?x=1', 'https://user@app.example']) {
      expect(ok({ allowedOrigins: [o] }), o).not.toBe('ok');
    }
    expect(ok({ allowedOrigins: [] })).not.toBe('ok');
    expect(ok({ allowedOrigins: Array.from({ length: 33 }, (_, i) => `https://a${i}.example`) })).not.toBe('ok');
    expect(ok({ allowedOrigins: Array.from({ length: 32 }, (_, i) => `https://a${i}.example`) })).toBe('ok');
  });
  it('rpcUrl / rpcUrlEnv: exactly one of them, env names are anchored, env value must be a valid https URL (config.ts:200-204)', () => {
    expect(ok({ chains: [chain({ rpcUrl: undefined, rpcUrlEnv: 'RPC_SEPOLIA' })] }, { RPC_SEPOLIA: 'https://rpc.example/k' })).toBe('ok');
    expect(ok({ chains: [chain({ rpcUrlEnv: 'RPC_SEPOLIA' })] }, { RPC_SEPOLIA: 'https://rpc.example/k' })).not.toBe('ok');   // both
    expect(ok({ chains: [chain({ rpcUrl: undefined })] })).not.toBe('ok');                                                    // neither
    for (const n of ['rpc_lower', '1BAD', 'BAD NAME', 'X;Y', 'A'.repeat(65), '']) {
      expect(ok({ chains: [chain({ rpcUrl: undefined, rpcUrlEnv: n })] }, { [n]: 'https://rpc.example/k' }), n).not.toBe('ok');
    }
    expect(ok({ chains: [chain({ rpcUrl: undefined, rpcUrlEnv: 'A'.repeat(64) })] }, { ['A'.repeat(64)]: 'https://rpc.example/k' })).toBe('ok');
    expect(ok({ chains: [chain({ rpcUrl: undefined, rpcUrlEnv: 'RPC' })] }, { RPC: '' })).not.toBe('ok');
    expect(ok({ chains: [chain({ rpcUrl: undefined, rpcUrlEnv: 'RPC' })] }, {})).not.toBe('ok');
    expect(ok({ chains: [chain({ rpcUrl: 'http://rpc.example/k' })] })).not.toBe('ok');
    expect(ok({ chains: [chain({ rpcUrl: 'https://user:pw@rpc.example/k' })] })).not.toBe('ok');
  });
  it('chain id must be a positive safe integer of a known chain (config.ts:170-176)', () => {
    for (const chainId of [0, -1, 1.5, '11155111', 2 ** 53, 999999]) expect(ok({ chains: [chain({ chainId })] }), String(chainId)).not.toBe('ok');
    const devTokens = [{ address: USDC, usdStable: true, symbol: 'USDC', decimals: 6, permit: true }];
    expect(ok({ chains: [chain({ chainId: 31337, tokens: devTokens })], allowDevChain: true })).toBe('ok');
    expect(ok({ chains: [chain({ chainId: 31337, tokens: devTokens })] })).not.toBe('ok');   // dev chain needs the explicit flag
    expect(ok({ chains: [chain({ chainId: 999999, tokens: devTokens })], allowDevChain: true })).not.toBe('ok');
    expect(ok({ chains: [chain({ chainId: 1 })] })).not.toBe('ok');     // mainnet without manifest
  });
  it('token symbol / decimals shape and bounds (config.ts:149-153)', () => {
    const t = (over: Record<string, unknown>) => ok({ chains: [chain({ tokens: [{ address: '0x90F79bf6EB2c4f870365E785982E1f101E93b906', usdStable: true, symbol: 'USDX', decimals: 6, permit: false, ...over }] })] });
    expect(t({})).toBe('ok');
    expect(t({ decimals: 0 })).toBe('ok');
    expect(t({ decimals: -1 })).not.toBe('ok');
    expect(t({ decimals: 37 })).not.toBe('ok');
    for (const symbol of ['', 'A'.repeat(17), 'x y', 'ab$', '+USDX', 'USDX\n']) expect(t({ symbol }), JSON.stringify(symbol)).not.toBe('ok');
    expect(t({ symbol: 'A'.repeat(16) })).toBe('ok');
  });
  it('numeric knobs reject non-numbers / non-finite values (config.ts:77)', () => {
    for (const quoteTtlSeconds of ['120', NaN, Infinity, null]) expect(ok({ quoteTtlSeconds }), String(quoteTtlSeconds)).not.toBe('ok');
    expect(ok({ quoteTtlSeconds: 120 })).toBe('ok');
  });
});
