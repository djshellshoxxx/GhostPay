import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CHAIN_ID, DEST, FEE_TO, NOPERMIT, NOW_SEC, ORIGIN, OTHER_KEY, OWNER, STRANGER, SWEEP_CONTRACT, USDC, call, errCode, prepare, startHarness, testConfig, type Harness } from './harness.testutil.js';
import { SimulationRevert } from './errors.js';
import type { QuoteResponse } from './service.js';

let h: Harness | undefined;
afterEach(async () => {
  await h?.stop();
  h = undefined;
});

async function start(o: Parameters<typeof startHarness>[0] = {}): Promise<Harness> {
  h = await startHarness(o);
  return h;
}
const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 20));
const chainOver = (over: Record<string, unknown>) => {
  const c = testConfig();
  return { chains: [{ ...(c.chains[0] as object), ...over }] } as never;
};

describe('basic routes, headers and CORS', () => {
  it('serves healthz and info with security headers', async () => {
    const s = await start();
    const r = await call(s, 'GET', '/healthz');
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ status: 'ok', chains: [{ chainId: CHAIN_ID, breaker: 'closed' }] });
    for (const k of ['x-content-type-options', 'cache-control', 'content-security-policy', 'referrer-policy', 'x-frame-options', 'strict-transport-security']) {
      expect(r.headers.get(k)).toBeTruthy();
    }
    const info = await call(s, 'GET', '/v1/info');
    const j = info.json as { feePolicy: { capBps: number; minBps: number }; chains: { feeTo: string; sweepRelayer: string; tokens: unknown[] }[] };
    expect(j.feePolicy.capBps).toBe(300);
    expect(j.feePolicy.minBps).toBe(50);
    expect(j.chains[0]?.feeTo).toBe(FEE_TO);
    expect(j.chains[0]?.sweepRelayer).toBe(SWEEP_CONTRACT);
    expect(j.chains[0]?.tokens).toHaveLength(2);
  });

  it('answers 404 and 405', async () => {
    const s = await start();
    expect(errCode(await call(s, 'GET', '/nope'))).toBe('not_found');
    const r = await call(s, 'GET', '/v1/quote');
    expect(r.status).toBe(405);
    expect(r.headers.get('allow')).toBe('POST');
    expect((await call(s, 'POST', '/healthz', {})).status).toBe(405);
  });

  it('echoes only allowlisted origins, never a wildcard', async () => {
    const s = await start();
    const ok = await call(s, 'GET', '/v1/info', undefined, { origin: ORIGIN });
    expect(ok.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(ok.headers.get('vary')).toContain('Origin');
    const bad = await call(s, 'GET', '/v1/info', undefined, { origin: 'https://evil.example' });
    expect(bad.status).toBe(403);
    expect(bad.headers.get('access-control-allow-origin')).toBeNull();
    const pre = await call(s, 'OPTIONS', '/v1/sweep', undefined, { origin: ORIGIN, 'access-control-request-method': 'POST' });
    expect(pre.status).toBe(204);
    expect(pre.headers.get('access-control-allow-origin')).toBe(ORIGIN);
    expect(pre.headers.get('access-control-allow-methods')).toContain('POST');
    const preBad = await call(s, 'OPTIONS', '/v1/sweep', undefined, { origin: 'https://evil.example' });
    expect(preBad.status).toBe(403);
    expect((await call(s, 'OPTIONS', '/v1/sweep')).headers.get('access-control-allow-origin')).toBeNull();
  });

  it('maps unexpected failures to an opaque 500', async () => {
    const s = await start();
    vi.spyOn(s.relayer.service, 'quote').mockRejectedValue(new Error('boom with secrets'));
    const r = await call(s, 'POST', '/v1/quote', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '1000' });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.json)).not.toContain('boom');
  });
});

