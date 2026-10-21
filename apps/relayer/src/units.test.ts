import { describe, expect, it, vi } from 'vitest';
import { CircuitBreaker } from './breaker.js';
import { DailyBudget } from './budget.js';
import { parseAddress, parseHex, parseInt53, parseObject, parseUint } from './codec.js';
import { RelayerError, SimulationRevert, invalid } from './errors.js';
import { ChainLane, NonceManager } from './lane.js';
import { KeyHasher, LruMap, RateLimiter } from './limiter.js';
import { createLogger, nullLogger, sanitizeFields } from './log.js';
import { allowAllPolicy } from './policy.js';
import { FixedStablePriceSource, RpcGasPriceSource, parseUsdMicro, type AllowedToken } from './pricing.js';
import { makeKeyring, quoteKeyId, signQuote, verifyQuote, type QuoteClaims } from './quoteToken.js';
import { QUOTE_TOKEN_PATTERN } from './validate.js';
import { revertToError } from './service.js';
import { CHAIN_ID, DEST, FEE_TO, FakeChain, OWNER, USDC } from './harness.testutil.js';

describe('codec', () => {
  it('parseObject enforces shape', () => {
    expect(parseObject({ a: 1 }, 'x', ['a'])).toEqual({ a: 1 });
    expect(() => parseObject(Object.create({ a: 1 }) as object, 'x', [])).toThrow(RelayerError);
    expect(() => parseObject([], 'x', [])).toThrow();
    expect(() => parseObject({ a: 1, b: 2 }, 'x', ['a'])).toThrow();
    expect(() => parseObject({}, 'x', ['a'])).toThrow();
    expect(parseObject(Object.create(null) as object, 'x', [])).toEqual({});
  });
  it('parses uints, ints, hex, addresses', () => {
    expect(parseUint('0', 'f')).toBe(0n);
    expect(parseUint('7', 'f', 1n, 7n)).toBe(7n);
    expect(() => parseUint('8', 'f', 1n, 7n)).toThrow();
    expect(() => parseUint('0', 'f', 1n)).toThrow();
    expect(parseInt53(5, 'f', 1, 5)).toBe(5);
    expect(() => parseInt53(NaN, 'f', 1, 5)).toThrow();
    expect(parseHex(`0x${'AB'.repeat(2)}`, 'f', 2)).toBe('0xabab');
    expect(() => parseHex('0xabab', 'f', 3)).toThrow();
    expect(parseAddress(USDC.toLowerCase(), 'f')).toBe(USDC);
    expect(() => parseAddress('0xZZ', 'f')).toThrow();
    expect(invalid('x').code).toBe('invalid_x');
  });
});

