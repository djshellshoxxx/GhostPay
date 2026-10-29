import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHAIN_ID,
  DEST,
  FEE_TO,
  NOPERMIT,
  NOW_SEC,
  ORIGIN,
  OTHER_KEY,
  OWNER,
  STRANGER,
  SWEEP_CONTRACT,
  USDC,
  call,
  errCode,
  prepare,
  startHarness,
  testConfig,
  type Harness,
} from './harness.testutil.js';
import type { ReceiptSummary } from './chain.js';
import type { QuoteResponse } from './service.js';
import { SimulationRevert } from './errors.js';

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
    expect(r.json).toEqual({ status: 'ok', chains: [{ chainId: CHAIN_ID, breaker: 'closed', minedReverts: 'normal' }] });
    for (const k of [
      'x-content-type-options',
      'cache-control',
      'content-security-policy',
      'referrer-policy',
      'x-frame-options',
      'strict-transport-security',
    ]) {
      expect(r.headers.get(k)).toBeTruthy();
    }
    const info = await call(s, 'GET', '/v1/info');
    const j = info.json as {
      feePolicy: { capBps: number; minBps: number };
      chains: { feeTo: string; sweepRelayer: string; tokens: unknown[] }[];
    };
    expect(j.feePolicy.capBps).toBe(300);
    expect(j.feePolicy.minBps).toBe(50);
    expect(j.chains[0]?.feeTo).toBe(FEE_TO);
    expect(j.chains[0]?.sweepRelayer).toBe(SWEEP_CONTRACT);
    expect(j.chains[0]?.tokens).toHaveLength(2);
  });

  it('rejects unexpected query parameters without processing the request', async () => {
    const s = await start();
    const health = await call(s, 'GET', '/healthz?token=should-not-be-here');
    expect(health.status).toBe(400);
    expect(errCode(health)).toBe('unexpected_query');
    const quote = await call(s, 'POST', '/v1/quote?secret=leak', {});
    expect(quote.status).toBe(400);
    expect(errCode(quote)).toBe('unexpected_query');
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
    const pre = await call(s, 'OPTIONS', '/v1/sweep', undefined, {
      origin: ORIGIN,
      'access-control-request-method': 'POST',
    });
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
    const r = await call(s, 'POST', '/v1/quote', {
      chainId: CHAIN_ID,
      token: USDC,
      owner: OWNER,
      destination: DEST,
      amount: '1000',
    });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.json)).not.toContain('boom');
  });
});