describe('request framing', () => {
  const q = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };

  it('requires JSON content type', async () => {
    const s = await start();
    expect(errCode(await call(s, 'POST', '/v1/quote', JSON.stringify(q), { 'content-type': 'text/plain' }))).toBe('unsupported_media_type');
    const none = await fetch(`${s.url}/v1/quote`, { method: 'POST', body: JSON.stringify(q), headers: { 'content-type': '' } });
    expect(none.status).toBe(415);
    const withCharset = await call(s, 'POST', '/v1/quote', JSON.stringify(q), { 'content-type': 'application/json; charset=utf-8' });
    expect(withCharset.status).toBe(200);
  });

  it('rejects malformed JSON, empty bodies and invalid UTF-8', async () => {
    const s = await start();
    expect(errCode(await call(s, 'POST', '/v1/quote', '{nope'))).toBe('invalid_json');
    expect(errCode(await call(s, 'POST', '/v1/quote', ''))).toBe('invalid_json');
    const bin = await fetch(`${s.url}/v1/quote`, { method: 'POST', body: new Uint8Array([0x7b, 0xff, 0x7d]), headers: { 'content-type': 'application/json' } });
    expect(bin.status).toBe(400);
  });

  it('rejects oversize bodies (declared and chunked)', async () => {
    const s = await start();
    const big = JSON.stringify({ pad: 'x'.repeat(17 * 1024) });
    const r = await call(s, 'POST', '/v1/quote', big);
    expect(r.status).toBe(413);
    expect(errCode(r)).toBe('body_too_large');
    const exact = await call(s, 'POST', '/v1/quote', JSON.stringify({ ...q, pad: 'x'.repeat(16 * 1024 - 400) }));
    expect(exact.status).toBe(400); // within cap -> reaches validation (unknown key)

    // chunked body without Content-Length that grows past the cap
    const status = await new Promise<number>((resolve, reject) => {
      const u = new URL(s.url);
      const req = httpRequest({ host: u.hostname, port: u.port, path: '/v1/quote', method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.write('{"a":"' + 'y'.repeat(10 * 1024));
      req.write('y'.repeat(10 * 1024));
      req.end('"}');
    });
    expect(status).toBe(413);
  });

  it('rejects an oversized Content-Length before reading anything', async () => {
    const s = await start();
    const status = await new Promise<number>((resolve, reject) => {
      const u = new URL(s.url);
      const req = httpRequest({ host: u.hostname, port: u.port, path: '/v1/sweep', method: 'POST', headers: { 'content-type': 'application/json', 'content-length': '20000' } }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      });
      req.on('error', reject);
      req.flushHeaders();
    });
    expect(status).toBe(413);
  });

  it('treats a client that aborts mid-body as a bad request', async () => {
    const s = await start();
    const u = new URL(s.url);
    const sock = connect(Number(u.port), u.hostname);
    await new Promise<void>((r) => sock.once('connect', r));
    sock.write('POST /v1/quote HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 50\r\n\r\n{"a"');
    await settle();
    sock.destroy();
    await settle();
    expect((await call(s, 'GET', '/healthz')).status).toBe(200);
  });
});

describe('POST /v1/quote', () => {
  it('prices a permit token by the gas term when it dominates', async () => {
    const s = await start();
    const r = await call(s, 'POST', '/v1/quote', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '20000000' });
    expect(r.status).toBe(200);
    const j = r.json as QuoteResponse;
    // 130000 gas * 1 gwei * 3000 USD/ETH = 390000 token units; x1.10 = 429000
    expect(j.fee).toBe('429000');
    expect(j.feeTo).toBe(FEE_TO);
    expect(j.expiresAt).toBe(NOW_SEC + 120);
    expect(j.quoteToken).toMatch(/^v1\.\d+\.429000\.[0-9a-f]{64}$/);
  });

  it('uses the 50 bps floor and the cheaper non-permit estimate', async () => {
    const s = await start();
    const a = await call(s, 'POST', '/v1/quote', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' });
    expect((a.json as QuoteResponse).fee).toBe('500000');
    const b = await call(s, 'POST', '/v1/quote', { chainId: CHAIN_ID, token: NOPERMIT, owner: OWNER, destination: DEST, amount: '20000000' });
    expect((b.json as QuoteResponse).fee).toBe('330000');
  });

  it('refuses unsupported chain, token, collisions and uneconomical amounts', async () => {
    const s = await start();
    const base = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };
    expect(errCode(await call(s, 'POST', '/v1/quote', { ...base, chainId: 1 }))).toBe('chain_not_supported');
    expect(errCode(await call(s, 'POST', '/v1/quote', { ...base, token: DEST }))).toBe('token_not_supported');
    expect(errCode(await call(s, 'POST', '/v1/quote', { ...base, destination: OWNER }))).toBe('invalid_order');
    expect(errCode(await call(s, 'POST', '/v1/quote', { ...base, destination: FEE_TO }))).toBe('invalid_order');
    const small = await call(s, 'POST', '/v1/quote', { ...base, amount: '1000000' });
    expect(small.status).toBe(422);
    expect(errCode(small)).toBe('amount_too_small');
  });

  it('fails closed when the gas price is above the cap or the RPC is down', async () => {
    const s = await start();
    const base = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };
    s.fake.gasPrice = 51_000_000_000n;
    const hi = await call(s, 'POST', '/v1/quote', base);
    expect(hi.status).toBe(503);
    expect(errCode(hi)).toBe('gas_price_too_high');
    s.fake.rpcDown = true;
    expect(errCode(await call(s, 'POST', '/v1/quote', base))).toBe('rpc_unavailable');
  });

  it.each([
    ['not an object', []],
    ['null', null],
    ['unknown key', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '5', extra: 1 }],
    ['missing key', { chainId: CHAIN_ID, token: USDC, owner: OWNER, amount: '5' }],
    ['chainId string', { chainId: '11155111', token: USDC, owner: OWNER, destination: DEST, amount: '5' }],
    ['chainId float', { chainId: 1.5, token: USDC, owner: OWNER, destination: DEST, amount: '5' }],
    ['chainId zero', { chainId: 0, token: USDC, owner: OWNER, destination: DEST, amount: '5' }],
    ['chainId too big', { chainId: 2 ** 60, token: USDC, owner: OWNER, destination: DEST, amount: '5' }],
    ['short address', { chainId: CHAIN_ID, token: '0x1234', owner: OWNER, destination: DEST, amount: '5' }],
    ['bad checksum', { chainId: CHAIN_ID, token: USDC.replace('c7D4', 'C7d4'), owner: OWNER, destination: DEST, amount: '5' }],
    ['zero address', { chainId: CHAIN_ID, token: `0x${'0'.repeat(40)}`, owner: OWNER, destination: DEST, amount: '5' }],
    ['address number', { chainId: CHAIN_ID, token: 5, owner: OWNER, destination: DEST, amount: '5' }],
    ['amount zero', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '0' }],
    ['amount leading zero', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '05' }],
    ['amount negative', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '-5' }],
    ['amount exponent', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '1e3' }],
    ['amount number', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: 5 }],
    ['amount > uint256', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: (2n ** 256n).toString() }],
    ['amount whitespace', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: ' 5' }],
  ])('rejects %s with 400', async (_name, body) => {
    const s = await start();
    const r = await call(s, 'POST', '/v1/quote', body);
    expect(r.status).toBe(400);
    expect(errCode(r)).toMatch(/^invalid_/);
  });

  it('rejects prototype-polluting shapes', async () => {
    const s = await start();
    const r = await call(s, 'POST', '/v1/quote', '{"__proto__":{"x":1},"chainId":1}');
    expect(r.status).toBe(400);
  });
});

