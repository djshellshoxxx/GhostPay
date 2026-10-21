import { createConnection } from 'node:net';
import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it } from 'vitest';
import { privateKeyToAccount } from 'viem/accounts';
import { hexToBytes, bytesToHex, type Hex } from 'viem';
import { buildSweepTypedData } from '@ghostpay/chain-adapters';
import { ChainLane } from './lane.js';
import { DailyBudget } from './budget.js';
import { createLogger, createStdoutSink } from './log.js';
import { KeyHasher, RateLimiter } from './limiter.js';
import { RelayerHttpServer, resolveClientIp } from './server.js';
import { parseConfig, type ConfigContext } from './config.js';
import { CHAIN_ID, DEST, HOT_ADDRESS, ORIGIN, OWNER, OWNER_KEY, SWEEP_CONTRACT, USDC, call, errCode, prepare, startHarness, testConfig, type Harness } from './harness.testutil.js';

let h: Harness | undefined;
afterEach(async () => {
  await h?.stop();
  h = undefined;
});
async function start(o: Parameters<typeof startHarness>[0] = {}): Promise<Harness> {
  h = await startHarness(o);
  return h;
}
const settle = (ms = 30): Promise<void> => new Promise((r) => setTimeout(r, ms));
const chainOver = (over: Record<string, unknown>) => ({ chains: [{ ...(testConfig().chains[0] as object), ...over }] }) as never;
const sweepBody = async (s: Harness, nonce: bigint, extra = {}): Promise<Record<string, unknown>> => (await prepare(s, { nonce, ...extra })).body;
const post = (s: Harness, body: unknown) => call(s, 'POST', '/v1/sweep', body);

describe('S2 RPC failures before the lane feed the breaker', () => {
  it('eth_gasPrice failing inside the lane opens the breaker and degrades /healthz', async () => {
    const s = await start();
    const bodies = await Promise.all([1n, 2n, 3n, 4n].map((n) => sweepBody(s, n)));
    s.fake.getGasPrice = () => Promise.reject(new Error('down'));
    const codes: string[] = [];
    for (const b of bodies) codes.push(errCode(await post(s, b)));
    expect(codes).toEqual(['rpc_unavailable', 'rpc_unavailable', 'rpc_unavailable', 'breaker_open']);
    const hz = await call(s, 'GET', '/healthz');
    expect(hz.status).toBe(503);
    expect((hz.json as { status: string }).status).toBe('degraded');
  });

  it('the pre-lane funding check failing (all RPC down) opens the breaker', async () => {
    const s = await start();
    const bodies = await Promise.all([1n, 2n, 3n, 4n].map((n) => sweepBody(s, n)));
    s.fake.rpcDown = true;
    const codes: string[] = [];
    for (const b of bodies) codes.push(errCode(await post(s, b)));
    expect(codes).toEqual(['rpc_unavailable', 'rpc_unavailable', 'rpc_unavailable', 'breaker_open']);
    expect((await call(s, 'GET', '/healthz')).status).toBe(503);
  });

  it('quote-time gas price failures feed the breaker, and the breaker recovers after the cooldown', async () => {
    const s = await start();
    const body = await sweepBody(s, 1n);
    s.fake.getGasPrice = () => Promise.reject(new Error('down'));
    const q = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };
    for (let i = 0; i < 3; i++) expect(errCode(await call(s, 'POST', '/v1/quote', q))).toBe('rpc_unavailable');
    expect(s.relayer.service.health().status).toBe('degraded');
    s.clock.ms += 61_000;
    s.fake.getGasPrice = () => Promise.resolve(1_000_000_000n);
    expect((await post(s, body)).status).toBe(200);
    expect(s.relayer.service.health().status).toBe('ok');
  });
});

