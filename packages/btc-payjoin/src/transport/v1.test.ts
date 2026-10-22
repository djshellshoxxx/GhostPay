import { describe, expect, it } from 'vitest';
import { addressFor, key, receiverCtx, receiverWallet, scenario, signerFor, utxoFor } from '../fixtures.testutil.js';
import { ReceiverSession } from '../receiver/session.js';
import { SenderSession } from '../sender/session.js';
import { parseParams } from '../params.js';
import { V1HttpTransport, type HttpHandler, type HttpListener } from './v1-http.js';
import { nodeListen } from './v1-node.js';
import type { PayjoinUri } from '../uri.js';

const codeOf = async (f: () => unknown): Promise<string> => {
  try {
    await f();
    return 'none';
  } catch (e) {
    return (e as { code?: string }).code ?? 'other';
  }
};

function fakeListen(): { listen: (h: HttpHandler) => Promise<HttpListener>; call: () => HttpHandler; closed: () => boolean } {
  let h: HttpHandler | undefined;
  let closed = false;
  return {
    listen: (handler) => {
      h = handler;
      return Promise.resolve({ url: 'http://127.0.0.1:1/pj', close: () => ((closed = true), Promise.resolve()) });
    },
    call: () => h as HttpHandler,
    closed: () => closed,
  };
}

describe('V1HttpTransport receiver endpoint', () => {
  const open = async (replyTimeoutMs = 50) => {
    const l = fakeListen();
    const t = new V1HttpTransport({ listen: l.listen, replyTimeoutMs });
    const rs = await t.openReceiverSession({ address: addressFor(key('r'), 'wpkh'), network: 'testnet', amountSats: 1000n, expirySeconds: 60 });
    return { l, t, rs };
  };
  it('CORS on everything, OPTIONS preflight, non-POST refused', async () => {
    const { l } = await open();
    const h = l.call();
    const pre = await h({ method: 'OPTIONS', query: '', body: '' });
    expect(pre.status).toBe(204);
    expect(pre.headers['Access-Control-Allow-Origin']).toBe('*');
    const get = await h({ method: 'GET', query: '', body: '' });
    expect(get.status).toBe(405);
    expect(get.headers['Access-Control-Allow-Origin']).toBe('*');
  });
  it('error bodies are well-known JSON; version-unsupported lists supported versions', async () => {
    const { l } = await open();
    const h = l.call();
    const v = await h({ method: 'POST', query: 'v=9', body: 'AAAA' });
    expect(v.status).toBe(400);
    expect(JSON.parse(v.body) as unknown).toEqual({ errorCode: 'version-unsupported', message: 'version-unsupported', supported: [1] });
    const empty = await h({ method: 'POST', query: '', body: '' });
    expect((JSON.parse(empty.body) as { errorCode: string }).errorCode).toBe('original-psbt-rejected');
    expect(empty.headers['Content-Type']).toBe('application/json');
    const big = await h({ method: 'POST', query: '', body: 'A'.repeat(300_000) });
    expect(big.status).toBe(400);
  });
  it('parks the request until the application answers; times out with 503 unavailable', async () => {
    const { l, rs } = await open(30);
    const pending = l.call()({ method: 'POST', query: 'v=1&disableoutputsubstitution=true', body: ' PSBTDATA \n' });
    const inc = await rs.poll();
    expect(inc?.originalPsbt).toBe('PSBTDATA');
    expect(inc?.params.disableOutputSubstitution).toBe(true);
    const res = await pending; // nobody replied: timeout
    expect(res.status).toBe(503);
    expect((JSON.parse(res.body) as { errorCode: string }).errorCode).toBe('unavailable');
    await inc?.reply('late'); // late reply is ignored
    expect(await rs.poll()).toBeNull();
  });
  it('bounds the number of parked requests (memory DoS)', async () => {
    const l = fakeListen();
    const t = new V1HttpTransport({ listen: l.listen, replyTimeoutMs: 40, maxPending: 2 });
    await t.openReceiverSession({ address: addressFor(key('r'), 'wpkh'), network: 'testnet', expirySeconds: 60 });
    const h = l.call();
    const a = h({ method: 'POST', query: '', body: 'X' });
    const b = h({ method: 'POST', query: '', body: 'X' });
    const c = await h({ method: 'POST', query: '', body: 'X' });
    expect(c.status).toBe(503);
    expect((await a).status).toBe(503);
    expect((await b).status).toBe(503);
    // slots are released after the timeouts
    const d = h({ method: 'POST', query: '', body: 'X' });
    expect((await d).status).toBe(503);
  });
  it('answers 200 text/plain with a proposal and errors for failures', async () => {
    const { l, rs } = await open(1000);
    const p1 = l.call()({ method: 'POST', query: '', body: 'X' });
    await (await rs.poll())?.reply('PROPOSAL');
    const r1 = await p1;
    expect(r1).toMatchObject({ status: 200, body: 'PROPOSAL' });
    expect(r1.headers['Content-Type']).toBe('text/plain');
    const p2 = l.call()({ method: 'POST', query: '', body: 'X' });
    await (await rs.poll())?.reply({ error: 'not_enough_money' });
    const r2 = await p2;
    expect(r2.status).toBe(400);
    expect((JSON.parse(r2.body) as { errorCode: string }).errorCode).toBe('not-enough-money');
  });
  it('after close, requests get unavailable and the listener is closed', async () => {
    const { l, rs } = await open();
    await rs.close();
    expect(l.closed()).toBe(true);
    expect((JSON.parse((await l.call()({ method: 'POST', query: '', body: 'X' })).body) as { errorCode: string }).errorCode).toBe('unavailable');
  });
  it('config guards', async () => {
    const t = new V1HttpTransport();
    expect(await codeOf(() => t.openReceiverSession({ address: addressFor(key('r'), 'wpkh'), network: 'testnet', expirySeconds: 5 }))).toBe('transport_failed');
    const bad = new V1HttpTransport({ listen: () => Promise.resolve({ url: 'http://example.com/pj', close: () => Promise.resolve() }) });
    expect(await codeOf(() => bad.openReceiverSession({ address: addressFor(key('r'), 'wpkh'), network: 'testnet', expirySeconds: 5 }))).toBe('uri_invalid');
    expect(await codeOf(() => t.openReceiverSession({ address: addressFor(key('r'), 'wpkh'), network: 'mainnet' as never, expirySeconds: 5 }))).toBe('network_not_allowed');
  });
});