describe('POST /v1/sweep success and validation', () => {
  it('sends a sweep and returns the transaction hash', async () => {
    const s = await start();
    const { body } = await prepare(s);
    const r = await call(s, 'POST', '/v1/sweep', body);
    expect(r.status).toBe(200);
    expect(r.json).toEqual({ txHash: `0x${'0'.repeat(63)}1` });
    const sent = s.fake.sent[0];
    expect(sent?.opts).toEqual({ nonce: 7, gas: 150_000n, gasPrice: 1_000_000_000n });
    expect(sent?.call.permit).toBeUndefined();
    expect(sent?.call.sweepRelayer).toBe(SWEEP_CONTRACT);
  });

  it('passes the permit through for permit tokens', async () => {
    const s = await start();
    const { body } = await prepare(s, { permit: true });
    expect((await call(s, 'POST', '/v1/sweep', body)).status).toBe(200);
    expect(s.fake.sent[0]?.call.permit?.v).toBe(27);
  });

  it('rejects a permit for a token without permit support, or with too little value', async () => {
    const s = await start();
    const np = await prepare(s, { token: NOPERMIT, permit: true });
    expect(errCode(await call(s, 'POST', '/v1/sweep', np.body))).toBe('permit_not_supported');
    const low = await prepare(s, { permit: true, permitValue: 5n });
    expect(errCode(await call(s, 'POST', '/v1/sweep', low.body))).toBe('permit_value_too_low');
  });

  it('rejects unsupported chain, token, and a signature for another chain', async () => {
    const s = await start();
    const { body } = await prepare(s);
    expect(errCode(await call(s, 'POST', '/v1/sweep', { ...body, chainId: 1 }))).toBe('chain_not_supported');
    const sw = body['sweep'] as Record<string, unknown>;
    expect(errCode(await call(s, 'POST', '/v1/sweep', { ...body, sweep: { ...sw, token: DEST } }))).toBe('token_not_supported');
    const wrongDomain = await prepare(s, { chainId: 137 });
    expect(errCode(await call(s, 'POST', '/v1/sweep', wrongDomain.body))).toBe('invalid_signature');
  });

  it('rejects a wrong feeTo', async () => {
    const s = await start();
    const { body } = await prepare(s, { feeTo: STRANGER });
    const r = await call(s, 'POST', '/v1/sweep', body);
    expect(r.status).toBe(422);
    expect(errCode(r)).toBe('fee_to_mismatch');
  });

  it('rejects wrong signer and malformed signatures', async () => {
    const s = await start();
    const bad = await prepare(s, { signerKey: OTHER_KEY });
    expect(errCode(await call(s, 'POST', '/v1/sweep', bad.body))).toBe('invalid_signature');
    const { body } = await prepare(s);
    const zeros = { ...body, sweepSig: `0x${'00'.repeat(65)}` };
    expect(errCode(await call(s, 'POST', '/v1/sweep', zeros))).toBe('invalid_signature');
    expect(s.fake.simulations).toBe(0);
  });

  it('rejects quote problems: tampered, malformed, expired, fee below quote, fee above cap', async () => {
    const s = await start();
    const { body, quote } = await prepare(s);
    const flip = quote.quoteToken.slice(0, -1) + (quote.quoteToken.endsWith('0') ? '1' : '0');
    const t = await call(s, 'POST', '/v1/sweep', { ...body, quoteToken: flip });
    expect(t.status).toBe(400);
    expect(errCode(t)).toBe('invalid_quote');
    const sw = body['sweep'] as Record<string, unknown>;
    expect(errCode(await call(s, 'POST', '/v1/sweep', { ...body, sweep: { ...sw, amount: '100000001' } }))).toBe('invalid_quote');
    expect(errCode(await call(s, 'POST', '/v1/sweep', { ...body, quoteToken: 'garbage' }))).toBe('invalid_quoteToken');
    // a token from a lower fee forged by editing the embedded fee field is also rejected
    const forged = quote.quoteToken.replace(/^v1\.(\d+)\.\d+\./, 'v1.$1.1.');
    expect(errCode(await call(s, 'POST', '/v1/sweep', { ...body, quoteToken: forged }))).toBe('invalid_quote');

    const low = await prepare(s, { fee: BigInt(quote.fee) - 1n, nonce: 2n });
    expect(errCode(await call(s, 'POST', '/v1/sweep', low.body))).toBe('fee_below_quote');
    const high = await prepare(s, { fee: 3_000_001n, nonce: 3n });
    expect(errCode(await call(s, 'POST', '/v1/sweep', high.body))).toBe('fee_above_cap');

    s.clock.ms += 121_000;
    const exp = await call(s, 'POST', '/v1/sweep', body);
    expect(exp.status).toBe(410);
    expect(errCode(exp)).toBe('quote_expired');
  });

  it('enforces the deadline window', async () => {
    const s = await start();
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { deadlineOffset: 10 })).body))).toBe('deadline_too_soon');
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { deadlineOffset: 1801 })).body))).toBe('deadline_too_far');
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { deadlineOffset: 1800 })).body)).status).toBe(200);
  });

  it('rejects orders the contract would reject before any chain call', async () => {
    const s = await start();
    const quote = await s.relayer.service.quote({ chainId: CHAIN_ID, token: USDC, owner: SWEEP_CONTRACT, destination: DEST, amount: 100_000_000n });
    const body = {
      chainId: CHAIN_ID,
      sweep: { token: USDC, owner: SWEEP_CONTRACT, destination: DEST, feeTo: FEE_TO, amount: '100000000', fee: quote.fee, deadline: String(NOW_SEC + 600), nonce: '1' },
      sweepSig: `0x${'11'.repeat(65)}`,
      quoteToken: quote.quoteToken,
    };
    expect(errCode(await call(s, 'POST', '/v1/sweep', body))).toBe('invalid_order');
  });

  it.each([
    ['unknown top-level key', (b: Record<string, unknown>) => ({ ...b, extra: 1 })],
    ['unknown sweep key', (b: Record<string, unknown>) => ({ ...b, sweep: { ...(b['sweep'] as object), extra: 1 } })],
    ['missing sweepSig', (b: Record<string, unknown>) => ({ ...b, sweepSig: undefined })],
    ['short sweepSig', (b: Record<string, unknown>) => ({ ...b, sweepSig: '0x1234' })],
    ['non-hex sweepSig', (b: Record<string, unknown>) => ({ ...b, sweepSig: `0x${'zz'.repeat(65)}` })],
    ['sweep not object', (b: Record<string, unknown>) => ({ ...b, sweep: 'x' })],
    ['fee negative', (b: Record<string, unknown>) => ({ ...b, sweep: { ...(b['sweep'] as object), fee: '-1' } })],
    ['nonce > uint256', (b: Record<string, unknown>) => ({ ...b, sweep: { ...(b['sweep'] as object), nonce: (2n ** 256n).toString() } })],
    ['deadline zero', (b: Record<string, unknown>) => ({ ...b, sweep: { ...(b['sweep'] as object), deadline: '0' } })],
    ['permit unknown key', (b: Record<string, unknown>) => ({ ...b, permit: { value: '1', deadline: '1', v: 27, r: `0x${'aa'.repeat(32)}`, s: `0x${'bb'.repeat(32)}`, x: 1 } })],
    ['permit v invalid', (b: Record<string, unknown>) => ({ ...b, permit: { value: '1', deadline: '1', v: 1, r: `0x${'aa'.repeat(32)}`, s: `0x${'bb'.repeat(32)}` } })],
    ['permit r short', (b: Record<string, unknown>) => ({ ...b, permit: { value: '1', deadline: '1', v: 27, r: '0xaa', s: `0x${'bb'.repeat(32)}` } })],
    ['permit not object', (b: Record<string, unknown>) => ({ ...b, permit: 5 })],
  ])('rejects %s with 400', async (_n, mutate) => {
    const s = await start();
    const { body } = await prepare(s);
    const r = await call(s, 'POST', '/v1/sweep', mutate(body));
    expect(r.status).toBe(400);
    expect(errCode(r)).toMatch(/^invalid_/);
    expect(s.fake.simulations).toBe(0);
  });
});

