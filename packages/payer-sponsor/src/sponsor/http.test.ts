/* eslint-disable @typescript-eslint/require-await -- fakes implement async ports without awaiting */
import { describe, expect, it } from 'vitest';
import { request } from 'node:http';
import type { AddressInfo } from 'node:net';
import { TrustedProxies } from '@ghostpay/relayer-guard';
import { privateKeyToAccount } from 'viem/accounts';
import { createHttpHandler, startHttpServer, type HttpRequestLike } from './http.js';
import { bigintReplacer, obj, parseEip7702Submit, parseQuoteRequest, parseRelaySubmit, parseUserOpRequest, sponsoredMode } from './wire.js';
import { NO_PERMIT, buildRelayIntent } from '../relay/intent.js';
import { CHAIN_ID, DEPLOY, GROSS, ROUTER, POLICY_ROUTER, TOKEN, harness, nowSec, payArgs, type Harness } from './service.testutil.js';

const payer = privateKeyToAccount(`0x${'11'.repeat(32)}`);
const trusted = new TrustedProxies(['10.0.0.1']);
const mk = (h: Harness, maxBodyBytes = 20_000) => createHttpHandler({ service: h.svc, trusted, maxBodyBytes });
const req = (over: Partial<HttpRequestLike> & { json?: unknown }): HttpRequestLike => ({
  method: 'POST',
  path: '/v1/quote',
  headers: {},
  peer: '203.0.113.9',
  body: over.json === undefined ? '' : JSON.stringify(over.json, bigintReplacer),
  ...over,
});
const quoteBody = { mode: 'permit-relay', chainId: CHAIN_ID, token: TOKEN, gross: GROSS.toString() };