describe('request framing', () => {
  const q = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };

  it('requires JSON content type', async () => {
    const s = await start();
    expect(
      errCode(await call(s, 'POST', '/v1/quote', JSON.stringify(q), { 'content-type': 'text/plain' })),
    ).toBe('unsupported_media_type');
    const none = await fetch(`${s.url}/v1/quote`, {
      method: 'POST',
      body: JSON.stringify(q),
      headers: { 'content-type': '' },
    });
    expect(none.status).toBe(415);
    const withCharset = await call(s, 'POST', '/v1/quote', JSON.stringify(q), {
      'content-type': 'application/json; charset=utf-8',
    });
    expect(withCharset.status).toBe(200);
  });

  it('rejects malformed JSON, empty bodies and invalid UTF-8', async () => {
    const s = await start();
    expect(errCode(await call(s, 'POST', '/v1/quote', '{nope'))).toBe('invalid_json');
    expect(errCode(await call(s, 'POST', '/v1/quote', ''))).toBe('invalid_json');
    const bin = await fetch(`${s.url}/v1/quote`, {
      method: 'POST',
      body: new Uint8Array([0x7b, 0xff, 0x7d]),
      headers: { 'content-type': 'application/json' },
    });
    expect(bin.status).toBe(400);
  });

  it('rejects oversize bodies (declared and chunked)', async () => {
    const s = await start();
    const big = JSON.stringify({ pad: 'x'.repeat(17 * 1024) });
    const r = await call(s, 'POST', '/v1/quote', big);
    expect(r.status).toBe(413);
    expect(errCode(r)).toBe('body_too_large');
    const exact = await call(
      s,
      'POST',
      '/v1/quote',
      JSON.stringify({ ...q, pad: 'x'.repeat(16 * 1024 - 400) }),
    );
    expect(exact.status).toBe(400); // within cap -> reaches validation (unknown key)

    // chunked body without Content-Length that grows past the cap
    const status = await new Promise<number>((resolve, reject) => {
      const u = new URL(s.url);
      const req = httpRequest(
        {
          host: u.hostname,
          port: u.port,
          path: '/v1/quote',
          method: 'POST',
          headers: { 'content-type': 'application/json' },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
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
      const req = httpRequest(
        {
          host: u.hostname,
          port: u.port,
          path: '/v1/sweep',
          method: 'POST',
          headers: { 'content-type': 'application/json', 'content-length': '20000' },
        },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
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
    sock.write(
      'POST /v1/quote HTTP/1.1\r\nHost: x\r\nContent-Type: application/json\r\nContent-Length: 50\r\n\r\n{"a"',
    );
    await settle();
    sock.destroy();
    await settle();
    expect((await call(s, 'GET', '/healthz')).status).toBe(200);
  });
});

describe('POST /v1/quote', () => {
  it('prices a permit token by the gas term when it dominates', async () => {
    const s = await start();
    const r = await call(s, 'POST', '/v1/quote', {
      chainId: CHAIN_ID,
      token: USDC,
      owner: OWNER,
      destination: DEST,
      amount: '20000000',
    });
    expect(r.status).toBe(200);
    const j = r.json as QuoteResponse;
    // 130000 gas * 1 gwei * 3000 USD/ETH = 390000 token units; x1.10 = 429000
    expect(j.fee).toBe('429000');
    expect(j.feeTo).toBe(FEE_TO);
    expect(j.expiresAt).toBe(NOW_SEC + 120);
    expect(j.quoteToken).toMatch(/^v2\.[0-9a-f]{8}\.\d+\.429000\.[0-9a-f]{64}$/);
  });

  it('uses the 50 bps floor and the cheaper non-permit estimate', async () => {
    const s = await start();
    const a = await call(s, 'POST', '/v1/quote', {
      chainId: CHAIN_ID,
      token: USDC,
      owner: OWNER,
      destination: DEST,
      amount: '100000000',
    });
    expect((a.json as QuoteResponse).fee).toBe('500000');
    const b = await call(s, 'POST', '/v1/quote', {
      chainId: CHAIN_ID,
      token: NOPERMIT,
      owner: OWNER,
      destination: DEST,
      amount: '20000000',
    });
    expect((b.json as QuoteResponse).fee).toBe('330000');
  });

  it('refuses unsupported chain, token, collisions and uneconomical amounts', async () => {
    const s = await start();
    const base = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };
    expect(errCode(await call(s, 'POST', '/v1/quote', { ...base, chainId: 1 }))).toBe('chain_not_supported');
    expect(errCode(await call(s, 'POST', '/v1/quote', { ...base, token: DEST }))).toBe('token_not_supported');
    expect(errCode(await call(s, 'POST', '/v1/quote', { ...base, destination: OWNER }))).toBe(
      'invalid_order',
    );
    expect(errCode(await call(s, 'POST', '/v1/quote', { ...base, destination: FEE_TO }))).toBe(
      'invalid_order',
    );
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
    [
      'unknown key',
      { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '5', extra: 1 },
    ],
    ['missing key', { chainId: CHAIN_ID, token: USDC, owner: OWNER, amount: '5' }],
    ['chainId string', { chainId: '11155111', token: USDC, owner: OWNER, destination: DEST, amount: '5' }],
    ['chainId float', { chainId: 1.5, token: USDC, owner: OWNER, destination: DEST, amount: '5' }],
    ['chainId zero', { chainId: 0, token: USDC, owner: OWNER, destination: DEST, amount: '5' }],
    ['chainId too big', { chainId: 2 ** 60, token: USDC, owner: OWNER, destination: DEST, amount: '5' }],
    ['short address', { chainId: CHAIN_ID, token: '0x1234', owner: OWNER, destination: DEST, amount: '5' }],
    [
      'bad checksum',
      {
        chainId: CHAIN_ID,
        token: USDC.replace('c7D4', 'C7d4'),
        owner: OWNER,
        destination: DEST,
        amount: '5',
      },
    ],
    [
      'zero address',
      { chainId: CHAIN_ID, token: `0x${'0'.repeat(40)}`, owner: OWNER, destination: DEST, amount: '5' },
    ],
    ['address number', { chainId: CHAIN_ID, token: 5, owner: OWNER, destination: DEST, amount: '5' }],
    ['amount zero', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '0' }],
    [
      'amount leading zero',
      { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '05' },
    ],
    ['amount negative', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '-5' }],
    ['amount exponent', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '1e3' }],
    ['amount number', { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: 5 }],
    [
      'amount > uint256',
      { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: (2n ** 256n).toString() },
    ],
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
    s.fake.allowance = 0n; // the permit is needed: no allowance yet (spec 04 skips the permit when allowance covers)
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
    expect(errCode(await call(s, 'POST', '/v1/sweep', { ...body, sweep: { ...sw, token: DEST } }))).toBe(
      'token_not_supported',
    );
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
    expect(
      errCode(await call(s, 'POST', '/v1/sweep', { ...body, sweep: { ...sw, amount: '100000001' } })),
    ).toBe('invalid_quote');
    expect(errCode(await call(s, 'POST', '/v1/sweep', { ...body, quoteToken: 'garbage' }))).toBe(
      'invalid_quoteToken',
    );
    // a token from a lower fee forged by editing the embedded fee field is also rejected
    const forged = quote.quoteToken.replace(/^(v2\.[0-9a-f]{8}\.\d+)\.\d+\./, '$1.1.');
    expect(errCode(await call(s, 'POST', '/v1/sweep', { ...body, quoteToken: forged }))).toBe(
      'invalid_quote',
    );

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
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { deadlineOffset: 10 })).body))).toBe(
      'deadline_too_soon',
    );
    expect(
      errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { deadlineOffset: 1801 })).body)),
    ).toBe('deadline_too_far');
    expect(
      (await call(s, 'POST', '/v1/sweep', (await prepare(s, { deadlineOffset: 1800 })).body)).status,
    ).toBe(200);
  });

  it('D-R2: re-checks the deadline in the lane, so a queue wait cannot send a sweep about to lapse', async () => {
    // A single breaker failure would open it: the refusal must be neutral (nothing was wrong with the RPC).
    const breaker = { ...testConfig().breaker, minSamples: 1, failureRatio: 0.01 };
    const s = await start({ config: { breaker } });
    let release: () => void = () => undefined;
    s.fake.receiptGate = new Promise<void>((r) => {
      release = r;
    });
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 1n })).body)).status).toBe(200);
    // Admitted with 31 s left (minimum 30), then queued behind the first sweep's receipt for 2 s.
    const queued = call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 2n, deadlineOffset: 31 })).body);
    const inLane = (): boolean =>
      s.relayer.metrics.render().includes('relayer_queue_pending{chain_id="11155111"} 2');
    for (let i = 0; i < 100 && !inLane(); i += 1) await settle();
    expect(inLane()).toBe(true); // admitted before the clock moves
    s.clock.ms += 2_000;
    release();
    const r = await queued;
    expect(r.status).toBe(422);
    expect(errCode(r)).toBe('deadline_too_soon'); // a pre-broadcast class the web client releases its lock on
    expect(s.fake.simulations).toBe(3); // refused in the lane, before its second simulation
    expect(s.fake.sent).toHaveLength(1);
    const health = await call(s, 'GET', '/healthz');
    expect(health.json).toMatchObject({ status: 'ok', chains: [{ breaker: 'closed' }] });
    // Not the owner's doing: no strike, and a sweep with time left still goes through.
    s.fake.receiptGate = undefined;
    expect(s.relayer.metrics.render()).not.toContain('relayer_owner_failures_total');
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 3n })).body)).status).toBe(200);
  });

  it('rejects orders the contract would reject before any chain call', async () => {
    const s = await start();
    const quote = await s.relayer.service.quote({
      chainId: CHAIN_ID,
      token: USDC,
      owner: SWEEP_CONTRACT,
      destination: DEST,
      amount: 100_000_000n,
    });
    const body = {
      chainId: CHAIN_ID,
      sweep: {
        token: USDC,
        owner: SWEEP_CONTRACT,
        destination: DEST,
        feeTo: FEE_TO,
        amount: '100000000',
        fee: quote.fee,
        deadline: String(NOW_SEC + 600),
        nonce: '1',
      },
      sweepSig: `0x${'11'.repeat(65)}`,
      quoteToken: quote.quoteToken,
    };
    expect(errCode(await call(s, 'POST', '/v1/sweep', body))).toBe('invalid_order');
  });

  it.each([
    ['unknown top-level key', (b: Record<string, unknown>) => ({ ...b, extra: 1 })],
    [
      'unknown sweep key',
      (b: Record<string, unknown>) => ({ ...b, sweep: { ...(b['sweep'] as object), extra: 1 } }),
    ],
    ['missing sweepSig', (b: Record<string, unknown>) => ({ ...b, sweepSig: undefined })],
    ['short sweepSig', (b: Record<string, unknown>) => ({ ...b, sweepSig: '0x1234' })],
    ['non-hex sweepSig', (b: Record<string, unknown>) => ({ ...b, sweepSig: `0x${'zz'.repeat(65)}` })],
    ['sweep not object', (b: Record<string, unknown>) => ({ ...b, sweep: 'x' })],
    [
      'fee negative',
      (b: Record<string, unknown>) => ({ ...b, sweep: { ...(b['sweep'] as object), fee: '-1' } }),
    ],
    [
      'nonce > uint256',
      (b: Record<string, unknown>) => ({
        ...b,
        sweep: { ...(b['sweep'] as object), nonce: (2n ** 256n).toString() },
      }),
    ],
    [
      'deadline zero',
      (b: Record<string, unknown>) => ({ ...b, sweep: { ...(b['sweep'] as object), deadline: '0' } }),
    ],
    [
      'permit unknown key',
      (b: Record<string, unknown>) => ({
        ...b,
        permit: {
          value: '1',
          deadline: '1',
          v: 27,
          r: `0x${'aa'.repeat(32)}`,
          s: `0x${'bb'.repeat(32)}`,
          x: 1,
        },
      }),
    ],
    [
      'permit v invalid',
      (b: Record<string, unknown>) => ({
        ...b,
        permit: { value: '1', deadline: '1', v: 1, r: `0x${'aa'.repeat(32)}`, s: `0x${'bb'.repeat(32)}` },
      }),
    ],
    [
      'permit r short',
      (b: Record<string, unknown>) => ({
        ...b,
        permit: { value: '1', deadline: '1', v: 27, r: '0xaa', s: `0x${'bb'.repeat(32)}` },
      }),
    ],
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

describe('permit griefing fallback ladder (spec 04)', () => {
  it('already_allowed: drops the permit and sweeps through the allowance path (front-run permit tolerated)', async () => {
    const s = await start();
    s.fake.allowance = 100_000_000n; // e.g. a front-runner already submitted the owner's permit
    const simulated: (boolean)[] = [];
    const orig = s.fake.simulateSweep.bind(s.fake);
    s.fake.simulateSweep = (c) => { simulated.push(c.permit !== undefined); return orig(c); };
    const { body } = await prepare(s, { permit: true });
    expect((await call(s, 'POST', '/v1/sweep', body)).status).toBe(200);
    expect(s.fake.sent[0]?.call.permit).toBeUndefined();
    expect(simulated).toEqual([false, false]);
  });

  it('expired permit with no allowance is refused before any simulation', async () => {
    const s = await start();
    s.fake.allowance = 0n;
    const { body } = await prepare(s, { permit: true });
    (body['permit'] as Record<string, string>)['deadline'] = String(NOW_SEC);
    const r = await call(s, 'POST', '/v1/sweep', body);
    expect(r.status).toBe(422);
    expect(errCode(r)).toBe('permit_expired');
    expect(s.fake.simulations).toBe(0);
    expect(s.fake.sent).toHaveLength(0);
  });

  it('L5-01: a permit that lapses before the sweep deadline is refused before any simulation', async () => {
    // The permit is outside the sweep signature and the quote MAC and the contract swallows a failed permit, so one
    // that expires before inclusion would be a mined revert paid by the relayer.
    const s = await start();
    s.fake.allowance = 0n;
    for (const [n, offset] of [[1n, 1], [2n, 599]] as const) {
      const { body } = await prepare(s, { permit: true, nonce: n }); // sweep deadline: now + 600
      (body['permit'] as Record<string, string>)['deadline'] = String(NOW_SEC + offset);
      const r = await call(s, 'POST', '/v1/sweep', body);
      expect(r.status).toBe(422);
      expect(errCode(r)).toBe('permit_expired');
    }
    expect(s.fake.simulations).toBe(0);
    expect(s.fake.sent).toHaveLength(0);
    // Clients sign permit.deadline == sweep.deadline (apps/web sweep.ts, hops): accepted with no margin; later is fine too.
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { permit: true, nonce: 3n })).body)).status).toBe(200);
    const later = await prepare(s, { permit: true, nonce: 4n });
    (later.body['permit'] as Record<string, string>)['deadline'] = String(NOW_SEC + 3600);
    expect((await call(s, 'POST', '/v1/sweep', later.body)).status).toBe(200);
    // The ladder still drops an unneeded permit, whatever its deadline.
    s.fake.allowance = 10n ** 30n;
    const covered = await prepare(s, { permit: true, nonce: 5n });
    (covered.body['permit'] as Record<string, string>)['deadline'] = String(NOW_SEC + 1);
    expect((await call(s, 'POST', '/v1/sweep', covered.body)).status).toBe(200);
    expect(s.fake.sent.map((x) => x.call.permit === undefined)).toEqual([false, false, true]);
  });

  it('a permit the token rejects (generic allowance revert) is reported as permit_failed, nothing sent', async () => {
    const s = await start();
    s.fake.allowance = 0n;
    s.fake.simulateError = new SimulationRevert();
    const r = await call(s, 'POST', '/v1/sweep', (await prepare(s, { permit: true })).body);
    expect(r.status).toBe(422);
    expect(errCode(r)).toBe('permit_failed');
    expect(s.fake.sent).toHaveLength(0);
    // A specific contract error keeps its own class.
    s.fake.simulateError = new SimulationRevert('Expired');
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { permit: true, nonce: 2n })).body))).toBe('expired');
  });

  it('per-owner failure counter: 3 costly failures per hour, then rejected before any chain work', async () => {
    const s = await start();
    s.fake.allowance = 0n;
    s.fake.simulateError = new SimulationRevert();
    for (const n of [1n, 2n, 3n]) {
      expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { permit: true, nonce: n })).body))).toBe('permit_failed');
    }
    const sims = s.fake.simulations;
    s.fake.simulateError = undefined;
    const blocked = await call(s, 'POST', '/v1/sweep', (await prepare(s, { permit: true, nonce: 4n })).body);
    expect(blocked.status).toBe(429);
    expect(errCode(blocked)).toBe('owner_failure_limit');
    expect(blocked.headers.get('retry-after')).toBeTruthy();
    expect(s.fake.simulations).toBe(sims);
    s.clock.ms += 3600 * 1000;
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { permit: true, nonce: 5n })).body)).status).toBe(200);
  });

  it('a mined revert counts against the owner as well', async () => {
    const s = await start();
    s.fake.receipt = { status: 'reverted', gasUsed: 100_000n };
    for (const n of [1n, 2n, 3n]) {
      expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: n })).body)).status).toBe(200);
      await settle();
    }
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 4n })).body))).toBe('owner_failure_limit');
  });

  it('grief reserve: gas.griefReserveBps raises the gas term of the quoted fee', async () => {
    const q = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '20000000' };
    const s = await start({ config: { gas: { coverPercent: 100, maxMovePercent: 25, quoteCacheSeconds: 3, griefReserveBps: 1000 } } });
    // 130000 gas * 1 gwei * 3000 USD/ETH = 390000; +10 % grief reserve = 429000; x1.10 = 471900
    expect(((await call(s, 'POST', '/v1/quote', q)).json as QuoteResponse).fee).toBe('471900');
  });
});