describe('simulation, replay and operational limits', () => {
  it('maps a nonce replay to 409 (simulation revert, nothing sent twice)', async () => {
    const s = await start();
    const { body } = await prepare(s);
    expect((await call(s, 'POST', '/v1/sweep', body)).status).toBe(200);
    await settle();
    const again = await call(s, 'POST', '/v1/sweep', body);
    expect(again.status).toBe(409);
    expect(errCode(again)).toBe('nonce_used');
    expect(s.fake.sent).toHaveLength(1);
  });

  it('reports a generic simulation revert as 422 with a class only', async () => {
    const s = await start();
    const { SimulationRevert } = await import('./errors.js');
    s.fake.simulateError = new SimulationRevert();
    const r = await call(s, 'POST', '/v1/sweep', (await prepare(s)).body);
    expect(r.status).toBe(422);
    expect(errCode(r)).toBe('simulation_reverted');
    s.fake.simulateError = new SimulationRevert('Expired');
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 2n })).body))).toBe('expired');
  });

  it('rejects a gas limit above the configured maximum', async () => {
    const s = await start();
    s.fake.gasLimit = 400_001n;
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s)).body))).toBe('gas_limit_too_high');
    expect(s.fake.sent).toHaveLength(0);
  });

  it('enforces the gas price cap at sweep time', async () => {
    const s = await start();
    const { body } = await prepare(s);
    s.fake.gasPrice = 60_000_000_000n;
    const r = await call(s, 'POST', '/v1/sweep', body);
    expect(r.status).toBe(503);
    expect(errCode(r)).toBe('gas_price_too_high');
  });

  it('stops when the daily budget is exhausted and recovers next UTC day', async () => {
    const s = await start({ config: chainOver({ dailyBudgetWei: 150_000n * 1_000_000_000n }) });
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s)).body)).status).toBe(200);
    await settle();
    const second = await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 2n })).body);
    expect(second.status).toBe(503);
    expect(errCode(second)).toBe('budget_exhausted');
    expect(Number(second.headers.get('retry-after'))).toBeGreaterThan(0);
    s.clock.ms += 86_400_000;
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 3n })).body)).status).toBe(200);
  });

  it('returns 503 and re-syncs the nonce when the send fails', async () => {
    const s = await start();
    s.fake.sendFails = true;
    const r = await call(s, 'POST', '/v1/sweep', (await prepare(s)).body);
    expect(errCode(r)).toBe('send_failed');
    s.fake.sendFails = false;
    s.fake.pendingNonce = 42;
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s)).body)).status).toBe(200);
    expect(s.fake.sent[0]?.opts.nonce).toBe(42);
  });

  it('counts reverted and timed-out receipts', async () => {
    const s = await start();
    s.fake.receipt = { status: 'timeout', gasUsed: 0n };
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s)).body)).status).toBe(200);
    await settle();
    s.fake.receipt = { status: 'reverted', gasUsed: 90_000n };
    s.fake.pendingNonce = 9;
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 2n })).body)).status).toBe(200);
    await settle();
    expect(s.fake.sent[1]?.opts.nonce).toBe(9); // re-synced after the timeout
    expect(s.logs.join('\n')).toContain('sweep_reverted');
    expect(s.logs.join('\n')).toContain('receipt_timeout');
  });
});

