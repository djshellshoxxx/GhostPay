import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RELAYER_PRE_BROADCAST_CODES, RelayerRefusedError, requestQuote, submitSweep, type FetchFn, type SweepSubmission } from './relayerClient';

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
    const sent = bodyText(seen?.init.body);
    // MH-REL-3: padded to a fixed bucket with a random hex `pad` the relayer discards.
    expect([1024, 2048, 4096]).toContain(new TextEncoder().encode(sent).length);
    const { pad, ...rest } = JSON.parse(sent) as Record<string, unknown>;
    expect(pad).toMatch(/^[0-9a-f]+$/);
    expect(rest).toEqual({ chainId: 84532, token: TOKEN, owner: OWNER, destination: DEST, amount: '1000000' });
  });
  it('sends the exact unpadded body when padding is off', async () => {
    let sent = '';
    await requestQuote('https://relay.test', Q, (_u, init) => {
      sent = bodyText(init.body);
      return Promise.resolve(json(goodQuote));
    }, { pad: false });
    expect(JSON.parse(sent)).toEqual({ chainId: 84532, token: TOKEN, owner: OWNER, destination: DEST, amount: '1000000' });
  });
  it('does not silently drop padding or send a request when secure randomness fails', async () => {
    const fetchFn = vi.fn<FetchFn>().mockResolvedValue(json(goodQuote));
    const random = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(() => {
      throw new Error('private random-source diagnostic');
    });
    try {
      await expect(requestQuote('https://relay.test', Q, fetchFn)).rejects.toMatchObject({
        translation: { key: 'error.relayerClient.paddingFailed' },
      });
      expect(fetchFn).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
  it('retries once unpadded only when an older relayer refuses the pad member while parsing', async () => {
    const bodies: string[] = [];
    const q = await requestQuote('https://relay.test', Q, (_u, init) => {
      bodies.push(bodyText(init.body));
      return Promise.resolve(bodies.length === 1 ? json({ error: { code: 'invalid_request' } }, 400) : json(goodQuote));
    });
    expect(q.fee).toBe(5000n);
    expect(bodies).toHaveLength(2);
    expect(JSON.parse(bodies[0] ?? '')).toHaveProperty('pad');
    expect(JSON.parse(bodies[1] ?? '')).not.toHaveProperty('pad');
  });
  it('does not retry any other refusal', async () => {
    let calls = 0;
    await expect(requestQuote('https://relay.test', Q, () => {
      calls += 1;
      return Promise.resolve(json({ error: { code: 'invalid_pad' } }, 400));
    })).rejects.toBeInstanceOf(RelayerRefusedError);
    expect(calls).toBe(1);
  });
  it('sends an oversized body unpadded instead of failing', async () => {
    let sent = '';
    const big = { ...goodQuote };
    await submitSweep('https://relay.test', {
      chainId: 84532,
      sweep: { token: TOKEN, owner: OWNER, destination: DEST, feeTo: FEE_TO, amount: 1n, fee: 1n, deadline: 1n, nonce: 1n },
      sweepSig: `0x${'a'.repeat(5000)}`,
      quoteToken: big.quoteToken,
    }, (_u, init) => {
      sent = bodyText(init.body);
      return Promise.resolve(json({ txHash: `0x${'ab'.repeat(32)}` }));
    });
    expect(JSON.parse(sent)).not.toHaveProperty('pad');
  });
  it.each([
    ['fee', { ...goodQuote, fee: '1e3' }, /invalid fee\./],
    ['oversized fee', { ...goodQuote, fee: '9'.repeat(79) }, /invalid fee\./],
    ['feeTo', { ...goodQuote, feeTo: 'nope' }, /fee address/],
    ['expiry', { ...goodQuote, expiresAt: 'soon' }, /expiry/],
    ['unsafe expiry', { ...goodQuote, expiresAt: Number.MAX_SAFE_INTEGER + 1 }, /expiry/],
    ['token', { ...goodQuote, quoteToken: '<script>' }, /quote token/],
    ['empty token', { ...goodQuote, quoteToken: '' }, /quote token/],
    ['oversized token', { ...goodQuote, quoteToken: 'a'.repeat(2049) }, /quote token/],
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
  it('reads the class from the relayer envelope { error: { code } }', async () => {
    await expect(requestQuote('https://relay.test', Q, () => Promise.resolve(json({ error: { code: 'quote_expired' } }, 410)))).rejects.toThrow('HTTP 410 (quote_expired).');
  });
  it.each([
    ['quote_expired 410', 410, { error: { code: 'quote_expired' } }, true],
    ['invalid_signature 422', 422, { error: { code: 'invalid_signature' } }, true],
    ['field validation 400', 400, { error: { code: 'invalid_sweep' } }, true],
    ['rate limit 429', 429, { error: { code: 'rate_limited_owner' } }, true],
    ['nonce_used 409', 409, { error: { code: 'nonce_used' } }, false],
    ['send_failed 503', 503, { error: { code: 'send_failed' } }, false],
    ['unknown class 422', 422, { error: { code: 'brand_new_code' } }, false],
    ['unintegrated queue refusal 429', 429, { error: { code: 'client_queue_full' } }, false],
    ['unknown authorization layer 401', 401, { error: { code: 'unauthorized' } }, false],
    ['invalid_* outside 400', 404, { error: { code: 'invalid_thing' } }, false],
    ['CDN/WAF 403 without envelope', 403, '<html>blocked</html>', false],
    ['envelope without code', 422, { error: {} }, false],
  ])('pre-broadcast refusal classification: %s', async (_n, status, body, before) => {
    const res = typeof body === 'string' ? new Response(body, { status }) : json(body, status);
    const err = await requestQuote('https://relay.test', Q, () => Promise.resolve(res)).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(RelayerRefusedError);
    expect((err as RelayerRefusedError).status).toBe(status);
    expect((err as RelayerRefusedError).beforeBroadcast).toBe(before);
  });
  it('a transport failure is not a refusal', async () => {
    const err = await requestQuote('https://relay.test', Q, () => Promise.reject(new TypeError('offline'))).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(RelayerRefusedError);
  });
  it('every pre-broadcast class is a 4xx the relayer emits, never nonce_used or a 5xx class', () => {
    const dir = fileURLToPath(new URL('../../../relayer/src/', import.meta.url));
    const src = readdirSync(dir).filter((f) => f.endsWith('.ts') && !f.includes('.test') && !f.includes('testutil')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
    const emitted = new Map<string, number>();
    for (const m of src.matchAll(/(?:RelayerError\(|\[)(\d{3}), '([a-z_]+)'/g)) emitted.set(m[2]!, Number(m[1]));
    for (const code of RELAYER_PRE_BROADCAST_CODES) {
      expect(emitted.get(code), code).toBeGreaterThanOrEqual(400);
      expect(emitted.get(code), code).toBeLessThan(500);
    }
    expect(RELAYER_PRE_BROADCAST_CODES).not.toContain('nonce_used');
    expect(emitted.get('send_failed')).toBe(503);
    // The other direction: a 4xx class the relayer can emit and this list does not know keeps the signing lock for
    // nothing (the relayer sends no 4xx after a broadcast, see its README). A new class must be listed here on purpose.
    const unknown = [...emitted].filter(([code, status]) => status >= 400 && status < 500 && code !== 'nonce_used' && !/^invalid_[a-z_]{1,32}$/.test(code) && !RELAYER_PRE_BROADCAST_CODES.includes(code)).map(([code]) => code);
    expect(unknown).toEqual([]);
    // A class absent from the integrated server contract cannot authorize releasing the signing lock.
    expect(new RelayerRefusedError('x', 429, 'client_queue_full').beforeBroadcast).toBe(false);
  });
  it('handles transport failures, oversized and non-JSON replies', async () => {
    await expect(requestQuote('https://relay.test', Q, () => Promise.reject(new TypeError('offline')))).rejects.toThrow(/Could not reach the relayer/);
    await expect(requestQuote('https://relay.test', Q, () => Promise.resolve(new Response('x'.repeat(20_000))))).rejects.toThrow(/too large/);
    await expect(requestQuote('https://relay.test', Q, () => Promise.resolve(new Response('not json')))).rejects.toThrow(/invalid response/);
  });
  it('bounds streamed response reads before the entire remote body is buffered', async () => {
    let chunksProduced = 0;
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        chunksProduced += 1;
        controller.enqueue(new Uint8Array(1024).fill(120));
        if (chunksProduced === 80) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(requestQuote('https://relay.test', Q, () => Promise.resolve(new Response(body))))
      .rejects.toThrow(/too large/);
    // The response must be rejected after roughly 16 KiB, not after reading the full 80 KiB stream.
    expect(chunksProduced).toBeLessThan(32);
    expect(cancelled).toBe(true);
  });
  it('maps a response stream read failure to a generic transport error', async () => {
    const failedBody = {
      ok: true,
      status: 200,
      text: () => Promise.reject(new TypeError('private transport detail')),
    } as Response;
    await expect(requestQuote('https://relay.test', Q, () => Promise.resolve(failedBody))).rejects.toThrow('Could not reach the relayer.');
  });
});

describe('submitSweep', () => {
  const body: SweepSubmission = {
    chainId: 84532,
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
    const parsed = JSON.parse(sent) as { chainId: unknown; sweep: Record<string, unknown>; permit: Record<string, unknown> };
    expect(parsed.chainId).toBe(84532);
    expect(parsed.sweep['amount']).toBe('10');
    expect(parsed.sweep['nonce']).toBe('7');
    expect(parsed.permit['value']).toBe('10');
  });
  it('rejects an invalid hash', async () => {
    await expect(submitSweep('https://relay.test', body, () => Promise.resolve(json({ txHash: '0x12' })))).rejects.toThrow(/invalid transaction hash/);
  });
});