describe('http handler', () => {
  it('health, quote, errors without detail', async () => {
    const h = harness();
    const f = mk(h);
    expect((await f(req({ method: 'GET', path: '/v1/health' }))).status).toBe(200);
    const q = await f(req({ json: quoteBody }));
    expect(q.status).toBe(200);
    expect(JSON.parse(q.body)).toMatchObject({ sponsorFee: expect.any(String) as string, sponsorFeeTo: expect.any(String) as string });
    expect((await f(req({ json: { ...quoteBody, chainId: 1 } }))).status).toBe(403);
    expect(JSON.parse((await f(req({ json: { ...quoteBody, chainId: 1 } }))).body)).toEqual({ error: 'MAINNET_FORBIDDEN' });
    expect((await f(req({ json: { ...quoteBody, token: '0x12' } }))).status).toBe(400);
    expect((await f(req({ body: '{not json' }))).status).toBe(400);
    expect((await f(req({ method: 'PUT' }))).status).toBe(405);
    expect((await f(req({ path: '/nope', json: {} }))).status).toBe(404);
    expect((await f(req({ json: quoteBody, body: 'x'.repeat(30_000) }))).status).toBe(413);
    expect((await f(req({ peer: undefined, json: quoteBody }))).status).toBe(400);
  });
  it('unexpected errors map to a generic 500', async () => {
    const h = harness();
    const f = createHttpHandler({ service: { quote: async () => { throw new Error('secret detail'); } } as never, trusted, maxBodyBytes: 1000 });
    const r = await f(req({ json: quoteBody }));
    expect(r.status).toBe(500);
    expect(r.body).toBe('{"error":"INTERNAL"}');
    expect(h).toBeDefined();
  });
  it('buckets clients by IP; X-Forwarded-For is honoured only from trusted proxies (S3-07)', async () => {
    const { TokenBucketLimiter } = await import('@ghostpay/relayer-guard');
    const clock = { now: 1_000_000 };
    const limiter = new TokenBucketLimiter({ ratePerSecond: 0.0001, burst: 1, maxKeys: 10 }, () => clock.now);
    const h = harness({ limiter, now: () => clock.now });
    const f = mk(h);
    expect((await f(req({ json: quoteBody, peer: '203.0.113.9' }))).status).toBe(200);
    // forged header from an untrusted peer does not change the bucket
    expect((await f(req({ json: quoteBody, peer: '203.0.113.9', headers: { 'x-forwarded-for': '198.51.100.1' } }))).status).toBe(429);
    // trusted proxy: the forwarded client is used
    expect((await f(req({ json: quoteBody, peer: '10.0.0.1', headers: { 'x-forwarded-for': '198.51.100.7' } }))).status).toBe(200);
    expect((await f(req({ json: quoteBody, peer: '10.0.0.1', headers: { 'x-forwarded-for': 'garbage' } }))).status).toBe(400);
  });
  it('submit dispatches by mode and rejects non-sponsored modes', async () => {
    const h = harness();
    const f = mk(h);
    const q = JSON.parse((await f(req({ json: quoteBody }))).body) as { quoteId: string; sponsorFee: string; sponsorFeeTo: string };
    const b = buildRelayIntent({ chainId: CHAIN_ID, relay: DEPLOY.relay, payer: payer.address, router: ROUTER, pay: payArgs(), sponsorFee: BigInt(q.sponsorFee), sponsorFeeTo: q.sponsorFeeTo as `0x${string}`, deadline: nowSec(h) + 600n, nonce: 1n });
    const sig = await payer.signTypedData(b.typedData);
    const body = { mode: 'permit-relay', quoteId: q.quoteId, chainId: CHAIN_ID, router: { kind: 'ghostpay', address: ROUTER.address }, intent: b.intent, routerCalldata: b.routerCalldata, sig, permit: NO_PERMIT };
    const ok = await f(req({ path: '/v1/submit', json: body }));
    expect(ok.status).toBe(200);
    expect(JSON.parse(ok.body)).toMatchObject({ txHash: expect.stringMatching(/^0x/) as string });
    expect((await f(req({ path: '/v1/submit', json: { ...body, mode: 'direct' } }))).status).toBe(400);
    expect((await f(req({ path: '/v1/submit', json: { ...body, mode: 'eip7702-sponsored' } }))).status).toBe(400);
    expect((await f(req({ path: '/v1/submit', json: { ...body, mode: 'erc4337-paymaster' } }))).status).toBe(400);
    expect((await f(req({ path: '/v1/sponsor-userop', json: {} }))).status).toBe(400);
    expect((await f(req({ path: '/v1/submit', json: [] }))).status).toBe(400);
  });
  it('serves over a real node:http socket', async () => {
    const h = harness();
    const server = await startHttpServer(mk(h, 2000), 0, '127.0.0.1', 2000);
    const port = (server.address() as AddressInfo).port;
    const call = (method: string, path: string, body?: string) =>
      new Promise<{ status: number; text: string }>((resolve, reject) => {
        const r = request({ host: '127.0.0.1', port, method, path: `${path}?x=1` }, (res) => {
          let t = '';
          res.on('data', (c: Buffer) => (t += c.toString()));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, text: t }));
        });
        r.on('error', reject);
        r.end(body);
      });
    try {
      expect((await call('GET', '/v1/health')).status).toBe(200);
      const q = await call('POST', '/v1/quote', JSON.stringify(quoteBody));
      expect(q.status).toBe(200);
      expect((await call('POST', '/v1/quote', 'x'.repeat(5000))).status).toBe(413);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});