describe('circuit breaker', () => {
  it('opens on a high error rate, reports degraded health and half-open recovers', async () => {
    const s = await start();
    s.fake.simulateError = new Error('rpc exploded');
    for (let i = 0; i < 3; i++) {
      const r = await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: BigInt(i + 1) })).body);
      expect(errCode(r)).toBe('rpc_unavailable');
    }
    const open = await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 10n })).body);
    expect(open.status).toBe(503);
    expect(errCode(open)).toBe('breaker_open');
    const health = await call(s, 'GET', '/healthz');
    expect(health.status).toBe(503);
    expect((health.json as { status: string }).status).toBe('degraded');

    s.clock.ms += 61_000;
    s.fake.simulateError = undefined;
    const probe = await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 11n })).body);
    expect(probe.status).toBe(200);
    expect((await call(s, 'GET', '/healthz')).status).toBe(200);
  });

  it('re-opens when the half-open probe fails', async () => {
    const s = await start();
    s.fake.simulateError = new Error('down');
    for (let i = 0; i < 3; i++) await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: BigInt(i + 1) })).body);
    s.clock.ms += 61_000;
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 9n })).body))).toBe('rpc_unavailable');
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 10n })).body))).toBe('breaker_open');
  });

  it('opens on a low relayer balance', async () => {
    const s = await start();
    s.fake.balance = 0n;
    const r = await call(s, 'POST', '/v1/sweep', (await prepare(s)).body);
    expect(r.status).toBe(503);
    expect(errCode(r)).toBe('breaker_open');
    expect(s.fake.simulations).toBe(1); // only the out-of-lane pre-simulation ran
    // while open, requests are refused before they even reach the lane
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 2n })).body))).toBe('breaker_open');
    expect(s.logs.join('\n')).toContain('breaker_tripped_low_balance');
  });
});