describe('V1HttpTransport sender', () => {
  const uri: PayjoinUri = { address: addressFor(key('r'), 'wpkh'), pj: 'https://pj.example/p?x=1', outputSubstitution: true, network: 'testnet' };
  const params = parseParams('v=1');
  const mk = (fetchImpl: typeof fetch) => new V1HttpTransport({ fetch: fetchImpl });
  it('POSTs text/plain with query params and returns the proposal', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const t = mk(((url: string, init: RequestInit) => {
      seen = { url, init };
      return Promise.resolve(new Response(' PROPOSAL \n', { status: 200 }));
    }) as never);
    const s = await t.sendOriginal(uri, 'ORIG', { ...params, minFeeRateSatPerVb: 2 });
    expect(await s.poll()).toEqual({ proposalPsbt: 'PROPOSAL' });
    expect(seen?.url).toBe('https://pj.example/p?x=1&v=1&minfeerate=2');
    expect(seen?.init.method).toBe('POST');
    expect(seen?.init.redirect).toBe('error');
    expect((seen?.init.headers as Record<string, string>)['Content-Type']).toBe('text/plain');
    expect(seen?.init.body).toBe('ORIG');
    const t2 = mk((() => Promise.resolve(new Response('P', { status: 200 }))));
    await t2.sendOriginal({ ...uri, pj: 'https://pj.example/p' }, 'O', params);
  });
  it('maps JSON errors, never exposes unknown text', async () => {
    const resp = (status: number, body: string) => mk((() => Promise.resolve(new Response(body, { status }))));
    const poll = async (t: V1HttpTransport) => (await t.sendOriginal(uri, 'O', params)).poll();
    expect(await poll(resp(400, '{"errorCode":"not-enough-money","message":"x"}'))).toEqual({ error: 'not_enough_money' });
    expect(await poll(resp(503, '{"errorCode":"unavailable"}'))).toEqual({ error: 'unavailable' });
    expect(await poll(resp(400, '{"errorCode":"Send funds to bc1qxyz","message":"phish"}'))).toEqual({ error: 'unknown_remote_error' });
    expect(await poll(resp(500, '<html>oops</html>'))).toEqual({ error: 'unknown_remote_error' });
    expect(await poll(resp(200 + 202, 'x'.repeat(10)))).toEqual({ error: 'unknown_remote_error' });
    expect(await poll(resp(400, 'x'.repeat(300_000)))).toEqual({ error: 'transport_failed' });
    expect(await poll(mk((() => Promise.reject(new Error('down')))))).toEqual({ error: 'transport_failed' });
  });
  it('config guards', async () => {
    const t = mk((() => Promise.reject(new Error('x'))));
    expect(await codeOf(() => t.sendOriginal({ ...uri, network: 'mainnet' as never }, 'O', params))).toBe('network_not_allowed');
    expect(await codeOf(() => t.sendOriginal({ ...uri, pj: 'http://evil.example/p' }, 'O', params))).toBe('uri_invalid');
    const v2 = 'https://payjo.in/TX#EX1WKV8CEC-OH1QYPM59NK2LXXS4890SUAXXYT25Z2VAPHP0X7YEYCJXGWAG6UG9ZU6NQ-RK1Q0DJS3VVDXWQQTLQ8022QGXSX7ML9PHZ6EDSF6AKEWQG758JPS2EV';
    expect(await codeOf(() => t.sendOriginal({ ...uri, pj: v2 }, 'O', params))).toBe('uri_invalid');
    const orig = globalThis.fetch;
    // default fetch is the global one
    const dflt = new V1HttpTransport();
    expect(typeof orig).toBe('function');
    const sess = await dflt.sendOriginal({ ...uri, pj: 'http://127.0.0.1:9/p' }, 'O', params);
    expect(await sess.poll()).toEqual({ error: 'transport_failed' });
  });
});