describe('quote token', () => {
  const secret = new Uint8Array(32).fill(1);
  const ring = makeKeyring(secret);
  const claims: QuoteClaims = { chainId: 1, token: USDC, owner: OWNER, destination: DEST, amount: 10n, fee: 2n, feeTo: FEE_TO, expiresAt: 1234 };
  const binding = { chainId: claims.chainId, token: claims.token, owner: claims.owner, destination: claims.destination, amount: claims.amount, feeTo: claims.feeTo };
  it('round-trips and binds every field', () => {
    const t = signQuote(ring.primary, claims);
    expect(t).toMatch(/^v2\.[0-9a-f]{8}\.1234\.2\.[0-9a-f]{64}$/);
    expect(verifyQuote(ring, t, binding)).toEqual({ fee: 2n, expiresAt: 1234 });
    for (const k of Object.keys(binding) as (keyof typeof binding)[]) {
      const other = k === 'chainId' ? 2 : k === 'amount' ? 11n : OWNER === binding[k] ? DEST : OWNER;
      expect(verifyQuote(ring, t, { ...binding, [k]: other })).toBeNull();
    }
    expect(verifyQuote(makeKeyring(new Uint8Array(32).fill(2)), t, binding)).toBeNull();
  });
  it('rejects malformed, tampered and unsafe-expiry tokens', () => {
    const t = signQuote(ring.primary, claims);
    expect(verifyQuote(ring, 'nope', binding)).toBeNull();
    expect(verifyQuote(ring, t.replace('.1234.', '.1235.'), binding)).toBeNull();
    expect(verifyQuote(ring, t.replace('.2.', '.1.'), binding)).toBeNull();
    expect(verifyQuote(ring, `v2.${ring.primary.id}.${'9'.repeat(12)}.2.${'0'.repeat(64)}`, binding)).toBeNull();
    const huge = signQuote(ring.primary, { ...claims, expiresAt: 10 ** 12 });
    expect(verifyQuote(ring, huge, binding)).toBeNull(); // 13 digits: outside the token pattern
  });
  it('S3-20: rejects non-canonical encodings (leading zeros) even when the MAC is otherwise valid', () => {
    const t = signQuote(ring.primary, claims);
    expect(verifyQuote(ring, t.replace('.1234.', '.001234.'), binding)).toBeNull();
    expect(verifyQuote(ring, t.replace('.2.', '.02.'), binding)).toBeNull();
    expect(QUOTE_TOKEN_PATTERN.test(t)).toBe(true);
    expect(QUOTE_TOKEN_PATTERN.test(t.replace('.1234.', '.01234.'))).toBe(false);
    expect(QUOTE_TOKEN_PATTERN.test(t.toUpperCase())).toBe(false);
    // the retired v1 format is refused
    expect(verifyQuote(ring, `v1.1234.2.${'0'.repeat(64)}`, binding)).toBeNull();
  });
  it('S3-21: key id selects the key; a previous key verifies during rotation but never signs', () => {
    const oldSecret = new Uint8Array(32).fill(5);
    const oldRing = makeKeyring(oldSecret);
    const issuedBefore = signQuote(oldRing.primary, claims);
    const rotated = makeKeyring(secret, oldSecret);
    expect(rotated.previous?.id).toBe(oldRing.primary.id);
    expect(verifyQuote(rotated, issuedBefore, binding)).toEqual({ fee: 2n, expiresAt: 1234 });
    expect(verifyQuote(ring, issuedBefore, binding)).toBeNull(); // window closed: previous key dropped
    expect(verifyQuote(rotated, signQuote(rotated.primary, claims), binding)).not.toBeNull();
    // unknown key id
    expect(verifyQuote(rotated, issuedBefore.replace(oldRing.primary.id, '00000000'), binding)).toBeNull();
    // the key id commits to the secret, so a previous equal to the current is a configuration mistake
    expect(() => makeKeyring(secret, secret)).toThrow(/differ/);
    expect(quoteKeyId(secret)).toHaveLength(8);
  });
});

describe('limiter primitives', () => {
  it('LruMap evicts the least recently used entry and validates its bound', () => {
    expect(() => new LruMap<string, number>(0)).toThrow();
    const m = new LruMap<string, number>(2);
    m.set('a', 1);
    m.set('b', 2);
    expect(m.get('a')).toBe(1);
    m.set('c', 3);
    expect(m.get('b')).toBeUndefined();
    expect(m.get('a')).toBe(1);
    expect(m.size).toBe(2);
    m.clear();
    expect(m.size).toBe(0);
  });
  it('KeyHasher is keyed, never echoes input, and rotates', () => {
    let t = 0;
    const h = new KeyHasher(1000, () => t);
    const a = h.hash('203.0.113.9');
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain('203');
    expect(h.hash('203.0.113.9')).toBe(a);
    expect(h.epoch).toBe(0);
    t = 1000;
    expect(h.epoch).toBe(1);
    expect(h.hash('203.0.113.9')).not.toBe(a);
  });
  it('RateLimiter bounds memory, refills, and resets on rotation', () => {
    let t = 0;
    const hasher = new KeyHasher(10_000, () => t);
    const rl = new RateLimiter({ perMinute: 60, burst: 2, maxKeys: 3 }, hasher, () => t);
    expect(rl.take('a').ok).toBe(true);
    expect(rl.take('a').ok).toBe(true);
    const denied = rl.take('a');
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterSeconds).toBe(1);
    t += 1000;
    expect(rl.take('a').ok).toBe(true);
    for (const k of ['b', 'c', 'd', 'e']) rl.take(k);
    expect(rl.take('a').ok).toBe(true); // 'a' was evicted: fresh bucket, memory stayed bounded
    t = 10_000; // salt rotation drops all state
    expect(rl.take('a').ok && rl.take('a').ok).toBe(true);
  });
});

