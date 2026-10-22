import { request } from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import { TokenBucketLimiter } from '@ghostpay/relayer-guard';
import { proofToWire, withdrawalToWire } from '@ghostpay/pool-sdk';
import { PoolRelayerHttpServer, MAX_BODY_BYTES } from './server.js';
import { PoolRelayerService } from './service.js';
import { config, fakeChain, goodRequest, POOL, TX } from './harness.testutil.js';
import { parseQuoteRequest, parseRelayRequest } from './validate.js';
import { RelayerError } from './errors.js';
import { createLogger, sanitizeFields, nullLogger } from './log.js';
import { buildConfig } from './config.js';

let server: PoolRelayerHttpServer | undefined;
afterEach(async () => {
  await server?.close();
  server = undefined;
});

interface Res {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: string;
}

function call(port: number, method: string, path: string, body?: string, headers: Record<string, string> = {}): Promise<Res> {
  return new Promise((resolve, reject) => {
    const r = request({ host: '127.0.0.1', port, method, path, headers: { ...(body === undefined ? {} : { 'content-type': 'application/json', 'content-length': String(Buffer.byteLength(body)) }), ...headers } }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString() }));
    });
    r.on('error', reject);
    if (body !== undefined) r.write(body);
    r.end();
  });
}

async function start(over: Parameters<typeof config>[0] = {}, lines: string[] = [], chain = fakeChain()): Promise<number> {
  const cfg = config({ port: 0, allowedOrigins: ['https://app.example'], ...over });
  const service = new PoolRelayerService({
    config: cfg,
    chains: new Map([[31337, chain]]),
    verifyProof: () => Promise.resolve(true),
    limiter: new TokenBucketLimiter({ ratePerSecond: 1000, burst: 1000, maxKeys: 100 }),
    logger: createLogger((l) => lines.push(l)),
    receiptTimeoutMs: 10,
  });
  server = new PoolRelayerHttpServer({ config: cfg, service, logger: createLogger((l) => lines.push(l)), newRequestId: () => 'aaaaaaaa-bbbb' });
  return (await server.listen()).port;
}

const relayBody = (): string => {
  const r = goodRequest();
  return JSON.stringify({ chainId: r.chainId, pool: r.pool, withdrawal: withdrawalToWire(r.withdrawal), proof: proofToWire(r.proof) });
};

describe('http', () => {
  it('serves info, health, quote, relay with security headers', async () => {
    const lines: string[] = [];
    const port = await start({}, lines);
    const info = await call(port, 'GET', '/v1/info');
    expect(info.status).toBe(200);
    expect(info.headers['x-content-type-options']).toBe('nosniff');
    expect(info.headers['cache-control']).toBe('no-store');
    expect((await call(port, 'GET', '/healthz')).status).toBe(200);
    const q = await call(port, 'POST', '/v1/quote', JSON.stringify({ chainId: 31337, pool: POOL, withdrawnValue: '1000000000000' }));
    expect(q.status).toBe(200);
    expect((JSON.parse(q.body) as { relayerFee: string }).relayerFee).toMatch(/^[0-9]+$/);
    const rl = await call(port, 'POST', '/v1/relay', relayBody());
    expect(rl.status).toBe(200);
    expect(JSON.parse(rl.body)).toEqual({ txHash: TX, status: 'confirmed' });
    expect(lines.join('\n')).not.toContain('"recipient"');
  });
  it('error mapping', async () => {
    const port = await start({ trustedProxies: [] });
    expect((await call(port, 'GET', '/nope')).status).toBe(404);
    const m = await call(port, 'GET', '/v1/relay');
    expect(m.status).toBe(405);
    expect(m.headers['allow']).toBe('POST');
    expect((await call(port, 'POST', '/v1/relay', '{}', { 'content-type': 'text/plain' })).status).toBe(415);
    expect((await call(port, 'POST', '/v1/relay')).status).toBe(415);
    expect((await call(port, 'POST', '/v1/relay', 'not json')).status).toBe(400);
    expect((await call(port, 'POST', '/v1/relay', '{"chainId":1}')).status).toBe(400);
    const big = await call(port, 'POST', '/v1/relay', 'x'.repeat(MAX_BODY_BYTES + 10));
    expect(big.status).toBe(413);
    expect((JSON.parse((await call(port, 'POST', '/v1/relay', JSON.stringify({ chainId: 1, pool: POOL, withdrawal: {}, proof: {} }))).body) as { error: { code: string } }).error.code).toBe('wrong_chain');
    const o = await call(port, 'GET', '/v1/info', undefined, { origin: 'https://evil.example' });
    expect(o.status).toBe(403);
    const ok = await call(port, 'GET', '/v1/info', undefined, { origin: 'https://app.example' });
    expect(ok.headers['access-control-allow-origin']).toBe('https://app.example');
    const pre = await call(port, 'OPTIONS', '/v1/relay', undefined, { origin: 'https://app.example' });
    expect(pre.status).toBe(204);
  });
  it('rate limit returns 429 with Retry-After; breaker health is 503', async () => {
    const chain = fakeChain();
    const cfg = config({ port: 0 });
    const service = new PoolRelayerService({ config: cfg, chains: new Map([[31337, chain]]), verifyProof: () => Promise.resolve(true), limiter: new TokenBucketLimiter({ ratePerSecond: 0.001, burst: 5, maxKeys: 4 }) });
    server = new PoolRelayerHttpServer({ config: cfg, service });
    const port = (await server.listen()).port;
    const body = JSON.stringify({ chainId: 31337, pool: POOL, withdrawnValue: '1000000000000' });
    expect((await call(port, 'POST', '/v1/quote', body)).status).toBe(200);
    for (let i = 0; i < 4; i++) await call(port, 'POST', '/v1/quote', body);
    const lim = await call(port, 'POST', '/v1/quote', body);
    expect(lim.status).toBe(429);
    expect(Number(lim.headers['retry-after'])).toBeGreaterThan(0);
  });
  it('unexpected errors are 500 without detail', async () => {
    const cfg = config({ port: 0 });
    const service = new PoolRelayerService({ config: cfg, chains: new Map([[31337, fakeChain()]]) });
    service.info = () => {
      throw new TypeError('boom secret');
    };
    server = new PoolRelayerHttpServer({ config: cfg, service });
    const port = (await server.listen()).port;
    const r = await call(port, 'GET', '/v1/info');
    expect(r.status).toBe(500);
    expect(r.body).not.toContain('boom');
    expect((JSON.parse(r.body) as { error: { code: string } }).error.code).toBe('internal_error');
  });
  it('rejects an unresolvable client address behind a trusted proxy chain', async () => {
    const port = await start({ trustedProxies: ['127.0.0.1/32'] });
    const bad = await call(port, 'POST', '/v1/quote', JSON.stringify({ chainId: 31337, pool: POOL, withdrawnValue: '1000000000000' }), { 'x-forwarded-for': 'garbage' });
    expect(bad.status).toBe(400);
    const good = await call(port, 'POST', '/v1/quote', JSON.stringify({ chainId: 31337, pool: POOL, withdrawnValue: '1000000000000' }), { 'x-forwarded-for': '203.0.113.9' });
    expect(good.status).toBe(200);
  });
});