describe('simulation, replay and operational limits', () => {
  it('checks nonce, token balance and allowance before simulating', async () => {
    const lowBalance = await start();
    lowBalance.fake.ownerBalance = 0n;
    const balance = await call(
      lowBalance,
      'POST',
      '/v1/sweep',
      (await prepare(lowBalance, { permit: false })).body,
    );
    expect(errCode(balance)).toBe('insufficient_token_balance');
    expect(lowBalance.fake.simulations).toBe(0);
    await lowBalance.stop();
    h = undefined;

    const lowAllowance = await start();
    lowAllowance.fake.allowance = 0n;
    const allowance = await call(
      lowAllowance,
      'POST',
      '/v1/sweep',
      (await prepare(lowAllowance, { permit: false })).body,
    );
    expect(errCode(allowance)).toBe('insufficient_allowance');
    expect(lowAllowance.fake.simulations).toBe(0);
  });

  it('simulates twice and rejects gas price movement before sending', async () => {
    const s = await start();
    const { body } = await prepare(s);
    let calls = 0;
    s.fake.getGasPrice = () => Promise.resolve(calls++ === 0 ? 1_000_000_000n : 2_000_000_000n);
    const moved = await call(s, 'POST', '/v1/sweep', body);
    expect(errCode(moved)).toBe('gas_price_moved');
    expect(s.fake.simulations).toBe(1);
    expect(s.fake.sent).toHaveLength(0);
  });

  it('checks actual estimated gas cost against the sweep fee', async () => {
    const s = await start();
    const { body } = await prepare(s);
    s.fake.gasEstimate = 10_000_000n;
    const r = await call(s, 'POST', '/v1/sweep', body);
    expect(errCode(r)).toBe('fee_below_gas_cost');
    expect(s.fake.simulations).toBe(1);
    expect(s.fake.sent).toHaveLength(0);
  });

  it('maps a nonce replay to 409 (simulation revert, nothing sent twice)', async () => {
    const s = await start();
    const { body } = await prepare(s);
    expect((await call(s, 'POST', '/v1/sweep', body)).status).toBe(200);
    expect(s.fake.simulations).toBe(2);
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
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 2n })).body))).toBe(
      'expired',
    );
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

  it('maps a typed failure from the final pre-send simulation without broadcasting', async () => {
    const s = await start();
    s.fake.simulationFailures.set(2, new SimulationRevert('Expired'));
    const r = await call(s, 'POST', '/v1/sweep', (await prepare(s)).body);
    expect(r.status).toBe(422);
    expect(errCode(r)).toBe('expired');
    expect(s.fake.simulations).toBe(2);
    expect(s.fake.sent).toHaveLength(0);
  });

  it('reserves worst-case gas loss before send, releases it on success, and retains it on receipt timeout', async () => {
    const estimate = 150_000n * 1_000_000_000n;
    const cfg = {
      lossBudget: { windowSeconds: 3600, perKeyWei: estimate, globalWei: 10n ** 18n, maxKeys: 100 },
    };
    const success = await start({ config: cfg });
    expect(
      (await call(success, 'POST', '/v1/sweep', (await prepare(success, { nonce: 401n })).body)).status,
    ).toBe(200);
    await settle();
    expect(
      (await call(success, 'POST', '/v1/sweep', (await prepare(success, { nonce: 402n })).body)).status,
    ).toBe(200);
    await settle();

    await h?.stop();
    h = undefined;
    const timeout = await start({ config: cfg });
    timeout.fake.receipt = { status: 'timeout', gasUsed: 0n };
    expect(
      (await call(timeout, 'POST', '/v1/sweep', (await prepare(timeout, { nonce: 403n })).body)).status,
    ).toBe(200);
    await settle();
    const blocked = await call(timeout, 'POST', '/v1/sweep', (await prepare(timeout, { nonce: 404n })).body);
    expect(blocked.status).toBe(429);
    expect(errCode(blocked)).toBe('loss_budget_exhausted');
    expect(timeout.fake.sent).toHaveLength(1);
  });

  it('retains the loss reservation when receipt polling throws', async () => {
    const estimate = 150_000n * 1_000_000_000n;
    const s = await start({
      config: { lossBudget: { windowSeconds: 3600, perKeyWei: estimate, globalWei: 10n ** 18n, maxKeys: 100 } },
    });
    s.fake.receiptError = new Error('provider disconnected');
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 451n })).body)).status).toBe(200);
    await settle();
    const blocked = await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 452n })).body);
    expect(blocked.status).toBe(429);
    expect(errCode(blocked)).toBe('loss_budget_exhausted');
    expect(s.fake.sent).toHaveLength(1);
    expect(s.logs.join('\n')).toContain('receipt_timeout');
  });

  it('rolls back a partial multi-key reservation after a concurrent network-group denial', async () => {
    const estimate = 150_000n * 1_000_000_000n;
    let policyCalls = 0;
    let resolveSecondPolicy: () => void = () => undefined;
    const secondPolicy = new Promise<void>((resolve) => { resolveSecondPolicy = resolve; });
    const s = await start({
      config: {
        trustedProxies: ['127.0.0.1/32'],
        lossBudget: { windowSeconds: 3600, perKeyWei: estimate, globalWei: estimate * 10n, maxKeys: 100 },
      },
      policy: { check: () => {
        policyCalls += 1;
        if (policyCalls === 2) resolveSecondPolicy();
        return Promise.resolve({ allow: true });
      } },
    });
    s.fake.receipt = { status: 'reverted', gasUsed: 150_000n };
    let releaseSimulation: () => void = () => undefined;
    const simulationGate = new Promise<void>((resolve) => { releaseSimulation = resolve; });
    let releaseReceipt: () => void = () => undefined;
    const receiptGate = new Promise<void>((resolve) => { releaseReceipt = resolve; });
    s.fake.simulateGate = simulationGate;
    s.fake.receiptGate = receiptGate;
    const firstBody = (await prepare(s, { nonce: 461n, destination: DEST })).body;
    const secondBody = (await prepare(s, { nonce: 462n, destination: STRANGER })).body;
    const first = call(s, 'POST', '/v1/sweep', firstBody, { 'x-forwarded-for': '198.51.100.10' });
    for (let i = 0; i < 20 && s.fake.simulations === 0; i += 1) await settle();
    expect(s.fake.simulations).toBe(1);
    // Both requests pass the cheap budget probe before the first reservation is made.
    const second = call(s, 'POST', '/v1/sweep', secondBody, { 'x-forwarded-for': '198.51.100.11' });
    await secondPolicy;
    await settle();
    releaseSimulation();
    await settle();
    expect(s.fake.sent).toHaveLength(1);
    releaseReceipt();
    const [firstReply, deniedReply] = await Promise.all([first, second]);
    expect(firstReply.status).toBe(200);
    expect(deniedReply.status).toBe(429);
    expect(errCode(deniedReply)).toBe('loss_budget_exhausted');
    expect(s.fake.sent).toHaveLength(1);

    s.fake.simulateGate = undefined;
    s.fake.receiptGate = undefined;
    // A different network group can now reserve the same destination key, proving the partial
    // destination reservation made before the network-group denial was actually rolled back.
    const retry = await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 463n, destination: STRANGER })).body, {
      'x-forwarded-for': '203.0.113.10',
    });
    expect(retry.status).toBe(200);
    expect(s.fake.sent).toHaveLength(2);
  });

  it('releases loss reservations when transaction submission fails', async () => {
    const estimate = 150_000n * 1_000_000_000n;
    const s = await start({
      config: {
        lossBudget: { windowSeconds: 3600, perKeyWei: estimate, globalWei: 10n ** 18n, maxKeys: 100 },
      },
    });
    s.fake.sendFails = true;
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 405n })).body))).toBe(
      'send_failed',
    );
    s.fake.sendFails = false;
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 406n })).body)).status).toBe(200);
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

