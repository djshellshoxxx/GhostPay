import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { connect, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { CHAIN_ID, FakeChain, NOW_MS, call, errCode, prepare, startHarness, testConfig, type Harness, type Reply } from './harness.testutil.js';
import type { RelayerConfig } from './config.js';
import type { PolicyDecision, PolicyGate } from './policy.js';
import { createLogger, createStdoutSink } from './log.js';
import { buildRelayer } from './runtime.js';

/**
 * Regression tests for relayer hardening that the octopus merge 84c2c185 dropped (lane L4). Each block names the
 * triage id it restores.
 */

let h: Harness | undefined;
afterEach(async () => {
  await h?.stop();
  h = undefined;
});

async function start(o: Parameters<typeof startHarness>[0] = {}): Promise<Harness> {
  h = await startHarness(o);
  return h;
}
const settle = (ms = 20): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('R07-3 / LF-074edb61e-8: a failing log sink never takes the process down', () => {
  it('createLogger swallows a sink that throws (ENOSPC, destroyed stream)', () => {
    const lg = createLogger(() => {
      throw new Error('write ENOSPC');
    });
    expect(() => lg.log('info', 'listening', {})).not.toThrow();
    expect(() => lg.log('error', 'request', { status: 500 })).not.toThrow();
  });

  it('the stdout sink swallows asynchronous stream errors (EPIPE) instead of an unhandled error event', async () => {
    class FakeStream extends EventEmitter {
      public writes = 0;
      public write(): boolean {
        this.writes += 1;
        queueMicrotask(() => this.emit('error', new Error('write EPIPE')));
        return true;
      }
    }
    const stream = new FakeStream();
    const sink = createStdoutSink(stream);
    sink('a');
    // An 'error' event without a listener throws from emit(); with the sink's listener it is dropped.
    await new Promise((r) => setTimeout(r, 5));
    expect(() => sink('b')).not.toThrow();
    await new Promise((r) => setTimeout(r, 5));
    expect(stream.writes).toBe(2);
  });

  it('the stdout sink swallows a write that throws synchronously (destroyed stream)', () => {
    const sink = createStdoutSink({
      on: () => undefined,
      write: () => {
        throw new Error('ERR_STREAM_DESTROYED');
      },
    });
    expect(() => sink('x')).not.toThrow();
  });

  it('the stdout sink writes one newline-terminated line per call', () => {
    const chunks: string[] = [];
    const sink = createStdoutSink({ on: () => undefined, write: (c: string) => chunks.push(c) });
    sink('{"a":1}');
    expect(chunks).toEqual(['{"a":1}\n']);
  });

  it('main.ts logs through the guarded stdout sink, not a bare process.stdout.write', () => {
    const src = readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
    expect(src).not.toMatch(/createLogger\(\s*\(line\)\s*=>\s*process\.stdout\.write/);
    expect(src).toMatch(/createLogger\(\s*createStdoutSink\(process\.stdout\)/);
  });

  it('a request served with a throwing log sink produces no unhandled rejection', async () => {
    const rejections: unknown[] = [];
    const onRejection = (e: unknown): void => {
      rejections.push(e);
    };
    const previous = process.listeners('unhandledRejection');
    process.removeAllListeners('unhandledRejection');
    process.on('unhandledRejection', onRejection);
    const logger = createLogger(() => {
      throw new Error('write EPIPE');
    });
    const relayer = await buildRelayer({
      config: testConfig(),
      hotKey: new Uint8Array(32).fill(3),
      quoteSecret: new Uint8Array(32).fill(9),
      logger,
      clients: new Map([[CHAIN_ID, new FakeChain()]]),
      now: () => NOW_MS,
    });
    try {
      const addr = await relayer.server.listen();
      const r = await fetch(`http://127.0.0.1:${String(addr.port)}/healthz`);
      expect(r.status).toBe(200);
      await r.text();
      const nf = await fetch(`http://127.0.0.1:${String(addr.port)}/nope`);
      expect(nf.status).toBe(404);
      await nf.text();
      await new Promise((res) => setTimeout(res, 50));
    } finally {
      await relayer.server.close();
      relayer.dispose();
      process.removeListener('unhandledRejection', onRejection);
      for (const l of previous) process.on('unhandledRejection', l as (...a: unknown[]) => void);
    }
    expect(rejections.map((e) => String(e))).toEqual([]);
  });
});

describe('LF-6f25385ce-1: per-peer TCP connection cap (server.maxConnectionsPerIp)', () => {
  const opened: Socket[] = [];
  afterEach(() => {
    for (const x of opened.splice(0)) x.destroy();
  });
  const port = (s: Harness): number => Number(new URL(s.url).port);
  const open = async (s: Harness): Promise<Socket> => {
    const sock = connect(port(s), '127.0.0.1');
    opened.push(sock);
    sock.once('error', () => undefined);
    await new Promise<void>((r) => sock.once('connect', () => r()));
    return sock;
  };
  /** Opens one more connection and reports whether the server closed it without a request. */
  const closedByServer = (s: Harness): Promise<boolean> => {
    const c = connect(port(s), '127.0.0.1');
    opened.push(c);
    c.once('error', () => undefined);
    return new Promise<boolean>((resolve) => {
      c.once('close', () => resolve(true));
      setTimeout(() => resolve(false), 1500);
    });
  };
  const healthzOver = (sock: Socket): Promise<string> => {
    sock.write('GET /healthz HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n');
    return new Promise<string>((resolve) => {
      let t = '';
      sock.on('data', (x: Buffer) => {
        t += x.toString();
      });
      sock.on('close', () => resolve(t));
    });
  };

  it('by default one peer cannot hold more than 64 concurrent connections', async () => {
    const s = await start();
    for (let i = 0; i < 64; i++) await open(s);
    expect(await closedByServer(s)).toBe(true);
  }, 30_000);

  it('caps concurrent connections per peer, counts the refusal and frees the slot on close', async () => {
    const s = await start({ config: { server: { maxConnectionsPerIp: 2 } } });
    const a = await open(s);
    await open(s);
    expect(await closedByServer(s)).toBe(true);
    expect(s.relayer.metrics.render()).toMatch(/relayer_connections_refused_total 1/);
    a.destroy();
    await settle(50);
    expect(await healthzOver(await open(s))).toContain('200 OK');
  });

  it('exempts trusted proxies from the per-peer cap', async () => {
    const s = await start({ config: { trustedProxies: ['127.0.0.0/8'], server: { maxConnectionsPerIp: 1 } } });
    const socks = [await open(s), await open(s), await open(s)];
    expect(await healthzOver(socks[2] as Socket)).toContain('200 OK');
  });
});

/** A promise with its resolver, so tests can hold work open and interleave concurrent requests. */
function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
const queueOf = (maxPending: number, maxPerClient: number): Partial<RelayerConfig> => ({ queue: { maxPending, maxPerClient, receiptTimeoutSeconds: 30 } });
/** Sweeps from distinct client addresses: the harness peer 127.0.0.1 is a trusted proxy in these tests. */
/** The error class of a reply, or `ok` for a 2xx. */
const codeOf = (r: Reply): string => (r.status < 300 ? 'ok' : errCode(r));
const asClient = (ip: string): Record<string, string> => ({ 'x-forwarded-for': ip });

describe('LF-074edb61e-4 / LF-2789f780b-2 / LF-29de09c05-1: per-client cap on lane slots (queue.maxPerClient)', () => {
  it('one client cannot hold every lane slot; its excess gets 429 client_queue_full and another client is still admitted', async () => {
    const s = await start({ config: { trustedProxies: ['127.0.0.1'], ...queueOf(8, 2) } });
    const gate = deferred();
    s.fake.sendGate = gate.promise;
    const bodies = await Promise.all([1n, 2n, 3n, 4n, 5n, 6n].map((nonce) => prepare(s, { nonce })));
    const attacker = bodies.map((b) => call(s, 'POST', '/v1/sweep', b.body, asClient('198.51.100.1')));
    await settle(150);
    const other = call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 7n })).body, asClient('203.0.113.9'));
    await settle(150);
    gate.resolve();
    const replies = await Promise.all(attacker);
    const codes = replies.map((r) => (r.status === 200 ? 'ok' : `${String(r.status)}:${errCode(r)}`)).sort();
    expect(codes).toEqual(['429:client_queue_full', '429:client_queue_full', '429:client_queue_full', '429:client_queue_full', 'ok', 'ok']);
    const refused = replies.find((r) => r.status === 429) as Reply;
    expect(refused.headers.get('retry-after')).toBe('5');
    expect((await other).status).toBe(200);
    expect(s.fake.sent).toHaveLength(3);
  });

  it('reserves the client slot before the first await, so concurrent requests cannot all pass the check (no overshoot)', async () => {
    const gate = deferred();
    let checks = 0;
    const policy: PolicyGate = {
      check: async (): Promise<PolicyDecision> => {
        checks += 1;
        await gate.promise;
        return { allow: true };
      },
    };
    const s = await start({ policy, config: { trustedProxies: ['127.0.0.1'], ...queueOf(8, 2) } });
    const bodies = await Promise.all([1n, 2n, 3n, 4n, 5n, 6n].map((nonce) => prepare(s, { nonce })));
    const pending = bodies.map((b) => call(s, 'POST', '/v1/sweep', b.body, asClient('198.51.100.1')));
    await settle(200);
    // All six requests are in flight at once; only the two that reserved a slot reach the (awaiting) policy gate.
    expect(checks).toBe(2);
    gate.resolve();
    const replies = await Promise.all(pending);
    expect(replies.filter((r) => r.status === 429 && errCode(r) === 'client_queue_full')).toHaveLength(4);
    expect(replies.filter((r) => r.status === 200)).toHaveLength(2);
  });

  it('holds the client slot until the lane slot is released (receipt settled), then frees it', async () => {
    const s = await start({ config: { trustedProxies: ['127.0.0.1'], ...queueOf(8, 2) } });
    const receipt = deferred();
    s.fake.receiptGate = receipt.promise;
    const client = asClient('198.51.100.1');
    const first = await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 1n })).body, client);
    expect(first.status).toBe(200); // answered at broadcast; the lane slot waits for the receipt
    const second = call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 2n })).body, client);
    await settle(100);
    const third = call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 3n })).body, client);
    const answered = await Promise.race([third.then((r) => `${String(r.status)}:${errCode(r)}`), settle(500).then(() => 'still queued')]);
    receipt.resolve();
    expect(answered).toBe('429:client_queue_full');
    expect((await second).status).toBe(200);
    await third;
    await settle(50);
    const fourth = await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 4n })).body, client);
    expect(fourth.status).toBe(200);
    await settle(50);
    expect(s.relayer.service.heldClientSlots(CHAIN_ID)).toBe(0);
  });

  it('frees the client slot when admission or the lane job fails', async () => {
    const s = await start({ config: { trustedProxies: ['127.0.0.1'], ...queueOf(8, 1) } });
    const client = asClient('198.51.100.1');
    s.fake.ownerBalance = 0n; // in-lane refusal
    for (const nonce of [1n, 2n]) {
      const r = await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce })).body, client);
      expect(`${String(r.status)}:${errCode(r)}`).toBe('422:insufficient_token_balance');
    }
    s.fake.ownerBalance = 10n ** 30n;
    const bad = await prepare(s, { nonce: 3n });
    const tampered = { ...bad.body, sweepSig: `0x${'00'.repeat(65)}` };
    const r = await call(s, 'POST', '/v1/sweep', tampered, client); // refused after the reservation (signature)
    expect(`${String(r.status)}:${errCode(r)}`).toBe('422:invalid_signature');
    const ok = await call(s, 'POST', '/v1/sweep', (await prepare(s, { nonce: 4n })).body, client);
    expect(ok.status).toBe(200);
    await settle(50);
    expect(s.relayer.service.heldClientSlots(CHAIN_ID)).toBe(0);
  });
});