describe('policy gate', () => {
  it('runs before sending and can deny', async () => {
    const seen: unknown[] = [];
    const s = await start({
      policy: {
        check: (ctx) => {
          seen.push(ctx);
          return Promise.resolve(ctx.amount > 0n ? { allow: false, reasonClass: 'sanctioned' } : { allow: true });
        },
      },
    });
    const r = await call(s, 'POST', '/v1/sweep', (await prepare(s)).body);
    expect(r.status).toBe(403);
    expect(errCode(r)).toBe('policy_denied');
    expect(s.fake.simulations).toBe(0);
    expect(s.fake.sent).toHaveLength(0);
    expect(seen).toEqual([{ chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: 100_000_000n }]);
  });

  it('fails closed when the gate throws', async () => {
    const s = await start({ policy: { check: () => Promise.reject(new Error('screening down')) } });
    const r = await call(s, 'POST', '/v1/sweep', (await prepare(s)).body);
    expect(r.status).toBe(503);
    expect(errCode(r)).toBe('policy_unavailable');
  });
});

describe('rate limiting', () => {
  it('limits per IP bucket with Retry-After', async () => {
    const s = await start({ config: { rateLimit: { ipPerMinute: 1, ipBurst: 2, ownerPerMinute: 60, ownerBurst: 20, maxKeys: 100, saltRotationHours: 24 } } });
    const q = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };
    expect((await call(s, 'POST', '/v1/quote', q)).status).toBe(200);
    expect((await call(s, 'POST', '/v1/quote', q)).status).toBe(200);
    const third = await call(s, 'POST', '/v1/quote', q);
    expect(third.status).toBe(429);
    expect(errCode(third)).toBe('rate_limited_ip');
    expect(Number(third.headers.get('retry-after'))).toBeGreaterThanOrEqual(1);
    expect((await call(s, 'GET', '/healthz')).status).toBe(200); // GETs are not limited
    s.clock.ms += 61_000; // refill
    expect((await call(s, 'POST', '/v1/quote', q)).status).toBe(200);
  });

  it('limits per owner only after the signature is proven', async () => {
    const s = await start({ config: { rateLimit: { ipPerMinute: 600, ipBurst: 100, ownerPerMinute: 1, ownerBurst: 1, maxKeys: 100, saltRotationHours: 24 } } });
    // forged requests for the victim owner do not consume the victim's quota
    for (let i = 0; i < 3; i++) {
      const forged = await prepare(s, { signerKey: OTHER_KEY, nonce: BigInt(i + 100) });
      expect(errCode(await call(s, 'POST', '/v1/sweep', forged.body))).toBe('invalid_signature');
    }
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 1n })).body)).status).toBe(200);
    const limited = await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 2n })).body);
    expect(limited.status).toBe(429);
    expect(errCode(limited)).toBe('rate_limited_owner');
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });

  it('honours X-Forwarded-For only with trustProxyHops', async () => {
    const lim = { ipPerMinute: 1, ipBurst: 1, ownerPerMinute: 60, ownerBurst: 20, maxKeys: 100, saltRotationHours: 24 };
    const q = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };
    const s = await start({ config: { rateLimit: lim, trustProxyHops: 1 } });
    expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '9.9.9.9, 1.1.1.1' })).status).toBe(200);
    expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '8.8.8.8, 1.1.1.1' })).status).toBe(429);
    expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '8.8.8.8, 2.2.2.2' })).status).toBe(200);
    // no header / too few hops falls back to the socket address
    expect((await call(s, 'POST', '/v1/quote', q)).status).toBe(200);
    expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '' })).status).toBe(429);
    await s.stop();
    const t = await start({ config: { rateLimit: lim, trustProxyHops: 0 } });
    expect((await call(t, 'POST', '/v1/quote', q, { 'x-forwarded-for': '3.3.3.3' })).status).toBe(200);
    expect((await call(t, 'POST', '/v1/quote', q, { 'x-forwarded-for': '4.4.4.4' })).status).toBe(429);
  });
});