describe('breaker and mined reverts (front-running)', () => {
  it('reverts caused by a third party who consumed the order do not trip the breaker', async () => {
    const s = await start();
    s.fake.receipt = { status: 'reverted', gasUsed: 40_000n };
    for (let n = 1n; n <= 8n; n++) {
      expect((await post(s, await sweepBody(s, n))).status).toBe(200);
      await settle();
    }
    expect(s.relayer.service.health().status).toBe('ok');
    expect(s.logs.join('\n')).toContain('mined_revert_front_run');
    s.fake.receipt = { status: 'success', gasUsed: 100_000n };
    expect((await post(s, await sweepBody(s, 20n))).status).toBe(200);
  });

  it('reverts that a re-simulation cannot explain still count against the breaker', async () => {
    const s = await start();
    s.fake.waitForReceipt = () => {
      s.fake.used.clear(); // the order is NOT consumed: the revert has no third-party explanation
      s.fake.inFlight -= 1;
      return Promise.resolve({ status: 'reverted', gasUsed: 40_000n });
    };
    const codes: string[] = [];
    for (let n = 1n; n <= 4n; n++) {
      const r = await post(s, await sweepBody(s, n));
      codes.push(r.status === 200 ? 'ok' : errCode(r));
      await settle();
    }
    expect(codes).toEqual(['ok', 'ok', 'breaker_open', 'breaker_open']);
    expect(s.logs.join('\n')).toContain('mined_revert');
  });

  it('a failing re-simulation counts as a failure (inconclusive)', async () => {
    const s = await start();
    s.fake.waitForReceipt = () => {
      s.fake.simulateError = new Error('rpc down');
      s.fake.inFlight -= 1;
      return Promise.resolve({ status: 'reverted', gasUsed: 40_000n });
    };
    expect((await post(s, await sweepBody(s, 1n))).status).toBe(200);
    await settle();
    expect(s.logs.join('\n')).toContain('"errorClass":"mined_revert"');
  });
});

describe('X-Forwarded-For parsing and trustProxyHops config', () => {
  it('resolveClientIp takes the rightmost trusted hop and rejects non-IP values', () => {
    expect(resolveClientIp('9.9.9.9, 1.1.1.1', '127.0.0.1', 1)).toBe('1.1.1.1');
    expect(resolveClientIp('9.9.9.9, 1.1.1.1', '127.0.0.1', 2)).toBe('9.9.9.9');
    expect(resolveClientIp('9.9.9.9', '127.0.0.1', 2)).toBe('127.0.0.1'); // fewer entries than hops
    expect(resolveClientIp('1.1.1.1', '127.0.0.1', 0)).toBe('127.0.0.1');
    expect(resolveClientIp('spoof, junk', '127.0.0.1', 1)).toBe('127.0.0.1');
    expect(resolveClientIp('1.1.1.1, <script>', '127.0.0.1', 1)).toBe('127.0.0.1');
    expect(resolveClientIp('', '127.0.0.1', 1)).toBe('127.0.0.1');
    expect(resolveClientIp(undefined, undefined, 1)).toBe('unknown');
    expect(resolveClientIp('::ffff:1.2.3.4', 'p', 1)).toBe('1.2.3.4'); // mapped IPv4 -> same bucket as IPv4
    expect(resolveClientIp('2001:DB8::1', 'p', 1)).toBe('2001:db8::1');
    expect(resolveClientIp('1.1.1.1', 'p', 1)).toBe('1.1.1.1');
    expect(resolveClientIp('1.2.3.4%eth0', 'p', 1)).toBe('p');
  });

  it('garbage X-Forwarded-For values cannot mint new rate-limit buckets', async () => {
    const lim = { ipPerMinute: 1, ipBurst: 1, ownerPerMinute: 60, ownerBurst: 20, maxKeys: 100, saltRotationHours: 24 };
    const q = { chainId: CHAIN_ID, token: USDC, owner: OWNER, destination: DEST, amount: '100000000' };
    const s = await start({ config: { rateLimit: lim, trustProxyHops: 1 } });
    expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': 'junk-1' })).status).toBe(200);
    expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': 'junk-2' })).status).toBe(429);
    expect((await call(s, 'POST', '/v1/quote', q, { 'x-forwarded-for': 'junk-3' })).status).toBe(429);
  });

  const ctx: ConfigContext = { env: {}, hotKeyAddress: HOT_ADDRESS, readManifest: () => undefined };
  const cfg = (listen: object, hops: number) =>
    parseConfig(
      {
        allowedOrigins: [ORIGIN],
        listen,
        trustProxyHops: hops,
        chains: [
          {
            chainId: 11155111, rpcUrl: 'https://rpc.example/key', sweepRelayer: SWEEP_CONTRACT, tokens: [{ address: USDC, usdStable: true }],
            nativeUsdPrice: '3000.5', gasUnits: { sweep: '100000', sweepWithPermit: '130000' }, maxGasLimit: '400000',
            maxGasPriceWei: '50000000000', dailyBudgetWei: '100000000000000000', minBalanceWei: '1000000000000000',
          },
        ],
      },
      ctx,
    );
  it('refuses trustProxyHops > 0 on a public IP literal, where no proxy can be in front', () => {
    expect(() => cfg({ host: '203.0.113.7' }, 1)).toThrow(/trustProxyHops/);
    expect(() => cfg({ host: '2001:db8::1' }, 1)).toThrow(/trustProxyHops/);
    expect(cfg({ host: '203.0.113.7' }, 0).host).toBe('203.0.113.7');
    expect(() => cfg({ host: '::ffff:203.0.113.7' }, 1)).toThrow(/trustProxyHops/);
    for (const host of ['::ffff:10.0.0.1', '100.64.0.1', '169.254.1.1', '0:0:0:0:0:0:0:1', '127.0.0.1', '::1', 'localhost', '10.1.2.3', '192.168.0.9', '172.16.0.1', '0.0.0.0', '::', 'fd00::1', 'fe80::1']) {
      expect(cfg({ host }, 1).trustProxyHops).toBe(1);
    }
  });
});