describe('wire parsers', () => {
  it('strict validation of numbers, hex, addresses, modes', () => {
    expect(() => parseQuoteRequest({ ...quoteBody, gross: '01' })).toThrow();
    expect(() => parseQuoteRequest({ ...quoteBody, gross: 5 })).toThrow();
    expect(() => parseQuoteRequest({ ...quoteBody, gross: '9'.repeat(80) })).toThrow();
    expect(() => parseQuoteRequest({ ...quoteBody, gross: (2n ** 256n).toString() })).toThrow();
    expect(() => parseQuoteRequest({ ...quoteBody, chainId: -1 })).toThrow();
    expect(() => parseQuoteRequest({ ...quoteBody, chainId: 1.5 })).toThrow();
    expect(() => parseQuoteRequest({ ...quoteBody, mode: 'direct' })).toThrow();
    expect(() => sponsoredMode(5)).toThrow();
    expect(() => obj([], 'x')).toThrow();
    expect(() => obj(null, 'x')).toThrow();
    expect(parseQuoteRequest(quoteBody).gross).toBe(GROSS);
    expect(bigintReplacer('k', 5n)).toBe('5');
    expect(bigintReplacer('k', 5)).toBe(5);
  });
  const h = harness();
  const b = buildRelayIntent({ chainId: CHAIN_ID, relay: DEPLOY.relay, payer: payer.address, router: POLICY_ROUTER, pay: payArgs(), sponsorFee: 1n, sponsorFeeTo: payer.address, deadline: nowSec(h) + 600n, nonce: 1n });
  const relayBody = () => JSON.parse(JSON.stringify({ quoteId: 'q', chainId: CHAIN_ID, router: { kind: 'policy', address: POLICY_ROUTER.address, policy: POLICY_ROUTER.kind === 'policy' ? POLICY_ROUTER.policy : undefined }, intent: b.intent, routerCalldata: b.routerCalldata, sig: `0x${'11'.repeat(65)}` }, bigintReplacer)) as Record<string, unknown>;
  it('parses relay submit bodies (policy router, optional permit)', () => {
    const r = parseRelaySubmit(relayBody());
    expect(r.router.kind).toBe('policy');
    expect(r.permit).toEqual(NO_PERMIT);
    const withPermit = parseRelaySubmit({ ...relayBody(), permit: { value: '5', deadline: '9', v: 27, r: `0x${'01'.repeat(32)}`, s: `0x${'02'.repeat(32)}` } });
    expect(withPermit.permit.v).toBe(27);
  });
  it('rejects malformed relay bodies', () => {
    const rb = relayBody();
    const cases: Record<string, unknown>[] = [
      { ...rb, router: { kind: 'x', address: ROUTER.address } },
      { ...rb, router: { kind: 'policy', address: ROUTER.address } },
      { ...rb, quoteId: 5 },
      { ...rb, sig: '0x12' },
      { ...rb, sig: 'zz' },
      { ...rb, routerCalldata: '0x123' },
      { ...rb, routerCalldata: `0x${'00'.repeat(20_000)}` },
      { ...rb, intent: { ...(rb['intent'] as object), payer: 5 } },
      { ...rb, permit: { value: '5', deadline: '9', v: 300, r: `0x${'01'.repeat(32)}`, s: `0x${'02'.repeat(32)}` } },
    ];
    for (const c of cases) expect(() => parseRelaySubmit(c)).toThrowError(expect.objectContaining({ code: 'BAD_REQUEST' }) as Error);
  });
  it('parses 7702 and user-op bodies and rejects bad ones', () => {
    const auth = { chainId: CHAIN_ID, address: DEPLOY.delegate, nonce: 0, r: `0x${'01'.repeat(32)}`, s: `0x${'02'.repeat(32)}`, yParity: 1 };
    const { payer: _omit, ...delegateIntent } = b.intent;
    void _omit;
    const body = { quoteId: 'q', chainId: CHAIN_ID, payer: payer.address, router: { kind: 'ghostpay', address: ROUTER.address }, intent: JSON.parse(JSON.stringify(delegateIntent, bigintReplacer)) as object, routerCalldata: b.routerCalldata, sig: `0x${'11'.repeat(65)}`, authorization: auth };
    expect(parseEip7702Submit(body).authorization.yParity).toBe(1);
    expect(() => parseEip7702Submit({ ...body, authorization: { ...auth, yParity: 2 } })).toThrow();
    const uo = { sender: payer.address, nonce: '0', initCode: '0x', callData: '0x12', accountGasLimits: `0x${'00'.repeat(32)}`, preVerificationGas: '1', gasFees: `0x${'00'.repeat(32)}`, paymasterAndData: '0x', signature: '0x' };
    const ub = { quoteId: 'q', chainId: CHAIN_ID, router: { kind: 'ghostpay', address: ROUTER.address }, routerCalldata: '0x12', owner: payer.address, saltNonce: '9', sponsorFee: '1', userOp: uo };
    expect(parseUserOpRequest(ub).saltNonce).toBe(9n);
    expect(() => parseUserOpRequest({ ...ub, owner: 'x' })).toThrow();
    expect(() => parseUserOpRequest({ ...ub, userOp: { ...uo, accountGasLimits: '0x12' } })).toThrow();
  });
});