describe('serialization, queue and shutdown', () => {
  it('serializes concurrent submissions: one in flight, sequential nonces', async () => {
    const s = await start();
    let release: () => void = () => undefined;
    s.fake.receiptGate = new Promise<void>((r) => {
      release = r;
    });
    const bodies = await Promise.all([1n, 2n, 3n].map(async (n) => (await prepare(s, { nonce: n })).body));
    const replies = Promise.all(bodies.map((b) => call(s, 'POST', '/v1/sweep', b)));
    await settle();
    await settle();
    expect(s.fake.sent).toHaveLength(1); // the others wait for the first receipt
    release();
    const rs = await replies;
    expect(rs.map((r) => r.status)).toEqual([200, 200, 200]);
    expect(s.fake.maxInFlight).toBe(1);
    expect(s.fake.sent.map((x) => x.opts.nonce)).toEqual([7, 8, 9]);
  });

  it('rejects with 503 when the bounded queue is full', async () => {
    const s = await start({ config: { queue: { maxPending: 2, receiptTimeoutSeconds: 30 } } });
    let release: () => void = () => undefined;
    s.fake.receiptGate = new Promise<void>((r) => {
      release = r;
    });
    const bodies = await Promise.all([1n, 2n, 3n].map(async (n) => (await prepare(s, { nonce: n })).body));
    const first = call(s, 'POST', '/v1/sweep', bodies[0]);
    const second = call(s, 'POST', '/v1/sweep', bodies[1]);
    await settle();
    const third = await call(s, 'POST', '/v1/sweep', bodies[2]);
    expect(third.status).toBe(503);
    expect(errCode(third)).toBe('queue_full');
    release();
    expect((await first).status).toBe(200);
    expect((await second).status).toBe(200);
  });

  it('drains in-flight work on shutdown and refuses new work', async () => {
    const s = await start();
    let release: () => void = () => undefined;
    s.fake.receiptGate = new Promise<void>((r) => {
      release = r;
    });
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s)).body)).status).toBe(200);
    const closing = s.relayer.server.close();
    expect(s.relayer.service.health().status).toBe('shutting_down');
    const { body } = await prepare(s, { nonce: 2n });
    const { parseSweepRequest } = await import('./validate.js');
    await expect(s.relayer.service.sweep(parseSweepRequest(body), { requestId: 'abcdef12' })).rejects.toMatchObject({ status: 503, code: 'shutting_down' });
    let done = false;
    void closing.then(() => {
      done = true;
    });
    await settle();
    expect(done).toBe(false); // still waiting for the in-flight transaction
    release();
    await closing;
    expect(done).toBe(true);
    await expect(fetch(`${s.url}/healthz`)).rejects.toThrow();
  });

  it('answers 503 to requests already in flight when shutdown starts', async () => {
    const s = await start();
    const u = new URL(s.url);
    const sock = connect(Number(u.port), u.hostname);
    await new Promise<void>((r) => sock.once('connect', r));
    sock.write('GET /healthz HTTP/1.1\r\nHost: x\r\n');
    await settle();
    const closing = s.relayer.server.close();
    const reply = new Promise<string>((resolve) => {
      let data = '';
      sock.on('data', (d: Buffer) => {
        data += d.toString();
      });
      sock.on('close', () => {
        resolve(data);
      });
    });
    sock.write('\r\n');
    const text = await reply;
    expect(text).toContain('503');
    expect(text).toContain('shutting_down');
    await closing;
  });

  it('force-closes after the grace period if a transaction never settles', async () => {
    const s = await start({ config: { shutdownGraceSeconds: 1 } });
    let release: () => void = () => undefined;
    s.fake.receiptGate = new Promise<void>((r) => {
      release = r;
    });
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s)).body)).status).toBe(200);
    const t0 = Date.now();
    await s.relayer.server.close();
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
    release();
  });
});