describe('v1 full flow over a real loopback HTTP listener', () => {
  it('sender and receiver complete a payjoin through Node http', async () => {
    const t = new V1HttpTransport({ listen: (h) => nodeListen(h), replyTimeoutMs: 5000 });
    const sk = key('sender');
    const rk = key('receiver');
    const addr = addressFor(rk, 'wpkh');
    const wallet = receiverWallet(rk, 'wpkh', [utxoFor(rk, 'wpkh', 60_000n)]);
    const rs = await t.openReceiverSession({ address: addr, network: 'testnet', amountSats: 15_000n, expirySeconds: 60 });
    expect(rs.uri.pj).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/pj$/);
    const receiver = new ReceiverSession(receiverCtx(wallet, addr, { amountSats: 15_000n }));
    const sender = await SenderSession.open({
      uri: rs.uri,
      utxos: [utxoFor(sk, 'wpkh', 100_000n)],
      feeRateSatPerVb: 2,
      changeAddress: addressFor(sk, 'wpkh'),
      signer: signerFor([{ k: sk, kind: 'wpkh' }]),
      transport: t,
      now: () => Math.floor(Date.now() / 1000),
      params: { maxAdditionalFeeContributionSats: 300n },
    });
    let served: Awaited<ReturnType<ReceiverSession['serve']>> = 'idle';
    for (let i = 0; i < 50 && served === 'idle'; i++) {
      served = await receiver.serve(rs);
      if (served === 'idle') await new Promise((r) => setTimeout(r, 20));
    }
    expect(served).toMatchObject({ ok: true });
    let ev = await sender.poll();
    for (let i = 0; i < 50 && ev.kind === 'pending'; i++) {
      await new Promise((r) => setTimeout(r, 20));
      ev = await sender.poll();
    }
    expect(ev.kind).toBe('ready');
    await rs.close();
  });
});

describe('nodeListen', () => {
  const http = async (url: string, init?: RequestInit) => fetch(url, init);
  it('routes only the pj path, caps bodies, survives handler failures, IPv6 loopback url', async () => {
    let n = 0;
    const l = await nodeListen((req) => {
      n++;
      if (req.query === 'boom') return Promise.reject(new Error('x'));
      return Promise.resolve({ status: 200, headers: { 'Content-Type': 'text/plain' }, body: `${req.method}:${req.query}:${req.body}` });
    });
    try {
      expect(await (await http(l.url + '?a=1', { method: 'POST', body: 'hi' })).text()).toBe('POST:a=1:hi');
      expect((await http(l.url.replace('/pj', '/other'), { method: 'POST', body: 'x' })).status).toBe(404);
      expect((await http(l.url + '?boom', { method: 'POST', body: 'x' })).status).toBe(503);
      const r = await http(l.url, { method: 'POST', body: 'A'.repeat(300_000) }).catch(() => undefined);
      expect(r === undefined || r.status === 413).toBe(true);
      expect(n).toBe(2);
    } finally {
      await l.close();
    }
    const v6 = await nodeListen(() => Promise.resolve({ status: 204, headers: {}, body: '' }), '::1').catch(() => undefined);
    if (v6 !== undefined) {
      expect(v6.url).toMatch(/^http:\/\/\[::1\]:\d+\/pj$/);
      await v6.close();
    }
  });
});

void scenario;