describe('per-client lane fairness (queue.maxPerClient)', () => {
  it('ChainLane caps pending jobs per group but admits other groups', async () => {
    const lane = new ChainLane(4, 2);
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    const job = () => Promise.resolve({ value: 1, settled: gate });
    const a1 = lane.submit(job, 'a');
    const a2 = lane.submit(job, 'a');
    await expect(lane.submit(job, 'a')).rejects.toMatchObject({ status: 429, code: 'client_queue_full' });
    const b1 = lane.submit(job, 'b');
    release();
    await Promise.all([a1, a2, b1]);
    // slots are given back
    await expect(lane.submit(() => Promise.resolve({ value: 7, settled: Promise.resolve() }), 'a')).resolves.toBe(7);
  });

  it('one client IP cannot take every slot; another client still gets in', async () => {
    const s = await start({ config: { trustProxyHops: 1, queue: { maxPending: 4, maxPerClient: 2, receiptTimeoutSeconds: 30 } } });
    let release: () => void = () => undefined;
    s.fake.receiptGate = new Promise<void>((r) => { release = r; });
    const ipA = { 'x-forwarded-for': '198.51.100.1' };
    const ipB = { 'x-forwarded-for': '198.51.100.2' };
    const bodies = await Promise.all([1n, 2n, 3n, 4n].map((n) => sweepBody(s, n)));
    const first = call(s, 'POST', '/v1/sweep', bodies[0], ipA);
    const second = call(s, 'POST', '/v1/sweep', bodies[1], ipA);
    await settle();
    const third = await call(s, 'POST', '/v1/sweep', bodies[2], ipA);
    expect(third.status).toBe(429);
    expect(errCode(third)).toBe('client_queue_full');
    const other = call(s, 'POST', '/v1/sweep', bodies[3], ipB);
    await settle();
    release();
    expect([(await first).status, (await second).status, (await other).status]).toEqual([200, 200, 200]);
  });

  it('config default is 3/4 of maxPending (at least 1) and is bounded by maxPending', () => {
    const ctx: ConfigContext = { env: {}, hotKeyAddress: HOT_ADDRESS, readManifest: () => undefined };
    const mk = (queue: object) =>
      parseConfig(
        {
          allowedOrigins: [ORIGIN], queue,
          chains: [{
            chainId: 11155111, rpcUrl: 'https://rpc.example/key', sweepRelayer: SWEEP_CONTRACT, tokens: [{ address: USDC, usdStable: true }],
            nativeUsdPrice: '3000.5', gasUnits: { sweep: '100000', sweepWithPermit: '130000' }, maxGasLimit: '400000',
            maxGasPriceWei: '50000000000', dailyBudgetWei: '100000000000000000', minBalanceWei: '1000000000000000',
          }],
        },
        ctx,
      ).queue;
    expect(mk({}).maxPerClient).toBe(12);
    expect(mk({ maxPending: 1 }).maxPerClient).toBe(1);
    expect(mk({ maxPending: 2 }).maxPerClient).toBe(1);
    expect(mk({ maxPending: 8, maxPerClient: 8 }).maxPerClient).toBe(8);
    expect(() => mk({ maxPending: 4, maxPerClient: 5 })).toThrow(/maxPerClient/);
    expect(() => mk({ maxPerClient: 0 })).toThrow(/maxPerClient/);
  });
});