describe('ChainLane and NonceManager', () => {
  it('validates its bound and serializes jobs', async () => {
    expect(() => new ChainLane(0)).toThrow();
    const lane = new ChainLane(3);
    const order: string[] = [];
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const a = lane.submit(() => {
      order.push('a-start');
      return Promise.resolve({ value: 'A', settled: gate.then(() => void order.push('a-settled')) });
    });
    const b = lane.submit(() => {
      order.push('b-start');
      return Promise.resolve({ value: 'B', settled: Promise.resolve() });
    });
    expect(await a).toBe('A');
    expect(lane.pending).toBe(2);
    release();
    expect(await b).toBe('B');
    await lane.drain();
    expect(order).toEqual(['a-start', 'a-settled', 'b-start']);
    expect(lane.pending).toBe(0);
  });
  it('propagates job failures, keeps the lane alive, and wraps non-errors', async () => {
    const lane = new ChainLane(2);
    await expect(lane.submit(() => Promise.reject(new Error('x')))).rejects.toThrow('x');
    await expect(lane.submit(() => Promise.reject(new Error('str')))).rejects.toThrow('str');
    expect((await lane.submit(() => Promise.resolve({ value: 1, settled: Promise.resolve() })))).toBe(1);
  });
  it('rejects when full or closed', async () => {
    const lane = new ChainLane(1);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const first = lane.submit(() => Promise.resolve({ value: 1, settled: gate }));
    await expect(lane.submit(() => Promise.resolve({ value: 2, settled: Promise.resolve() }))).rejects.toMatchObject({ code: 'queue_full' });
    release();
    await first;
    lane.close();
    await expect(lane.submit(() => Promise.resolve({ value: 3, settled: Promise.resolve() }))).rejects.toMatchObject({ code: 'shutting_down' });
  });
  it('NonceManager hands out sequential nonces and re-syncs on invalidate', async () => {
    const fetchPending = vi.fn(() => Promise.resolve(5));
    const n = new NonceManager(fetchPending);
    expect(await n.acquire()).toBe(5);
    expect(await n.acquire()).toBe(6);
    expect(fetchPending).toHaveBeenCalledTimes(1);
    n.invalidate();
    expect(await n.acquire()).toBe(5);
    expect(fetchPending).toHaveBeenCalledTimes(2);
  });
});

describe('DailyBudget', () => {
  it('reserves, releases, resets daily', () => {
    let t = 0;
    const b = new DailyBudget(100n, () => t);
    expect(b.reserve(60n)).toBe(true);
    expect(b.reserve(41n)).toBe(false);
    b.release(10n);
    expect(b.used).toBe(50n);
    b.release(1000n);
    expect(b.used).toBe(0n);
    expect(b.reserve(100n)).toBe(true);
    expect(b.secondsToReset()).toBe(86_400);
    t = 86_400_000;
    expect(b.used).toBe(0n);
    expect(b.reserve(100n)).toBe(true);
  });
});

describe('CircuitBreaker', () => {
  const opts = { windowSize: 4, minSamples: 2, failureRatio: 0.5, cooldownMs: 100 };
  it('opens at the failure ratio, probes after cooldown, closes on success', () => {
    let t = 0;
    const b = new CircuitBreaker(opts, () => t);
    b.recordSuccess();
    expect(b.allow()).toBe(true);
    b.recordFailure();
    expect(b.state).toBe('open');
    expect(b.isBlocking()).toBe(true);
    expect(b.allow()).toBe(false);
    t = 100;
    expect(b.isBlocking()).toBe(false);
    expect(b.allow()).toBe(true);
    expect(b.state).toBe('half_open');
    expect(b.allow()).toBe(false); // only one probe at a time
    b.recordSuccess();
    expect(b.state).toBe('closed');
  });
  it('re-opens when the probe fails, supports trip(), and keeps a sliding window', () => {
    let t = 0;
    const b = new CircuitBreaker(opts, () => t);
    b.trip();
    t = 100;
    b.allow();
    b.recordFailure();
    expect(b.state).toBe('open');
    t = 200;
    b.allow();
    b.recordSuccess();
    for (let i = 0; i < 8; i++) b.recordSuccess(); // window slides, old entries drop
    b.recordFailure();
    expect(b.state).toBe('closed');
  });
});