describe('loss budget accounting (L5-02, L5-04)', () => {
  const estimate = 150_000n * 1_000_000_000n; // reserved per sweep: gas limit x gas price
  const proxies = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
  const dest = (i: number): `0x${string}` => `0x${(0xd000 + i).toString(16).padStart(40, '0')}`;
  // A distinct owner per sweep, so the per-owner failure counter (3 per hour) stays out of the way.
  const ownerKey = (i: number): `0x${string}` => `0x${(0x100 + i).toString(16).padStart(64, '0')}`;
  const sweepAs = async (s: Harness, nonce: bigint, i: number, ip: string, amount?: bigint): Promise<string> => {
    const body = (await prepare(s, { nonce, destination: dest(i), ownerKey: ownerKey(i), ...(amount === undefined ? {} : { amount }) })).body;
    const r = await call(s, 'POST', '/v1/sweep', body, { 'x-forwarded-for': ip });
    await settle();
    return r.status === 200 ? '200' : errCode(r);
  };

  it('L5-04: stale loss groups are evicted, so newcomers do not all share one overflow group', async () => {
    const lossBudget = { windowSeconds: 3600, perKeyWei: 200_000_000_000_000n, globalWei: 10n ** 17n, maxKeys: 16 };
    const s = await start({ config: { lossBudget, trustedProxies: proxies } });
    // 8 ordinary sweeps (distinct destination and /24): 16 groups seen, all stale two windows later
    for (let i = 0; i < 8; i++) expect(await sweepAs(s, BigInt(i + 1), i, `198.51.${i + 1}.1`)).toBe('200');
    s.clock.ms += 2 * 3_600_000;
    s.fake.receipt = { status: 'reverted', gasUsed: 100_000n };
    expect(await sweepAs(s, 100n, 100, '203.0.113.9')).toBe('200'); // a fresh source's revert is charged to it alone
    s.fake.receipt = { status: 'success', gasUsed: 100_000n };
    expect(await sweepAs(s, 101n, 200, '192.0.2.77')).toBe('200'); // an unrelated newcomer is not refused
    const text = s.relayer.metrics.render();
    expect(text).not.toContain('relayer_loss_budget_overflow_total');
  });

  it('L5-04: a reservation that has to use an overflow entry is counted', async () => {
    // One live slot per table: a sweep's destination and network cannot both have their own entry.
    const lossBudget = { windowSeconds: 3600, perKeyWei: 10n ** 18n, globalWei: 10n ** 18n, maxKeys: 1 };
    const s = await start({ config: { lossBudget, trustedProxies: proxies } });
    expect(await sweepAs(s, 1n, 1, '198.51.1.1')).toBe('200');
    expect(s.relayer.metrics.render()).toContain('relayer_loss_budget_overflow_total{chain_id="11155111"} 1');
  });

  it('L5-04: with production limits, new users are served after a day of earlier traffic', async () => {
    const lossBudget = { windowSeconds: 3600, perKeyWei: 5_000_000_000_000_000n, globalWei: 50_000_000_000_000_000n, maxKeys: 16 };
    const s = await start({ config: { lossBudget, trustedProxies: proxies } });
    s.fake.gasPrice = 20_000_000_000n; // reservation 150k x 20 gwei = 3e15 per sweep
    const amount = 1_000_000_000n; // 1000 USDC: the capped fee covers gas at 20 gwei
    for (let i = 0; i < 8; i++) expect(await sweepAs(s, BigInt(i + 1), i, `198.51.${i + 1}.1`, amount)).toBe('200');
    s.clock.ms += 25 * 3_600_000; // next salt epoch: every earlier entry is stale
    for (let i = 0; i < 3; i++) expect(await sweepAs(s, BigInt(100 + i), 100 + i, `192.0.${i + 2}.77`, amount)).toBe('200');
  });

  it('L5-02: the global loss cap is charged once per sweep, not once per key', async () => {
    const lossBudget = { windowSeconds: 3600, perKeyWei: 10n ** 18n, globalWei: 2n * estimate, maxKeys: 100 };
    const s = await start({ config: { lossBudget, trustedProxies: proxies } });
    s.fake.receipt = { status: 'reverted', gasUsed: 150_000n };
    expect(await sweepAs(s, 1n, 1, '198.51.1.1')).toBe('200');
    expect(await sweepAs(s, 2n, 2, '198.51.2.1')).toBe('200'); // was 429 at half the configured cap
    expect(await sweepAs(s, 3n, 3, '198.51.3.1')).toBe('loss_budget_exhausted');
  });

  it('L5-02: sources that lost money in this window cannot spend the slice kept for clean sources', async () => {
    const lossBudget = { windowSeconds: 3600, perKeyWei: 10n ** 18n, globalWei: 4n * estimate, maxKeys: 100 };
    const s = await start({ config: { lossBudget, trustedProxies: proxies } });
    s.fake.receipt = { status: 'reverted', gasUsed: 150_000n };
    // one network group, a fresh destination each time, every sweep a mined revert
    const outcomes: string[] = [];
    for (let i = 0; i < 6 && outcomes.at(-1) !== 'loss_budget_exhausted'; i++) {
      outcomes.push(await sweepAs(s, BigInt(10 + i), 10 + i, `203.0.113.${i + 1}`));
    }
    expect(outcomes).toEqual(['200', '200', '200', 'loss_budget_exhausted']); // 3/4 of the global cap
    s.fake.receipt = { status: 'success', gasUsed: 100_000n };
    // an unrelated, clean source is still served from the remaining quarter
    expect(await sweepAs(s, 50n, 50, '192.0.2.10')).toBe('200');
    expect(await sweepAs(s, 51n, 51, '192.0.3.10')).toBe('200'); // a success releases its reservation
  });

  it('L5-02: a sustained mined-revert rate alerts and degrades /healthz while the breaker stays closed', async () => {
    const alerts: string[] = [];
    const lossBudget = { windowSeconds: 3600, perKeyWei: 10n ** 18n, globalWei: 10n ** 18n, maxKeys: 100 };
    const s = await start({ config: { lossBudget, trustedProxies: proxies }, alerts: { send: (e) => alerts.push(e.kind) } });
    s.fake.receipt = { status: 'reverted', gasUsed: 150_000n };
    for (let i = 0; i < 2; i++) expect(await sweepAs(s, BigInt(i + 1), i, `198.51.${i + 1}.1`)).toBe('200');
    expect((await call(s, 'GET', '/healthz')).status).toBe(200); // below minSamples (3)
    expect(await sweepAs(s, 3n, 3, '198.51.3.1')).toBe('200');
    expect(alerts).toContain('mined_revert_rate');
    const h = await call(s, 'GET', '/healthz');
    expect(h.status).toBe(503);
    expect(h.json).toEqual({ status: 'degraded', chains: [{ chainId: CHAIN_ID, breaker: 'closed', minedReverts: 'sustained' }] });
    // successes dilute the rate below failureRatio (3 of 7 < 0.5)
    s.fake.receipt = { status: 'success', gasUsed: 100_000n };
    for (let i = 4; i < 8; i++) expect(await sweepAs(s, BigInt(i), i, `198.51.${i}.1`)).toBe('200');
    expect((await call(s, 'GET', '/healthz')).status).toBe(200);
    // and old reverts age out with the loss window
    s.fake.receipt = { status: 'reverted', gasUsed: 150_000n };
    for (let i = 8; i < 12; i++) await sweepAs(s, BigInt(i), i, `198.51.${i}.1`);
    expect((await call(s, 'GET', '/healthz')).status).toBe(503);
    s.clock.ms += 3_600_000;
    expect((await call(s, 'GET', '/healthz')).json).toMatchObject({ status: 'ok', chains: [{ minedReverts: 'normal' }] });
  });
});