describe('LF-29de09c05-4: a malformed request target answers 400 invalid_url, not 500', () => {
  /** Sends one raw request line (fetch normalizes targets) and returns the status code and body. */
  const raw = (s: Harness, target: string): Promise<{ status: number; body: string }> =>
    new Promise((resolve, reject) => {
      const sock = connect(Number(new URL(s.url).port), '127.0.0.1');
      let text = '';
      sock.once('error', reject);
      sock.on('data', (x: Buffer) => {
        text += x.toString();
      });
      sock.once('close', () => {
        const status = Number(/^HTTP\/1\.1 (\d{3})/.exec(text)?.[1] ?? 0);
        resolve({ status, body: text.slice(text.indexOf('\r\n\r\n') + 4) });
      });
      sock.write(`GET ${target} HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n`);
    });

  it.each(['//', '//[', '//a:b@', '//x:99999/'])('GET %s', async (target) => {
    const s = await start();
    const r = await raw(s, target);
    expect(r.status).toBe(400);
    expect(JSON.parse(r.body)).toEqual({ error: { code: 'invalid_url' } });
    const line = s.logs.map((l) => JSON.parse(l) as Record<string, unknown>).find((l) => l['event'] === 'request');
    expect(line).toMatchObject({ level: 'info', route: 'other', status: 400, errorClass: 'invalid_url' });
  });

  it('a well-formed path with an odd escape is still routed normally', async () => {
    const s = await start();
    expect((await raw(s, '/%zz')).status).toBe(404);
  });
});