describe('logging', () => {
  it('sanitizes by construction', () => {
    expect(
      sanitizeFields({
        requestId: 'abcdef12-1234',
        route: '/v1/sweep',
        status: 200,
        chainId: 1,
        txHash: `0x${'ab'.repeat(32)}`,
        errorClass: 'nonce_used',
      }),
    ).toEqual({ requestId: 'abcdef12-1234', route: '/v1/sweep', status: 200, chainId: 1, txHash: `0x${'ab'.repeat(32)}`, errorClass: 'nonce_used' });
    expect(
      sanitizeFields({
        requestId: 'has spaces and 0xdeadbeef',
        route: '/v1/sweep?owner=0x1',
        status: 42,
        chainId: -1,
        txHash: '0x1234',
        errorClass: `0x${'1'.repeat(40)}`,
      }),
    ).toEqual({});
    expect(sanitizeFields({ status: 1.5 })).toEqual({});
  });
  it('ignores smuggled extra fields and bad event names', () => {
    const lines: string[] = [];
    const log = createLogger((l) => lines.push(l), () => 0);
    const smuggled = { requestId: 'abcdef12', owner: '0xSECRET', destination: '0xSECRET2', signature: 'sig' } as unknown as Parameters<typeof log.log>[2];
    log.log('info', 'ok_event', smuggled);
    log.log('warn', 'Bad Event 0xabc');
    log.log('error', 'plain', { errorClass: 'x_y' });
    expect(lines.join('')).not.toContain('SECRET');
    expect(lines.join('')).not.toContain('sig"');
    expect(JSON.parse(lines[0] as string)).toEqual({ ts: '1970-01-01T00:00:00.000Z', level: 'info', event: 'ok_event', requestId: 'abcdef12' });
    expect((JSON.parse(lines[1] as string) as { event: string }).event).toBe('invalid_event');
    nullLogger.log('info', 'x');
  });
  it('default clock works', () => {
    const lines: string[] = [];
    createLogger((l) => lines.push(l)).log('info', 'tick');
    expect((JSON.parse(lines[0] as string) as { ts: string }).ts).toMatch(/^\d{4}-/);
  });
});

describe('policy and pricing', () => {
  it('allow-all policy allows', async () => {
    expect(await allowAllPolicy.check({ chainId: 1, token: USDC, owner: OWNER, destination: DEST, amount: 1n })).toEqual({ allow: true });
  });
  it('parseUsdMicro', () => {
    expect(parseUsdMicro('3000')).toBe(3_000_000_000n);
    expect(parseUsdMicro('0.000001')).toBe(1n);
    expect(parseUsdMicro('1.5')).toBe(1_500_000n);
    for (const bad of ['0', '0.0', '-1', '1.1234567', '', 'abc', '1e3']) expect(() => parseUsdMicro(bad)).toThrow();
  });
  it('FixedStablePriceSource converts wei to token units rounding up', async () => {
    const tok: AllowedToken = { address: USDC, symbol: 'USDC', decimals: 6, permit: true, usdStable: true };
    const src = new FixedStablePriceSource(new Map([[1, 3_000_000_000n]]));
    // 1e18 wei * $3000 = 3000 USDC
    expect(await src.nativeToTokenUnits(1, tok, 10n ** 18n)).toBe(3_000_000_000n);
    expect(await src.nativeToTokenUnits(1, tok, 1n)).toBe(1n); // ceil
    expect(await src.nativeToTokenUnits(1, { ...tok, decimals: 18 }, 10n ** 18n)).toBe(3000n * 10n ** 18n);
    await expect(src.nativeToTokenUnits(2, tok, 1n)).rejects.toMatchObject({ code: 'chain_not_supported' });
  });
  it('RpcGasPriceSource reads from the chain client', async () => {
    const f = new FakeChain();
    const src = new RpcGasPriceSource(new Map([[CHAIN_ID, f]]));
    expect(await src.getGasPrice(CHAIN_ID)).toBe(1_000_000_000n);
    await expect(src.getGasPrice(5)).rejects.toMatchObject({ code: 'chain_not_supported' });
  });
});

describe('revert mapping', () => {
  it.each([
    ['NonceAlreadyUsed', 409, 'nonce_used'],
    ['Expired', 422, 'expired'],
    ['InvalidSignature', 422, 'invalid_signature'],
    ['ECDSAInvalidSignatureS', 422, 'invalid_signature'],
    ['PermitValueTooLow', 422, 'permit_value_too_low'],
    ['SafeERC20FailedOperation', 422, 'token_transfer_failed'],
    ['UnexpectedBalanceDelta', 422, 'token_transfer_failed'],
    ['ZeroAddress', 422, 'invalid_order'],
    ['SomethingElse', 422, 'simulation_reverted'],
    [undefined, 422, 'simulation_reverted'],
  ])('%s -> %i %s', (name, status, code) => {
    const e = revertToError(new SimulationRevert(name));
    expect([e.status, e.code]).toEqual([status, code]);
  });
});