describe('receipt timeouts (L5-06)', () => {
  const estimate = 150_000n * 1_000_000_000n; // gas limit x gas price reserved per sweep
  const budgetUsed = (s: Harness): bigint =>
    BigInt(/relayer_daily_budget_used_wei\{[^}]*\} (\d+)/.exec(s.relayer.metrics.render())?.[1] ?? '-1');

  /** One sweep whose receipt wait ends only after the HTTP reply, as in production, with `receipt` or a throwing wait. */
  const sweepWithReceipt = async (s: Harness, nonce: bigint, receipt: ReceiptSummary | Error) => {
    let release: () => void = () => undefined;
    s.fake.receiptGate = new Promise<void>((r) => {
      release = r;
    });
    s.fake.receiptError = receipt instanceof Error ? receipt : undefined;
    if (!(receipt instanceof Error)) s.fake.receipt = receipt;
    const r = await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce })).body);
    release();
    await settle();
    return r.status;
  };
  const breakerOf = async (s: Harness): Promise<string | undefined> =>
    ((await call(s, 'GET', '/healthz')).json as { chains: { breaker: string }[] }).chains[0]?.breaker;

  it.each([0.5, 0.6])('receipt timeouts alone open the breaker at failureRatio %s', async (ratio) => {
    const alerts: string[] = [];
    const breaker = { ...testConfig().breaker, failureRatio: ratio }; // windowSize 10, minSamples 3
    const s = await start({ config: { breaker }, alerts: { send: (e) => alerts.push(e.kind) } });
    const timeout = { status: 'timeout', gasUsed: 0n } as const;
    expect(await sweepWithReceipt(s, 1n, timeout)).toBe(200);
    expect(await sweepWithReceipt(s, 2n, new Error('provider disconnected'))).toBe(200); // a timeout too
    // Nothing is recorded at broadcast: two timeouts are two failures of two outcomes, still below minSamples.
    expect(alerts).toEqual(['receipt_timeout', 'receipt_timeout']);
    expect(await breakerOf(s)).toBe('closed');
    expect(await sweepWithReceipt(s, 3n, timeout)).toBe(200);
    expect(alerts).toEqual(['receipt_timeout', 'receipt_timeout', 'receipt_timeout', 'breaker_open']);
    expect(await breakerOf(s)).toBe('open');
    expect((await call(s, 'GET', '/healthz')).status).toBe(503);
    const refused = await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 4n })).body);
    expect(errCode(refused)).toBe('breaker_open');
    const metrics = s.relayer.metrics.render(); // counted when the receipt wait ends, with the receipt's outcome
    expect(metrics).toContain('relayer_sweeps_total{chain_id="11155111",outcome="failure"} 3');
  });

  it('a half-open probe stays in flight until its receipt; only a mined sweep closes the breaker', async () => {
    const s = await start();
    s.fake.simulateError = new Error('rpc exploded');
    for (const n of [1n, 2n, 3n]) await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: n })).body);
    s.fake.simulateError = undefined;
    expect(await breakerOf(s)).toBe('open');
    s.clock.ms += 61_000;
    // The probe is broadcast and answered while its receipt is pending: still half-open, other sweeps refused.
    let release: () => void = () => undefined;
    s.fake.receiptGate = new Promise<void>((r) => {
      release = r;
    });
    s.fake.receipt = { status: 'timeout', gasUsed: 0n };
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 10n })).body)).status).toBe(200);
    expect(await breakerOf(s)).toBe('half_open');
    const refused = await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 11n })).body);
    expect(errCode(refused)).toBe('breaker_open');
    release();
    await settle();
    expect(await breakerOf(s)).toBe('open'); // its receipt timed out
    s.clock.ms += 61_000;
    // A mined revert is neutral (S3-06): the probe is freed without closing; the next one decides.
    expect(await sweepWithReceipt(s, 12n, { status: 'reverted', gasUsed: 100_000n })).toBe(200);
    expect(await breakerOf(s)).toBe('half_open');
    expect(await sweepWithReceipt(s, 13n, { status: 'success', gasUsed: 100_000n })).toBe(200);
    expect(await breakerOf(s)).toBe('closed');
  });

  it('a probe not confirmed within breaker.probeTimeoutSeconds re-opens the breaker; its late receipt is ignored', async () => {
    const s = await start({ config: { queue: { maxPending: 4, receiptTimeoutSeconds: 120 } } }); // the defaults
    s.fake.simulateError = new Error('rpc exploded');
    for (const n of [1n, 2n, 3n]) await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: n })).body);
    s.fake.simulateError = undefined;
    s.clock.ms += 61_000;
    let release: () => void = () => undefined;
    s.fake.receiptGate = new Promise<void>((r) => {
      release = r;
    });
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 10n })).body)).status).toBe(200);
    s.clock.ms += 60_000; // breaker.probeTimeoutSeconds 60, while the receipt may take up to 120 s
    expect(await breakerOf(s)).toBe('open');
    release();
    await settle();
    expect(await breakerOf(s)).toBe('open');
  });

  it('keeps the reservations of a timed-out transaction until a later lookup finds its receipt', async () => {
    const s = await start({
      config: {
        trustedProxies: ['127.0.0.1', '::1', '::ffff:127.0.0.1'],
        lossBudget: { windowSeconds: 3600, perKeyWei: estimate, globalWei: 10n ** 18n, maxKeys: 100 },
      },
    });
    const sweepFrom = async (nonce: bigint, destination: `0x${string}`, ip: string) => {
      const r = await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce, destination })).body, { 'x-forwarded-for': ip });
      await settle();
      return r.status === 200 ? 200 : errCode(r);
    };
    s.fake.receipt = { status: 'timeout', gasUsed: 0n };
    expect(await sweepFrom(1n, DEST, '198.51.1.1')).toBe(200);
    expect(budgetUsed(s)).toBe(estimate);
    s.fake.receipt = { status: 'success', gasUsed: 100_000n };
    // not mined yet: still reserved, so the destination stays blocked
    expect(await sweepFrom(2n, STRANGER, '198.51.2.1')).toBe(200);
    expect(s.fake.lookups).toBe(1);
    expect(await sweepFrom(3n, DEST, '198.51.3.1')).toBe('loss_budget_exhausted');
    expect(budgetUsed(s)).toBe(estimate + 100_000n * 1_000_000_000n);
    // mined after all: the next job's lookup settles it like an ordinary receipt
    s.fake.lookup = { status: 'success', gasUsed: 100_000n };
    expect(await sweepFrom(4n, `0x${'4'.repeat(40)}`, '198.51.4.1')).toBe(200);
    expect(budgetUsed(s)).toBe(3n * 100_000n * 1_000_000_000n);
    expect(await sweepFrom(5n, DEST, '198.51.5.1')).toBe(200);
    expect(s.fake.lookups).toBe(2); // settled entries are not looked up again
  });

  it('a late reverted receipt is charged as a mined revert; a lookup failure or a lost transaction is not', async () => {
    const alerts: string[] = [];
    const s = await start({
      alerts: { send: (e) => alerts.push(e.kind) },
      config: { lossBudget: { windowSeconds: 3600, perKeyWei: 10n * estimate, globalWei: 10n ** 18n, maxKeys: 100 } },
    });
    s.fake.receipt = { status: 'timeout', gasUsed: 0n };
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 1n })).body)).status).toBe(200);
    await settle();
    s.fake.receipt = { status: 'success', gasUsed: 100_000n };
    // A failing lookup does not fail the unrelated sweep that triggered it.
    const lookup = s.fake.getReceipt.bind(s.fake);
    s.fake.getReceipt = () => Promise.reject(new Error('down'));
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 2n })).body)).status).toBe(200);
    await settle();
    s.fake.getReceipt = lookup;
    s.fake.lookup = { status: 'reverted', gasUsed: 90_000n };
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 3n })).body)).status).toBe(200);
    await settle();
    expect(alerts).toContain('mined_revert');
    expect(s.logs.join('\n')).toContain('sweep_reverted');
    expect(s.relayer.metrics.render()).toContain('relayer_mined_reverts_total{chain_id="11155111"} 1');

    // A transaction that is never found is dropped from the ledger once its budget day and loss window are over.
    s.fake.receipt = { status: 'timeout', gasUsed: 0n };
    s.fake.lookup = null;
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 4n })).body)).status).toBe(200);
    await settle();
    s.fake.receipt = { status: 'success', gasUsed: 100_000n };
    s.clock.ms += 25 * 3_600_000;
    const before = s.fake.lookups;
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 5n })).body)).status).toBe(200);
    await settle();
    expect(s.fake.lookups).toBe(before);
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

  it('L5-10: a full RPC outage (gas price read fails first) opens the breaker; a gas price above the cap stays neutral', async () => {
    const s = await start();
    const bodies = await Promise.all([1n, 2n, 3n, 4n].map(async (n) => (await prepare(s, { nonce: n })).body));
    s.fake.rpcDown = true;
    for (const b of bodies.slice(0, 3)) expect(errCode(await call(s, 'POST', '/v1/sweep', b))).toBe('rpc_unavailable');
    expect(errCode(await call(s, 'POST', '/v1/sweep', bodies[3]))).toBe('breaker_open');
    expect((await call(s, 'GET', '/healthz')).json).toMatchObject({ status: 'degraded' });

    const capped = await start();
    const capBodies = await Promise.all([1n, 2n, 3n, 4n, 5n].map(async (n) => (await prepare(capped, { nonce: n })).body));
    capped.fake.gasPrice = 60_000_000_000n; // above maxGasPriceWei
    for (const b of capBodies) expect(errCode(await call(capped, 'POST', '/v1/sweep', b))).toBe('gas_price_too_high');
    expect((await call(capped, 'GET', '/healthz')).json).toMatchObject({ status: 'ok' });
    await capped.stop();
  });

  it('re-opens when the half-open probe fails', async () => {
    const s = await start();
    s.fake.simulateError = new Error('down');
    for (let i = 0; i < 3; i++)
      await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: BigInt(i + 1) })).body);
    s.clock.ms += 61_000;
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 9n })).body))).toBe(
      'rpc_unavailable',
    );
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 10n })).body))).toBe(
      'breaker_open',
    );
  });

  it('opens on a low relayer balance', async () => {
    const s = await start();
    s.fake.balance = 0n;
    const r = await call(s, 'POST', '/v1/sweep', (await prepare(s)).body);
    expect(r.status).toBe(503);
    expect(errCode(r)).toBe('breaker_open');
    expect(s.fake.simulations).toBe(0);
    // while open, requests are refused before they even reach the lane
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 2n })).body))).toBe(
      'breaker_open',
    );
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
          return Promise.resolve(
            ctx.amount > 0n ? { allow: false, reasonClass: 'sanctioned' } : { allow: true },
          );
        },
      },
    });
    const r = await call(s, 'POST', '/v1/sweep', (await prepare(s)).body);
    expect(r.status).toBe(403);
    expect(errCode(r)).toBe('policy_denied');
    expect(s.fake.simulations).toBe(0);
    expect(s.fake.sent).toHaveLength(0);
    expect(seen).toEqual([
      { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: 100_000_000n },
    ]);
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
    const s = await start({
      config: {
        rateLimit: {
          ipPerMinute: 1,
          ipBurst: 2,
          ownerPerMinute: 60,
          ownerBurst: 20,
          maxKeys: 100,
          saltRotationHours: 24,
          quoteGlobalPerMinute: 6000,
          quoteGlobalBurst: 1000,
          quoteGroupPerMinute: 6000,
          quoteGroupBurst: 1000,
        },
      },
    });
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
    const s = await start({
      config: {
        rateLimit: {
          ipPerMinute: 600,
          ipBurst: 100,
          ownerPerMinute: 1,
          ownerBurst: 1,
          maxKeys: 100,
          saltRotationHours: 24,
          quoteGlobalPerMinute: 6000,
          quoteGlobalBurst: 1000,
          quoteGroupPerMinute: 6000,
          quoteGroupBurst: 1000,
        },
      },
    });
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

  it('honours X-Forwarded-For only from trusted proxies, walking right to left', async () => {
    const lim = {
      ipPerMinute: 1,
      ipBurst: 1,
      ownerPerMinute: 60,
      ownerBurst: 20,
      maxKeys: 100,
      saltRotationHours: 24,
      quoteGlobalPerMinute: 6000,
      quoteGlobalBurst: 1000,
      quoteGroupPerMinute: 6000,
      quoteGroupBurst: 1000,
    };
    const q = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };
    const s = await start({
      config: { rateLimit: lim, trustedProxies: ['127.0.0.1', '::1', '::ffff:127.0.0.1'] },
    });
    expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '9.9.9.9' })).status).toBe(200);
    expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '9.9.9.9' })).status).toBe(429);
    // a forged leftmost entry does not pick a new bucket: the rightmost untrusted hop decides
    expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '1.2.3.4, 9.9.9.9' })).status).toBe(
      429,
    );
    expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '9.9.9.9, 127.0.0.1' })).status).toBe(
      429,
    );
    expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '8.8.8.8' })).status).toBe(200);
    // garbage in a trusted chain is refused, not collapsed into the proxy's bucket
    const bad = await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': 'not-an-ip' });
    expect(bad.status).toBe(400);
    expect(errCode(bad)).toBe('invalid_client_address');
    await s.stop();
  });

  it('ignores X-Forwarded-For from an untrusted peer and buckets IPv4 by socket address', async () => {
    const lim = {
      ipPerMinute: 1,
      ipBurst: 1,
      ownerPerMinute: 60,
      ownerBurst: 20,
      maxKeys: 100,
      saltRotationHours: 24,
      quoteGlobalPerMinute: 6000,
      quoteGlobalBurst: 1000,
      quoteGroupPerMinute: 6000,
      quoteGroupBurst: 1000,
    };
    const q = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };
    const t = await start({ config: { rateLimit: lim, trustedProxies: [] } });
    expect((await call(t, 'POST', '/v1/quote', q, { 'x-forwarded-for': '3.3.3.3' })).status).toBe(200);
    expect((await call(t, 'POST', '/v1/quote', q, { 'x-forwarded-for': '4.4.4.4' })).status).toBe(429);
    expect((await call(t, 'POST', '/v1/quote', q, { 'x-forwarded-for': '5.5.5.5, 6.6.6.6' })).status).toBe(
      429,
    );
  });

  it('applies a process-wide quote budget on top of the per-client limit', async () => {
    const lim = {
      ipPerMinute: 600,
      ipBurst: 100,
      ownerPerMinute: 60,
      ownerBurst: 20,
      maxKeys: 100,
      saltRotationHours: 24,
      quoteGlobalPerMinute: 1,
      quoteGlobalBurst: 2,
      quoteGroupPerMinute: 6000,
      quoteGroupBurst: 1000,
    };
    const q = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };
    const s = await start({
      config: { rateLimit: lim, trustedProxies: ['127.0.0.1', '::1', '::ffff:127.0.0.1'] },
    });
    expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '1.1.1.1' })).status).toBe(200);
    expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '2.2.2.2' })).status).toBe(200);
    const limited = await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '3.3.3.3' });
    expect(errCode(limited)).toBe('rate_limited_global');
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });

  describe('RELAYER-01 / L5-03: one network cannot drain the global quote budget', () => {
    // Production defaults (config.ts / relayer.config.example.json).
    const prod = {
      ipPerMinute: 30, ipBurst: 10, ownerPerMinute: 6, ownerBurst: 3, maxKeys: 10000, saltRotationHours: 24,
      quoteGlobalPerMinute: 600, quoteGlobalBurst: 100, quoteGroupPerMinute: 60, quoteGroupBurst: 20,
    };
    const proxies = ['127.0.0.1', '::1', '::ffff:127.0.0.1'];
    const q = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };
    const tally = (into: Record<string, number>, r: Awaited<ReturnType<typeof call>>): void => {
      const k = r.status === 200 ? '200' : `${String(r.status)}:${errCode(r)}`;
      into[k] = (into[k] ?? 0) + 1;
    };

    it('junk and valid quotes from one IPv6 /48 leave quotes for everyone else', async () => {
      const alerts: string[] = [];
      const s = await start({ config: { rateLimit: prod, trustedProxies: proxies }, alerts: { send: (e) => alerts.push(e.kind) } });
      const junk: Record<string, number> = {};
      const valid: Record<string, number> = {};
      for (let i = 0; i < 20; i++) {
        const xff = { 'content-type': 'text/plain', 'x-forwarded-for': `2001:db8:1:${i.toString(16)}::1` };
        for (let j = 0; j < 10; j++) tally(junk, await call(s, 'POST', '/v1/quote', 'x', xff));
      }
      // 20 /64s of one /48: the group budget (burst 20) is spent on junk; nothing reached the global budget
      expect(junk).toEqual({ '415:unsupported_media_type': 20, '429:rate_limited_ip': 180 });
      s.clock.ms += 1000;
      for (let i = 20; i < 30; i++) {
        tally(valid, await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': `2001:db8:1:${i.toString(16)}::1` }));
      }
      expect(valid['429:rate_limited_ip']).toBeGreaterThanOrEqual(9); // about one group token refilled per second
      expect(valid['429:rate_limited_global']).toBeUndefined();
      expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '198.51.100.7' })).status).toBe(200);
      expect(alerts).not.toContain('quote_budget_exhausted');
    });

    it('takes the global token only for a well-formed quote request', async () => {
      const s = await start({
        config: { rateLimit: { ...prod, quoteGlobalPerMinute: 1, quoteGlobalBurst: 2 }, trustedProxies: proxies },
      });
      expect(errCode(await call(s, 'POST', '/v1/quote', 'x', { 'content-type': 'text/plain', 'x-forwarded-for': '1.1.1.1' }))).toBe('unsupported_media_type');
      expect(errCode(await call(s, 'POST', '/v1/quote', '{nope', { 'x-forwarded-for': '2.2.2.2' }))).toBe('invalid_json');
      expect(errCode(await call(s, 'POST', '/v1/quote', { ...q, extra: 1 }, { 'x-forwarded-for': '3.3.3.3' }))).toMatch(/^invalid_/);
      expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '4.4.4.4' })).status).toBe(200);
      expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '5.5.5.5' })).status).toBe(200);
      expect(errCode(await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '6.6.6.6' }))).toBe('rate_limited_global');
    });

    it('alerts and counts when the global quote budget refuses', async () => {
      const alerts: { kind: string; chainId?: number }[] = [];
      const token = 'm'.repeat(40);
      const s = await start({
        config: { rateLimit: { ...prod, quoteGlobalPerMinute: 1, quoteGlobalBurst: 1 }, trustedProxies: proxies, metricsToken: token },
        alerts: { send: (e) => alerts.push(e) },
      });
      expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '1.1.1.1' })).status).toBe(200);
      expect(errCode(await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': '2.2.2.2' }))).toBe('rate_limited_global');
      expect(alerts).toEqual([{ kind: 'quote_budget_exhausted' }]);
      const m = await call(s, 'GET', '/metrics', undefined, { authorization: `Bearer ${token}` });
      expect(m.json as string).toContain('relayer_quote_budget_denied_total 1');
    });

    it('concurrent quotes share one gas price lookup when the cache is cold', async () => {
      const s = await start({ config: { trustedProxies: proxies } });
      let calls = 0;
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => { release = r; });
      const orig = s.fake.getGasPrice.bind(s.fake);
      s.fake.getGasPrice = async () => {
        calls += 1;
        await gate;
        return orig();
      };
      const replies = Promise.all(
        [1, 2, 3, 4, 5].map((i) => call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': `198.51.${String(i)}.1` })),
      );
      for (let i = 0; i < 20 && calls === 0; i++) await settle();
      await settle();
      release();
      expect((await replies).map((r) => r.status)).toEqual([200, 200, 200, 200, 200]);
      expect(calls).toBe(1);
      // A failed lookup is shared too, and not cached.
      s.fake.rpcDown = true;
      s.clock.ms += 4000;
      const down = await Promise.all([1, 2].map(() => call(s, 'POST', '/v1/quote', q)));
      expect(down.map(errCode)).toEqual(['rpc_unavailable', 'rpc_unavailable']);
      s.fake.rpcDown = false;
      expect((await call(s, 'POST', '/v1/quote', q)).status).toBe(200);
    });
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
    await expect(
      s.relayer.service.sweep(parseSweepRequest(body), { requestId: 'abcdef12' }),
    ).rejects.toMatchObject({ status: 503, code: 'shutting_down' });
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
    await call(s, 'POST', '/v1/quote', {
      chainId: CHAIN_ID,
      token: USDC,
      owner: OWNER,
      destination: DEST,
      amount: '100000000',
    });
    await call(s, 'POST', '/v1/quote', '{bad json with ' + DEST);
    await settle();
    const all = s.logs.join('\n');
    expect(all.length).toBeGreaterThan(0);
    const secrets = [
      DEST,
      OWNER,
      FEE_TO,
      NOPERMIT,
      ok.body['sweepSig'] as string,
      ok.quote.quoteToken,
      'bad json',
    ];
    for (const x of secrets) {
      expect(all.toLowerCase()).not.toContain(x.toLowerCase());
      expect(all).not.toContain(x.slice(2, 12));
    }
    expect(all).not.toMatch(/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/); // no address-shaped value anywhere
    expect(all).not.toMatch(/127\.0\.0\.1|::1/);
    const allowed = new Set([
      'ts',
      'level',
      'event',
      'requestId',
      'route',
      'status',
      'chainId',
      'txHash',
      'errorClass',
    ]);
    for (const line of s.logs) {
      for (const k of Object.keys(JSON.parse(line) as object)) expect(allowed.has(k)).toBe(true);
    }
    expect(all).toContain('sweep_sent');
  });
});