describe('LF-074edb61e-7: non-canonical sweep signatures are refused before any RPC call', () => {
  const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  const parts = (sig: string): { r: string; s: bigint; v: number } => ({
    r: sig.slice(2, 66),
    s: BigInt(`0x${sig.slice(66, 130)}`),
    v: Number.parseInt(sig.slice(130, 132), 16),
  });
  const join = (r: string, s: bigint, v: number): string => `0x${r}${s.toString(16).padStart(64, '0')}${v.toString(16).padStart(2, '0')}`;
  const noChainWork = (s: Harness): { simulations: number; sent: number; gasReads: number } => ({
    simulations: s.fake.simulations,
    sent: s.fake.sent.length,
    gasReads: gasReads,
  });
  let gasReads = 0;

  it('rejects the malleable high-S twin (same owner recovers) as 422 invalid_signature with no chain work', async () => {
    const s = await start();
    const p = await prepare(s); // quotes, which reads the gas price once
    gasReads = 0;
    const original = s.fake.getGasPrice.bind(s.fake);
    s.fake.getGasPrice = () => {
      gasReads += 1;
      return original();
    };
    const { r, s: low, v } = parts(p.body['sweepSig'] as string);
    const twin = join(r, N - low, v === 27 ? 28 : 27);
    const reply = await call(s, 'POST', '/v1/sweep', { ...p.body, sweepSig: twin });
    expect({ status: reply.status, code: codeOf(reply), ...noChainWork(s) }).toEqual({ status: 422, code: 'invalid_signature', simulations: 0, sent: 0, gasReads: 0 });
    // The canonical original still goes through.
    expect((await call(s, 'POST', '/v1/sweep', p.body)).status).toBe(200);
  });

  it.each([
    ['the 0/1 encoding of the same recovery id (viem still recovers the owner)', (v: number) => v - 27],
    ['v = 29', () => 29],
  ])('rejects %s with no chain work', async (_name, toV) => {
    const s = await start();
    const p = await prepare(s);
    const { r, s: low, v } = parts(p.body['sweepSig'] as string);
    const reply = await call(s, 'POST', '/v1/sweep', { ...p.body, sweepSig: join(r, low, toV(v)) });
    expect({ status: reply.status, code: codeOf(reply), simulations: s.fake.simulations, sent: s.fake.sent.length }).toEqual({ status: 422, code: 'invalid_signature', simulations: 0, sent: 0 });
  });

  it('a refused non-canonical signature is not an owner strike', async () => {
    const s = await start();
    const p = await prepare(s);
    const { r, s: low, v } = parts(p.body['sweepSig'] as string);
    for (let i = 0; i < 4; i++) {
      const reply = await call(s, 'POST', '/v1/sweep', { ...p.body, sweepSig: join(r, N - low, v === 27 ? 28 : 27) });
      expect(codeOf(reply)).toBe('invalid_signature');
    }
    expect((await call(s, 'POST', '/v1/sweep', p.body)).status).toBe(200);
  });
});