describe('http abuse', () => {
  it('aborted bodies and drain are handled', async () => {
    const port = await start();
    await new Promise<void>((resolve) => {
      const r = request({ host: '127.0.0.1', port, method: 'POST', path: '/v1/relay', headers: { 'content-type': 'application/json', 'content-length': '500' } });
      r.on('error', () => resolve());
      r.write('{"a":');
      setTimeout(() => {
        r.destroy();
        resolve();
      }, 50);
    });
    await new Promise((r) => setTimeout(r, 50));
    const closing = server?.close();
    await closing;
    server = undefined;
  });
});

describe('validate', () => {
  it('quote and relay strictness', () => {
    expect(parseQuoteRequest({ chainId: 31337, pool: POOL, withdrawnValue: '5' }).withdrawnValue).toBe(5n);
    const bad = (f: () => unknown): string => {
      try {
        f();
        return 'ok';
      } catch (e) {
        return e instanceof RelayerError ? e.code : 'other';
      }
    };
    expect(bad(() => parseQuoteRequest(null))).toBe('bad_body');
    expect(bad(() => parseQuoteRequest([]))).toBe('bad_body');
    expect(bad(() => parseQuoteRequest({ chainId: 31337, pool: POOL, withdrawnValue: '0' }))).toBe('bad_field');
    expect(bad(() => parseQuoteRequest({ chainId: 31337, pool: 'x', withdrawnValue: '5' }))).toBe('bad_field');
    expect(bad(() => parseQuoteRequest({ chainId: 5, pool: POOL, withdrawnValue: '5' }))).toBe('wrong_chain');
    expect(bad(() => parseRelayRequest({ chainId: 31337, pool: POOL, withdrawal: 1, proof: 1 }))).toBe('bad_field');
    const r = goodRequest();
    const parsed = parseRelayRequest(JSON.parse(relayBody()));
    expect(parsed.withdrawal).toEqual(r.withdrawal);
    expect(bad(() => { throw new TypeError('x'); })).toBe('other');
  });
});

describe('log', () => {
  it('drops malformed fields and event names', () => {
    expect(sanitizeFields({ requestId: 'zz', route: '/etc/passwd', status: 99, chainId: -1, txHash: '0x12', errorClass: 'Bad Class' })).toEqual({});
    expect(sanitizeFields({ requestId: 'abcdef12-34', route: '/v1/relay', status: 200, chainId: 31337, txHash: `0x${'a'.repeat(64)}`, errorClass: 'ok_class' })).toMatchObject({ status: 200 });
    const lines: string[] = [];
    createLogger((l) => lines.push(l), () => 0).log('info', 'Bad Event!', { status: 200 });
    expect((JSON.parse(lines[0] as string) as { event: string }).event).toBe('invalid_event');
    createLogger((l) => lines.push(l)).log('warn', 'x_y');
    nullLogger.log('info', 'x');
    expect(buildConfig({ pools: config().pools, feeTo: config().feeTo }).host).toBe('127.0.0.1');
  });
});
