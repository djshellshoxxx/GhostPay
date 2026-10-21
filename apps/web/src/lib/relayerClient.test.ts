import { describe, expect, it } from 'vitest';
import { requestQuote, submitSweep, type FetchFn, type SweepSubmission } from './relayerClient';

const TOKEN = '0x036CbD53842c5426634e7929541eC2318f3dCF7e';
const OWNER = '0x5555555555555555555555555555555555555555';
const DEST = '0x6666666666666666666666666666666666666666';
const FEE_TO = '0x7777777777777777777777777777777777777777';
const json = (v: unknown, status = 200): Response => new Response(JSON.stringify(v), { status });
const Q = { chainId: 84532, token: TOKEN, owner: OWNER, destination: DEST, amount: 1_000_000n } as const;
const goodQuote = { fee: '5000', feeTo: FEE_TO, expiresAt: 1_800_000_100, quoteToken: 'abc.DEF-123_=' };

const bodyText = (b: unknown): string => (typeof b === 'string' ? b : '');

describe('requestQuote', () => {
  it('posts a privacy-minimal JSON request and validates the reply', async () => {
    let seen: { url: string; init: RequestInit } | undefined;
    const fetchFn: FetchFn = (url, init) => {
      seen = { url, init };
      return Promise.resolve(json(goodQuote));
    };
    const q = await requestQuote('https://relay.test', Q, fetchFn);
    expect(q).toEqual({ fee: 5000n, feeTo: FEE_TO, expiresAt: 1_800_000_100, quoteToken: 'abc.DEF-123_=' });
    expect(seen?.url).toBe('https://relay.test/v1/quote');
    expect(seen?.init).toMatchObject({ method: 'POST', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store' });
    expect(JSON.parse(bodyText(seen?.init.body))).toEqual({ chainId: 84532, token: TOKEN, owner: OWNER, destination: DEST, amount: '1000000' });
  });
  it.each([
    ['fee', { ...goodQuote, fee: '1e3' }, /invalid fee\./],
    ['feeTo', { ...goodQuote, feeTo: 'nope' }, /fee address/],
    ['expiry', { ...goodQuote, expiresAt: 'soon' }, /expiry/],
    ['token', { ...goodQuote, quoteToken: '<script>' }, /quote token/],
    ['empty token', { ...goodQuote, quoteToken: '' }, /quote token/],
    ['not an object', [1], /invalid response/],
  ])('rejects a malformed %s', async (_n, body, re) => {
    await expect(requestQuote('https://relay.test', Q, () => Promise.resolve(json(body)))).rejects.toThrow(re);
  });
  it('reports HTTP errors by class only and never echoes the body', async () => {
    const e1 = requestQuote('https://relay.test', Q, () => Promise.resolve(json({ error: 'budget_exhausted', detail: 'secret 0xabc' }, 503)));
    await expect(e1).rejects.toThrow('The relayer refused the request: HTTP 503 (budget_exhausted).');
    await expect(requestQuote('https://relay.test', Q, () => Promise.resolve(json({ error: 'Has Spaces!' }, 422)))).rejects.toThrow('HTTP 422.');
    await expect(requestQuote('https://relay.test', Q, () => Promise.resolve(new Response('<html>', { status: 500 })))).rejects.toThrow('HTTP 500.');
  });
  it('N-06: reads the relayer error shape {"error":{"code":...}}', async () => {
    const e = requestQuote('https://relay.test', Q, () => Promise.resolve(json({ error: { code: 'quote_expired' } }, 410)));
    await expect(e).rejects.toThrow('HTTP 410 (quote_expired).');
    await expect(requestQuote('https://relay.test', Q, () => Promise.resolve(json({ error: { code: 'Bad Code' } }, 503)))).rejects.toThrow('HTTP 503.');
  });
  it('N-06: stops reading a streamed body at the cap and honours a declared length', async () => {
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(c) {
        pulls += 1;
        c.enqueue(new Uint8Array(8 * 1024).fill(120));
      },
    });
    await expect(requestQuote('https://relay.test', Q, () => Promise.resolve(new Response(stream)))).rejects.toThrow(/too large/);
    expect(pulls).toBeLessThan(10);
    const big = new Response('{}', { headers: { 'content-length': '99999' } });
    await expect(requestQuote('https://relay.test', Q, () => Promise.resolve(big))).rejects.toThrow(/too large/);
  });
  it('handles transport failures, oversized and non-JSON replies', async () => {
    await expect(requestQuote('https://relay.test', Q, () => Promise.reject(new TypeError('offline')))).rejects.toThrow(/Could not reach the relayer/);
    await expect(requestQuote('https://relay.test', Q, () => Promise.resolve(new Response('x'.repeat(20_000))))).rejects.toThrow(/too large/);
    await expect(requestQuote('https://relay.test', Q, () => Promise.resolve(new Response('not json')))).rejects.toThrow(/invalid response/);
  });
});

describe('submitSweep', () => {
  const body: SweepSubmission = {
    sweep: { token: TOKEN, owner: OWNER, destination: DEST, feeTo: FEE_TO, amount: 10n, fee: 1n, deadline: 99n, nonce: 7n },
    sweepSig: '0xaa',
    permit: { value: 10n, deadline: 99n, v: 27, r: '0x01', s: '0x02' },
    quoteToken: 'tok',
  };
  it('serialises bigints as decimal strings and returns the tx hash', async () => {
    let sent = '';
    const hash = await submitSweep('https://relay.test', body, (_u, init) => {
      sent = bodyText(init.body);
      return Promise.resolve(json({ txHash: `0x${'AB'.repeat(32)}` }));
    });
    expect(hash).toBe(`0x${'ab'.repeat(32)}`);
    const parsed = JSON.parse(sent) as { sweep: Record<string, unknown>; permit: Record<string, unknown> };
    expect(parsed.sweep['amount']).toBe('10');
    expect(parsed.sweep['nonce']).toBe('7');
    expect(parsed.permit['value']).toBe('10');
  });
  it('rejects an invalid hash', async () => {
    await expect(submitSweep('https://relay.test', body, () => Promise.resolve(json({ txHash: '0x12' })))).rejects.toThrow(/invalid transaction hash/);
  });
});
