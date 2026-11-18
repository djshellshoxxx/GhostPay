import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { connect, type Socket } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { CHAIN_ID, FakeChain, NOW_MS, startHarness, testConfig, type Harness } from './harness.testutil.js';
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