describe('logging redaction', () => {
  it('never logs destination, owner, signatures, quote tokens or request bodies', async () => {
    const s = await start();
    const ok = await prepare(s);
    await call(s, 'POST', '/v1/sweep', ok.body);
    await call(s, 'POST', '/v1/sweep', ok.body); // replay
    await call(s, 'POST', '/v1/sweep', (await prepare(s, { signerKey: OTHER_KEY, nonce: 5n })).body);
    await call(s, 'POST', '/v1/quote', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' });
    await call(s, 'POST', '/v1/quote', '{bad json with ' + DEST);
    await settle();
    const all = s.logs.join('\n');
    expect(all.length).toBeGreaterThan(0);
    const secrets = [DEST, OWNER, FEE_TO, NOPERMIT, ok.body['sweepSig'] as string, ok.quote.quoteToken, 'bad json'];
    for (const x of secrets) {
      expect(all.toLowerCase()).not.toContain(x.toLowerCase());
      expect(all).not.toContain(x.slice(2, 12));
    }
    expect(all).not.toMatch(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/); // no address-shaped value anywhere
    expect(all).not.toMatch(/127\.0\.0\.1|::1/);
    const allowed = new Set(['ts', 'level', 'event', 'requestId', 'route', 'status', 'chainId', 'txHash', 'errorClass']);
    for (const line of s.logs) {
      for (const k of Object.keys(JSON.parse(line) as object)) expect(allowed.has(k)).toBe(true);
    }
    expect(all).toContain('sweep_sent');
  });
});

describe('N-01 / N-02 / N-03 regressions', () => {
  it('N-01: junk sweeps are rejected before they can occupy a lane slot', async () => {
    const s = await start({ config: { queue: { maxPending: 2, receiptTimeoutSeconds: 30 } } });
    s.fake.simulateError = new SimulationRevert('SafeERC20FailedOperation');
    const bodies = await Promise.all([1n, 2n, 3n, 4n, 5n].map(async (n) => (await prepare(s, { nonce: n })).body));
    const rs = await Promise.all(bodies.map((b) => call(s, 'POST', '/v1/sweep', b)));
    expect(rs.map((r) => r.status)).toEqual([422, 422, 422, 422, 422]);
    expect(s.relayer.service.health().status).toBe('ok');
    s.fake.simulateError = undefined;
    // lane never filled: a legitimate sweep goes through
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 9n })).body)).status).toBe(200);
  });

  it('N-01: bounded concurrent pre-simulations answer 503 busy', async () => {
    const s = await start({ config: { queue: { maxPending: 64, receiptTimeoutSeconds: 30 } } });
    const orig = s.fake.simulateSweep.bind(s.fake);
    let open: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      open = r;
    });
    s.fake.simulateSweep = async (c) => {
      await gate;
      return orig(c);
    };
    const bodies = await Promise.all(Array.from({ length: 14 }, async (_, i) => (await prepare(s, { nonce: BigInt(i + 1) })).body));
    const rs = Promise.all(bodies.map((b) => call(s, 'POST', '/v1/sweep', b)));
    for (let i = 0; i < 100 && s.fake.simulations < 8; i++) await settle();
    await settle();
    open();
    const codes = (await rs).map((r) => r.status);
    expect(codes.filter((c) => c === 503).length).toBeGreaterThanOrEqual(2);
  });

  it('N-01: per-client cap on lane slots', async () => {
    const s = await start({ config: { queue: { maxPending: 4, receiptTimeoutSeconds: 30 } } });
    let release: () => void = () => undefined;
    s.fake.receiptGate = new Promise<void>((r) => {
      release = r;
    });
    const bodies = await Promise.all([1n, 2n, 3n, 4n, 5n].map(async (n) => (await prepare(s, { nonce: n })).body));
    const rs = bodies.slice(0, 4).map((b) => call(s, 'POST', '/v1/sweep', b));
    for (let i = 0; i < 100 && s.fake.simulations < 5; i++) await settle();
    await settle();
    await settle();
    const fourth = await call(s, 'POST', '/v1/sweep', bodies[4]);
    expect(fourth.status).toBe(429);
    release();
    expect((await Promise.all(rs)).map((r) => r.status)).toEqual([200, 200, 200, 200]);
  });

  it('N-01: pre-simulation RPC failure is 503 rpc_unavailable', async () => {
    const s = await start();
    s.fake.simulateError = new Error('down');
    const r = await call(s, 'POST', '/v1/sweep', (await prepare(s)).body);
    expect([r.status, errCode(r)]).toEqual([503, 'rpc_unavailable']);
  });

  it('N-02: refuses when the gas price rose so the quoted fee no longer covers cost', async () => {
    const s = await start();
    const { body } = await prepare(s);
    s.fake.gasPrice = 40_000_000_000n; // quote was priced at 1 gwei
    const r = await call(s, 'POST', '/v1/sweep', body);
    expect([r.status, errCode(r)]).toEqual([422, 'fee_below_cost']);
    expect(s.fake.sent).toHaveLength(0);
  });

  it('N-03: malformed request targets answer 400, not 500', async () => {
    const s = await start();
    for (const target of ['//', 'http://[']) {
      const status = await new Promise<number>((resolve, reject) => {
        const sock = connect(Number(new URL(s.url).port), '127.0.0.1', () => sock.write(`GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`));
        let buf = '';
        sock.on('data', (d: Buffer) => (buf += d.toString()));
        sock.on('end', () => resolve(Number(/HTTP\/1.1 (\d+)/.exec(buf)?.[1])));
        sock.on('error', reject);
      });
      expect(status).toBe(400);
    }
    expect(s.logs.some((l) => l.includes('internal_error'))).toBe(false);
  });
});