describe('daily budget on receipt timeout', () => {
  const budget = chainOver({ dailyBudgetWei: 26n * 10n ** 13n });
  it('a reservation whose receipt later arrives is reconciled to the gas used', async () => {
    const s = await start({ config: budget });
    let calls = 0;
    s.fake.waitForReceipt = () => {
      calls += 1;
      s.fake.inFlight -= 1;
      return Promise.resolve(calls === 1 ? { status: 'timeout' as const, gasUsed: 0n } : { status: 'success' as const, gasUsed: 100_000n });
    };
    expect((await post(s, await sweepBody(s, 1n))).status).toBe(200);
    await settle(80);
    // reserved 1.5e14 of 2e14; reconciled to 1e14 -> a second sweep (1.5e14 reservation) fits
    expect((await post(s, await sweepBody(s, 2n))).status).toBe(200);
  });

  it('a transaction that never appears is released after the reconciliation attempts', async () => {
    const s = await start({ config: budget });
    s.fake.waitForReceipt = () => {
      s.fake.inFlight -= 1;
      return Promise.resolve({ status: 'timeout' as const, gasUsed: 0n });
    };
    expect((await post(s, await sweepBody(s, 1n))).status).toBe(200);
    await settle(80);
    expect((await post(s, await sweepBody(s, 2n))).status).toBe(200);
    expect(s.logs.join('\n')).toContain('receipt_unresolved');
  });

  it('reconciliation does not hold the lane slot', async () => {
    const s = await start();
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    let calls = 0;
    s.fake.waitForReceipt = async () => {
      calls += 1;
      s.fake.inFlight -= 1;
      if (calls > 1) await gate;
      return { status: 'timeout' as const, gasUsed: 0n };
    };
    expect((await post(s, await sweepBody(s, 1n))).status).toBe(200);
    expect((await post(s, await sweepBody(s, 2n))).status).toBe(200); // lane is free although reconciliation of #1 is pending
    release();
    await settle(80);
  });

  it('stops reconciling once the service is shutting down', async () => {
    const s = await start();
    let calls = 0;
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => { release = r; });
    s.fake.waitForReceipt = async () => {
      calls += 1;
      s.fake.inFlight -= 1;
      if (calls === 2) await gate; // first reconciliation wait
      return { status: 'timeout' as const, gasUsed: 0n };
    };
    expect((await post(s, await sweepBody(s, 1n))).status).toBe(200);
    await settle();
    await s.relayer.service.shutdown();
    release();
    await settle(80);
    expect(calls).toBe(2);
    expect(s.logs.join('\n')).not.toContain('receipt_unresolved');
  });
});