describe('S3-05/06 breaker integration', () => {
  const trip = async (s: Harness): Promise<void> => {
    s.fake.simulateError = new Error('rpc exploded');
    for (let i = 0; i < 3; i++)
      await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: BigInt(i + 1) })).body);
    s.fake.simulateError = undefined;
  };

  it('a half-open probe that ends in a user error cannot wedge the breaker (S3-05)', async () => {
    const s = await start();
    await trip(s);
    s.clock.ms += 61_000;
    s.fake.used.add(`${OWNER}:50`); // the probe will be a nonce_used simulation revert
    expect(errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 50n })).body))).toBe(
      'nonce_used',
    );
    // the probe slot was released: the next request is admitted as the new probe and closes it
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 51n })).body)).status).toBe(200);
    expect((await call(s, 'GET', '/healthz')).status).toBe(200);
  });

  it('healthz reports half_open as degraded, never ok', async () => {
    const s = await start();
    await trip(s);
    s.clock.ms += 61_000;
    s.fake.sendGate = new Promise<void>(() => undefined); // probe stays in flight
    void call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 60n })).body).catch(() => undefined);
    await settle();
    const h = await call(s, 'GET', '/healthz');
    expect(h.status).toBe(503);
    expect(h.json).toMatchObject({ status: 'degraded', chains: [{ breaker: 'half_open' }] });
  });

  it('a probe that never settles expires and re-opens instead of wedging', async () => {
    const s = await start({
      config: {
        breaker: {
          windowSize: 10,
          minSamples: 3,
          failureRatio: 0.5,
          cooldownSeconds: 60,
          probeTimeoutSeconds: 5,
        },
      },
    });
    await trip(s);
    s.clock.ms += 61_000;
    s.fake.sendGate = new Promise<void>(() => undefined);
    void call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 70n })).body).catch(() => undefined);
    await settle();
    s.clock.ms += 6_000;
    expect((await call(s, 'GET', '/healthz')).json).toMatchObject({ chains: [{ breaker: 'open' }] });
    s.clock.ms += 61_000;
    expect((await call(s, 'GET', '/healthz')).json).toMatchObject({ status: 'degraded' }); // cooldown elapsed: probe due
  });

  it('attacker-induced user errors never open the breaker (S3-06)', async () => {
    const s = await start();
    for (let i = 0; i < 12; i++) {
      s.fake.used.add(`${OWNER}:${String(100 + i)}`);
      expect(
        errCode(await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: BigInt(100 + i) })).body)),
      ).toBe('nonce_used');
    }
    expect((await call(s, 'GET', '/healthz')).json).toMatchObject({ status: 'ok' });
  });

  it('mined reverts do not feed the breaker but exhaust the per-source loss budget', async () => {
    const s = await start({
      config: {
        lossBudget: {
          windowSeconds: 3600,
          perKeyWei: 200_000n * 1_000_000_000n,
          globalWei: 10n ** 18n,
          maxKeys: 100,
        },
      },
    });
    s.fake.receipt = { status: 'reverted', gasUsed: 150_000n };
    let denied = '';
    for (let i = 0; i < 6 && denied === ''; i++) {
      const r = await call(
        s,
        'POST',
        '/v1/sweep',
        (await prepare(s, { nonce: BigInt(200 + i), destination: DEST })).body,
      );
      await settle();
      if (r.status !== 200) denied = errCode(r);
    }
    expect(denied).toBe('loss_budget_exhausted');
    expect((await call(s, 'GET', '/healthz')).json).toMatchObject({ status: 'ok' }); // breaker untouched
    // the network key is charged too, so minting a fresh destination does not reset the budget
    const other = await call(
      s,
      'POST',
      '/v1/sweep',
      (await prepare(s, { nonce: 300n, destination: STRANGER })).body,
    );
    expect(errCode(other)).toBe('loss_budget_exhausted');
    expect(other.headers.get('retry-after')).toBe('3600');
    // after the window the budget is restored (monotonic clock is the injected one)
    s.clock.ms += 3_600_000;
    s.fake.receipt = { status: 'success', gasUsed: 100_000n };
    expect((await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 301n })).body)).status).toBe(200);
  });

  it('serves authenticated Prometheus metrics and sends alerts without request data', async () => {
    const alerts: { kind: string; chainId?: number }[] = [];
    const token = 't'.repeat(40);
    const s = await start({ config: { metricsToken: token }, alerts: { send: (e) => alerts.push(e) } });
    await trip(s);
    expect(alerts.map((a) => a.kind)).toContain('breaker_open');
    expect((await call(s, 'GET', '/metrics')).status).toBe(401);
    expect((await call(s, 'GET', '/metrics', undefined, { authorization: 'Bearer wrong' })).status).toBe(401);
    const ok = await call(s, 'GET', '/metrics', undefined, { authorization: `Bearer ${token}` });
    expect(ok.status).toBe(200);
    const text = ok.json as string;
    expect(text).toContain('relayer_breaker_state{chain_id="11155111"} 2');
    expect(text).toContain('relayer_http_requests_total{route="/v1/sweep",status="503"}');
    expect(text).not.toContain(OWNER);
    expect(text).not.toContain(DEST);
  });

  it('keeps /metrics disabled without a configured token', async () => {
    const s = await start();
    const r = await call(s, 'GET', '/metrics', undefined, { authorization: 'Bearer x' });
    expect(r.status).toBe(404);
  });

  it('serves repeated quotes from a short gas-price cache (S3-07)', async () => {
    const s = await start();
    const q = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };
    let calls = 0;
    const orig = s.fake.getGasPrice.bind(s.fake);
    s.fake.getGasPrice = () => {
      calls += 1;
      return orig();
    };
    for (let i = 0; i < 5; i++) await call(s, 'POST', '/v1/quote', q);
    expect(calls).toBe(1);
    s.clock.ms += 4000;
    await call(s, 'POST', '/v1/quote', q);
    expect(calls).toBe(2);
  });
});