describe('fee must still cover gas at send time (RA-FG-3)', () => {
  it('refuses, before simulating, when gas rose so far that the signed fee is below cost', async () => {
    const s = await start();
    const body = await sweepBody(s, 1n);
    s.fake.gasPrice = 40_000_000_000n;
    const r = await post(s, body);
    expect(r.status).toBe(422);
    expect(errCode(r)).toBe('fee_below_gas');
    expect(s.fake.simulations).toBe(0);
    expect(s.fake.sent).toHaveLength(0);
  });
  it('still sends when gas rose within the quoted margin', async () => {
    const s = await start();
    const body = await sweepBody(s, 1n);
    s.fake.gasPrice = 1_200_000_000n;
    expect((await post(s, body)).status).toBe(200);
  });
  it('does not feed the breaker (market-caused) and releases a half-open probe', async () => {
    const s = await start();
    const bodies = await Promise.all([1n, 2n, 3n, 4n, 5n].map((n) => sweepBody(s, n)));
    s.fake.gasPrice = 40_000_000_000n;
    for (let i = 0; i < 4; i++) expect(errCode(await post(s, bodies[i]))).toBe('fee_below_gas');
    expect(s.relayer.service.health().status).toBe('ok');
    s.fake.gasPrice = 1_000_000_000n;
    expect((await post(s, bodies[4])).status).toBe(200);
  });
  it('the permit path compares against the permit gas units', async () => {
    const s = await start();
    const body = await sweepBody(s, 1n, { permit: true });
    s.fake.gasPrice = 40_000_000_000n;
    expect(errCode(await post(s, body))).toBe('fee_below_gas');
  });
});

describe('high-S / non-canonical signatures', () => {
  const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const twin = (sig: Hex): Hex => {
    const b = hexToBytes(sig);
    const s = BigInt(bytesToHex(b.slice(32, 64)));
    const hs = (N - s).toString(16).padStart(64, '0');
    const out = new Uint8Array(65);
    out.set(b.slice(0, 32), 0);
    out.set(hexToBytes(`0x${hs}`), 32);
    out[64] = b[64] === 27 ? 28 : 27;
    return bytesToHex(out);
  };
  it('rejects the malleable twin of a valid signature before any RPC call', async () => {
    const s = await start();
    const good = await sweepBody(s, 1n);
    const bad = { ...good, sweepSig: twin(good['sweepSig'] as Hex) };
    const r = await post(s, bad);
    expect(r.status).toBe(422);
    expect(errCode(r)).toBe('invalid_signature');
    expect(s.fake.fundingChecks).toBe(0);
    expect(s.fake.simulations).toBe(0);
    expect((await post(s, good)).status).toBe(200); // the canonical original still works
  });
  it('rejects v outside 27/28 (the contract would revert on it)', async () => {
    const s = await start();
    const good = await sweepBody(s, 1n);
    const sig = good['sweepSig'] as Hex;
    const b = hexToBytes(sig);
    b[64] = (b[64] as number) - 27; // 0/1 form is accepted by viem recovery but not by the contract
    const r = await post(s, { ...good, sweepSig: bytesToHex(b) });
    expect(errCode(r)).toBe('invalid_signature');
    expect(s.fake.simulations).toBe(0);
  });
  it('the twin really recovers the same owner (the claim is real)', async () => {
    const s = await start();
    const good = await sweepBody(s, 1n);
    const { recoverTypedDataAddress } = await import('viem');
    const sw = good['sweep'] as Record<string, string>;
    const td = buildSweepTypedData(CHAIN_ID, SWEEP_CONTRACT, {
      token: sw['token'] as never, owner: sw['owner'] as never, destination: sw['destination'] as never, feeTo: sw['feeTo'] as never,
      amount: BigInt(sw['amount'] as string), fee: BigInt(sw['fee'] as string), deadline: BigInt(sw['deadline'] as string), nonce: BigInt(sw['nonce'] as string),
    });
    const args = { domain: td.domain, types: td.types, primaryType: td.primaryType, message: td.message } as const;
    expect(await recoverTypedDataAddress({ ...args, signature: twin(good['sweepSig'] as Hex) })).toBe(privateKeyToAccount(OWNER_KEY).address);
  });
});

describe('log sink failures are never fatal', () => {
  it('createLogger swallows a throwing sink', () => {
    const lg = createLogger(() => {
      throw new Error('ENOSPC');
    });
    expect(() => lg.log('info', 'listening', {})).not.toThrow();
  });
  it('stdout sink swallows stream errors (ENOSPC/EPIPE) instead of an unhandled error event', () => {
    class Fake extends EventEmitter {
      public writes = 0;
      public write(): boolean {
        this.writes += 1;
        queueMicrotask(() => this.emit('error', new Error('write EPIPE')));
        return true;
      }
    }
    const f = new Fake();
    const sink = createStdoutSink(f);
    sink('a');
    return new Promise<void>((resolve) => {
      queueMicrotask(() =>
        queueMicrotask(() => {
          expect(() => sink('b')).not.toThrow();
          expect(f.writes).toBeGreaterThanOrEqual(1);
          resolve();
        }),
      );
    });
  });
  it('a write that throws synchronously (destroyed stream) is swallowed', () => {
    const sink = createStdoutSink({
      on: () => undefined,
      write: () => {
        throw new Error('ERR_STREAM_DESTROYED');
      },
    });
    expect(() => sink('x')).not.toThrow();
  });
});

describe('connection timeouts are enforced promptly', () => {
  it('a client dripping headers is closed shortly after headersTimeout, not after the 30 s default sweep', async () => {
    const s = await start();
    const limiter = new RateLimiter({ perMinute: 60, burst: 10, maxKeys: 10 }, new KeyHasher(3_600_000, () => Date.now()), () => Date.now());
    const server = new RelayerHttpServer({
      config: testConfig(),
      service: s.relayer.service,
      ipLimiter: limiter,
      timeouts: { headersTimeoutMs: 300, requestTimeoutMs: 600, keepAliveTimeoutMs: 300 },
    });
    const addr = await server.listen();
    try {
      const t0 = Date.now();
      const closedAt = await new Promise<number>((resolve) => {
        const sock = createConnection({ port: addr.port, host: '127.0.0.1' }, () => {
          sock.write('GET /healthz HTTP/1.1\r\nHost: x\r\n'); // never finishes the header block
        });
        sock.on('close', () => resolve(Date.now() - t0));
        sock.on('error', () => undefined);
        sock.resume();
        setTimeout(() => {
          sock.destroy();
        }, 6_000);
      });
      expect(closedAt).toBeLessThan(3_500);
    } finally {
      await server.close();
    }
  }, 15_000);

  it('an idle connection that never sends a byte is reaped', async () => {
    const s = await start();
    const limiter = new RateLimiter({ perMinute: 60, burst: 10, maxKeys: 10 }, new KeyHasher(3_600_000, () => Date.now()), () => Date.now());
    const server = new RelayerHttpServer({
      config: testConfig(),
      service: s.relayer.service,
      ipLimiter: limiter,
      timeouts: { headersTimeoutMs: 300, requestTimeoutMs: 600, keepAliveTimeoutMs: 300 },
    });
    const addr = await server.listen();
    try {
      const t0 = Date.now();
      const closedAt = await new Promise<number>((resolve) => {
        const sock = createConnection({ port: addr.port, host: '127.0.0.1' });
        sock.on('close', () => resolve(Date.now() - t0));
        sock.on('error', () => undefined);
        sock.resume();
        setTimeout(() => {
          sock.destroy();
        }, 6_000);
      });
      expect(closedAt).toBeLessThan(3_500);
    } finally {
      await server.close();
    }
  }, 15_000);
});

describe('budget release across the UTC day boundary', () => {
  it('a late release for yesterday does not reduce today\'s spend', () => {
    let now = 1_000_000;
    const b = new DailyBudget(100n, () => now);
    const day = b.dayIndex();
    expect(b.reserve(60n)).toBe(true);
    now += 86_400_000;
    expect(b.reserve(50n)).toBe(true);
    b.release(60n, day); // belongs to yesterday: dropped
    expect(b.used).toBe(50n);
    b.release(10n, b.dayIndex());
    expect(b.used).toBe(40n);
  });
});

describe('ChainLane constructor', () => {
  it('rejects a non-positive per-group cap', () => {
    expect(() => new ChainLane(4, 0)).toThrow(/maxPerGroup/);
  });
});
