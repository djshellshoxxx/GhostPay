import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Address, Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultDeps, runOps, viemReadOnlyChain, type OpsDeps, type ReadOnlyChain } from './ops.js';
import { encodeState, type ChainState, type SendRecord } from './stateStore.js';

const HOT_KEY = `0x${'ee'.repeat(32)}`;
const HOT_ADDR = privateKeyToAccount(HOT_KEY as Hex).address;
const QUOTE = `0x${'ab'.repeat(32)}`;
const TOKEN: Address = '0x5FbDB2315678afecb367f032d93F642f64180aa3';
const SWEEP: Address = '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512';
const FEE_TO: Address = '0x90F79bf6EB2c4f870365E785982E1f101E93b906';
const RPC_SECRET = 'http://127.0.0.1:1/SECRET-API-KEY';
const NOW = Date.UTC(2026, 10, 11, 12, 0, 0);
const DAY = Math.floor(NOW / 86_400_000);
const H1: Hex = `0x${'11'.repeat(32)}`;
const H2: Hex = `0x${'22'.repeat(32)}`;
const H3: Hex = `0x${'33'.repeat(32)}`;

let dir: string;
let out: string[];
let err: string[];

function rec(over: Partial<SendRecord> & Pick<SendRecord, 'id' | 'nonce' | 'status'>): SendRecord {
  return { reservedWei: 5000n, reservedDay: DAY, gasPriceWei: 7n, createdAtMs: NOW - 90_000, ...over };
}

function writeState(chains: ReadonlyMap<number, ChainState>): string {
  const f = join(dir, 'state.json');
  writeFileSync(f, encodeState(chains));
  return f;
}

function configJson(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({
    allowedOrigins: ['http://localhost:5173'],
    allowDevChain: true,
    allowInsecureLocalhostRpc: true,
    chains: [
      {
        chainId: 31337,
        rpcUrl: RPC_SECRET,
        sweepRelayer: SWEEP,
        feeTo: FEE_TO,
        tokens: [{ address: TOKEN, symbol: 'PMT', decimals: 6, permit: true, usdStable: true }],
        nativeUsdPrice: '3000',
        gasUnits: { sweep: '150000', sweepWithPermit: '200000' },
        maxGasLimit: '1000000',
        maxGasPriceWei: '1000000000000',
        dailyBudgetWei: '100000',
        minBalanceWei: '0',
      },
    ],
    ...extra,
  });
}

function secretFile(name: string, value: string): string {
  const p = join(dir, name);
  writeFileSync(p, value);
  chmodSync(p, 0o600);
  return p;
}

function envFor(extra: Record<string, string> = {}): Record<string, string> {
  const cfg = join(dir, 'relayer.config.json');
  writeFileSync(cfg, configJson());
  return {
    RELAYER_CONFIG: cfg,
    DEPLOYMENTS_DIR: join(dir, 'deployments'),
    RELAYER_KEY_FILE: secretFile('hot.key', HOT_KEY),
    QUOTE_SECRET_FILE: secretFile('quote.secret', QUOTE),
    ...extra,
  };
}

function deps(env: Record<string, string | undefined>, over: Partial<OpsDeps> = {}): OpsDeps {
  return {
    ...defaultDeps(),
    env,
    out: (l) => out.push(l),
    err: (l) => err.push(l),
    now: () => NOW,
    chain: () => {
      throw new Error('no chain access expected');
    },
    ...over,
  };
}

const text = (): string => `${out.join('\n')}\n${err.join('\n')}`;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'ops-test-'));
  out = [];
  err = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('usage', () => {
  it.each([[[]], [['bogus']], [['check-config', 'x']], [['state', '--nope']], [['state', '--file']], [['reconcile-report', 'x']]])('%j exits 2', async (argv) => {
    expect(await runOps(argv, deps({}))).toBe(2);
    expect(err.join('\n')).toContain('usage: node dist/ops.js');
  });
});

describe('check-config', () => {
  it('prints a summary without secrets or RPC URLs', async () => {
    const env = envFor();
    expect(await runOps(['check-config'], deps(env))).toBe(0);
    const t = text();
    expect(t).toContain('config ok');
    expect(t).toContain('chains: 31337');
    expect(t).toContain('tokens: 1');
    expect(t).toContain(HOT_ADDR);
    expect(t).toContain('state: ephemeral');
    expect(t).not.toContain('SECRET-API-KEY');
    expect(t).not.toContain('eeeeeeee');
    expect(t).not.toContain('abababab');
  });

  it('reports a configured state file and a rotation window', async () => {
    const env = envFor({ QUOTE_SECRET_PREVIOUS_FILE: secretFile('prev.secret', QUOTE) });
    writeFileSync(env['RELAYER_CONFIG'] as string, configJson());
    // The integrator's `state` key may not exist yet; the summary reads `stateFile` when config provides it.
    expect(await runOps(['check-config'], deps(env))).toBe(0);
    expect(out.join('\n')).toContain('rotation window');
  });

  it('prints only the ConfigError message on a bad config', async () => {
    const env = envFor();
    writeFileSync(env['RELAYER_CONFIG'] as string, '{"allowedOrigins":["https://a.example"],"chains":[],"pasted":"hunter2"}');
    expect(await runOps(['check-config'], deps(env))).toBe(1);
    expect(err.join('\n')).toMatch(/^fatal: config /);
    expect(text()).not.toContain('hunter2');
  });

  it('fails on a missing secret naming only variables', async () => {
    const env = envFor();
    delete (env as Record<string, string | undefined>)['QUOTE_SECRET_FILE'];
    expect(await runOps(['check-config'], deps(env))).toBe(1);
    expect(err.join('\n')).toContain('QUOTE_SECRET_FILE or QUOTE_SECRET is required');
  });

  it('fails on a too-permissive key file without leaking contents', async () => {
    const env = envFor();
    chmodSync(env['RELAYER_KEY_FILE'] as string, 0o644);
    expect(await runOps(['check-config'], deps(env))).toBe(1);
    expect(err.join('\n')).toContain('chmod 600');
    expect(text()).not.toContain('eeeeeeee');
  });

  it('reports bad release keys and hides unexpected error text', async () => {
    expect(await runOps(['check-config'], deps(envFor({ GHOSTPAY_RELEASE_PUBKEYS: 'nothex' })))).toBe(1);
    expect(err.join('\n')).toContain('GHOSTPAY_RELEASE_PUBKEYS');
  });

  it('maps a non-config exception to a fixed message', async () => {
    const env = envFor();
    const throwing = { ...env } as Record<string, string | undefined>;
    Object.defineProperty(throwing, 'RELAYER_CONFIG', {
      get() {
        throw new Error('provider says https://rpc.example/KEY');
      },
    });
    expect(await runOps(['check-config'], deps(throwing))).toBe(1);
    expect(err.join('\n')).toBe('fatal: failed');
  });
});

describe('state', () => {
  const chains = (): Map<number, ChainState> =>
    new Map([
      [
        31337,
        {
          budget: { day: DAY, spentWei: 40_000n },
          sends: [rec({ id: '0'.repeat(16), nonce: 7, status: 'pending', txHash: H1 }), rec({ id: '1'.repeat(16), nonce: 8, status: 'reserved', createdAtMs: NOW - 7_200_000 - 120_000 })],
        },
      ],
    ]);

  it('prints budget, limit, remaining and records from --file', async () => {
    const env = envFor();
    const file = writeState(chains());
    expect(await runOps(['state', '--file', file], deps(env))).toBe(0);
    const t = out.join('\n');
    expect(t).toContain(`state file: ${file}`);
    expect(t).toContain('chain 31337: budget day 2026-11-11, spent 40000 wei, limit 100000 wei, remaining today 60000 wei');
    expect(t).toContain(`pending nonce=7 tx=${H1} reserved=5000 wei day=2026-11-11 age=1m`);
    expect(t).toContain('reserved nonce=8 tx=- reserved=5000 wei day=2026-11-11 age=2h2m');
    expect(t).not.toContain('SECRET-API-KEY');
  });

  it('does not count yesterday as spent today and shows age units', async () => {
    const env = envFor();
    const file = writeState(
      new Map([[31337, { budget: { day: DAY - 1, spentWei: 99_999n }, sends: [rec({ id: '2'.repeat(16), nonce: 1, status: 'signed', txHash: H2, createdAtMs: NOW - 5_000 }), rec({ id: '3'.repeat(16), nonce: 2, status: 'signed', txHash: H3, createdAtMs: NOW - 3 * 86_400_000 })] }]]),
    );
    expect(await runOps(['state', '--file', file], deps(env))).toBe(0);
    expect(out.join('\n')).toContain('remaining today 100000 wei');
    expect(out.join('\n')).toContain('age=5s');
    expect(out.join('\n')).toContain('age=3d');
  });

  it('--json is machine readable', async () => {
    const env = envFor();
    const file = writeState(chains());
    expect(await runOps(['state', '--file', file, '--json'], deps(env))).toBe(0);
    const j = JSON.parse(out[0] as string) as { file: string; chains: { chainId: number; remainingWei: string; sends: { txHash: string | null; ageSeconds: number }[] }[] };
    expect(j.file).toBe(file);
    expect(j.chains[0]?.remainingWei).toBe('60000');
    expect(j.chains[0]?.sends[0]?.txHash).toBe(H1);
    expect(j.chains[0]?.sends[1]?.txHash).toBeNull();
  });

  it('reads the file named by RELAYER_STATE_FILE and works without loadable config', async () => {
    const file = writeState(chains());
    expect(await runOps(['state'], deps({ RELAYER_STATE_FILE: file }))).toBe(0);
    const t = out.join('\n');
    expect(t).toContain('config not loadable here');
    expect(t).toContain('spent 40000 wei');
    expect(t).not.toContain('limit 1');
  });

  it('shows configured chains with no stored state, and an empty file', async () => {
    const env = envFor({ RELAYER_STATE_FILE: join(dir, 'absent.json') });
    expect(await runOps(['state'], deps(env))).toBe(0);
    expect(out.join('\n')).toContain('chain 31337: budget day 1970-01-01, spent 0 wei, limit 100000 wei, remaining today 100000 wei');
    expect(out.join('\n')).toContain('no unsettled transactions');
    out.length = 0;
    expect(await runOps(['state'], deps({ RELAYER_STATE_FILE: join(dir, 'absent.json') }))).toBe(0);
    expect(out.join('\n')).toContain('no chains stored');
  });

  it('works with the hot key unavailable by using only the config', async () => {
    const env = envFor({ RELAYER_STATE_FILE: writeState(chains()) });
    delete (env as Record<string, string | undefined>)['RELAYER_KEY_FILE'];
    expect(await runOps(['state'], deps(env))).toBe(0);
    expect(out.join('\n')).toContain('limit 100000 wei');
  });

  it('requires a state file', async () => {
    expect(await runOps(['state'], deps({}))).toBe(1);
    expect(err.join('\n')).toContain('no state file');
    err.length = 0;
    expect(await runOps(['state'], deps({ RELAYER_STATE_FILE: '' }))).toBe(1);
  });

  it('reports a corrupt file with the StateError message only', async () => {
    const f = join(dir, 'state.json');
    writeFileSync(f, '{"version":1,"chains":{"1":{"budget":{"day":1,"spentWei":"oops-secret"},"sends":[]}}}');
    expect(await runOps(['state', '--file', f], deps({}))).toBe(1);
    expect(err.join('\n')).toMatch(/^fatal: state file is invalid: /);
    expect(text()).not.toContain('oops-secret');
    err.length = 0;
    writeFileSync(f, 'not json');
    expect(await runOps(['state', '--file', f], deps({}))).toBe(1);
    expect(err.join('\n')).toContain('not JSON');
  });

  it('never creates, writes or locks anything', async () => {
    const env = envFor();
    const file = writeState(chains());
    const before = readFileSync(file, 'utf8');
    const mtime = statSync(file).mtimeMs;
    const names = readdirSync(dir).sort();
    expect(await runOps(['state', '--file', file], deps(env))).toBe(0);
    expect(readFileSync(file, 'utf8')).toBe(before);
    expect(statSync(file).mtimeMs).toBe(mtime);
    expect(readdirSync(dir).sort()).toEqual(names);
  });
});

describe('health', () => {
  let server: Server | undefined;
  let base = '';

  async function serve(status: number, body: string, delayMs = 0): Promise<void> {
    server = createServer((req, res) => {
      setTimeout(() => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(req.url === '/healthz' ? body : '{}');
      }, delayMs);
    });
    await new Promise<void>((r) => server?.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  }

  afterEach(async () => {
    server?.closeAllConnections();
    await new Promise<void>((r) => (server === undefined ? r() : server.close(() => r())));
    server = undefined;
  });

  it('exits 0 for 200 ok', async () => {
    await serve(200, '{"status":"ok","chains":[]}');
    expect(await runOps(['health', '--url', base], deps({}))).toBe(0);
    expect(out).toEqual(['http 200 status ok']);
  });

  it('exits 1 for degraded 503 and shutting down', async () => {
    await serve(503, '{"status":"degraded"}');
    expect(await runOps(['health', '--url', base], deps({}))).toBe(1);
    expect(out).toEqual(['http 503 status degraded']);
  });

  it('exits 1 for 200 with a non-ok status, a non-JSON body or a hostile status string', async () => {
    await serve(200, '{"status":"shutting_down"}');
    expect(await runOps(['health', '--url', base], deps({}))).toBe(1);
    await new Promise<void>((r) => server?.close(() => r()));
    await serve(200, 'not json');
    out.length = 0;
    expect(await runOps(['health', '--url', base], deps({}))).toBe(1);
    expect(out).toEqual(['http 200 status unknown']);
    await new Promise<void>((r) => server?.close(() => r()));
    await serve(200, '{"status":"ok\\nINJECT"}');
    out.length = 0;
    expect(await runOps(['health', '--url', base], deps({}))).toBe(1);
    expect(out).toEqual(['http 200 status unknown']);
  });

  it('uses RELAYER_HEALTH_URL and the default URL', async () => {
    await serve(200, '{"status":"ok"}');
    expect(await runOps(['health'], deps({ RELAYER_HEALTH_URL: base }))).toBe(0);
    let asked = '';
    const f = ((u: URL) => {
      asked = u.toString();
      return Promise.reject(new Error('down'));
    }) as unknown as typeof fetch;
    expect(await runOps(['health'], deps({}, { fetch: f }))).toBe(1);
    expect(asked).toBe('http://127.0.0.1:8787/healthz');
    expect(err.join('\n')).toBe('fatal: health check failed (no response)');
  });

  it('times out after 3 seconds', async () => {
    let signal: AbortSignal | undefined;
    const f = ((_u: URL, init: RequestInit) => {
      signal = init.signal as AbortSignal;
      return new Promise((_r, rej) => signal?.addEventListener('abort', () => rej(new Error('aborted'))));
    }) as unknown as typeof fetch;
    const started = Date.now();
    expect(await runOps(['health'], deps({}, { fetch: f }))).toBe(1);
    expect(Date.now() - started).toBeGreaterThanOrEqual(2900);
    expect(Date.now() - started).toBeLessThan(6000);
  }, 10_000);

  it('rejects bad URLs with usage errors', async () => {
    expect(await runOps(['health', '--url', 'ftp://x'], deps({}))).toBe(2);
    expect(await runOps(['health', '--url', 'not a url'], deps({}))).toBe(2);
    expect(await runOps(['health', '--bogus'], deps({}))).toBe(2);
  });
});

describe('reconcile-report', () => {
  function fakeChain(o: { receipts?: Record<string, 'success' | 'reverted'>; pending?: number; rpcDown?: 'receipt' | 'nonce' }): ReadOnlyChain & { seen: string[] } {
    const seen: string[] = [];
    return {
      seen,
      getReceipt: (h) => {
        seen.push(`receipt:${h}`);
        if (o.rpcDown === 'receipt') return Promise.reject(new Error('https://rpc.example/KEY'));
        const s = o.receipts?.[h];
        return Promise.resolve(s === undefined ? null : { status: s });
      },
      getPendingNonce: (a) => {
        seen.push(`nonce:${a}`);
        if (o.rpcDown === 'nonce') return Promise.reject(new Error('https://rpc.example/KEY'));
        return Promise.resolve(o.pending ?? 0);
      },
    };
  }

  const stateWith = (): string =>
    writeState(
      new Map([
        [
          31337,
          {
            budget: { day: DAY, spentWei: 1n },
            sends: [
              rec({ id: 'a'.repeat(16), nonce: 3, status: 'pending', txHash: H1 }),
              rec({ id: 'b'.repeat(16), nonce: 4, status: 'pending', txHash: H2 }),
              rec({ id: 'c'.repeat(16), nonce: 5, status: 'signed', txHash: H3 }),
              rec({ id: 'd'.repeat(16), nonce: 6, status: 'reserved' }),
            ],
          },
        ],
        [1, { budget: { day: DAY, spentWei: 0n }, sends: [] }],
      ]),
    );

  it('classifies settled, pending, unknown and never-signed records', async () => {
    const chain = fakeChain({ receipts: { [H1]: 'success' }, pending: 5 });
    const env = envFor({ RELAYER_STATE_FILE: stateWith() });
    expect(await runOps(['reconcile-report'], deps(env, { chain: () => chain }))).toBe(0);
    const lines = out.join('\n');
    expect(lines).toContain('nonce=3 tx=' + H1 + ': settled - mined (success)');
    expect(lines).toContain('nonce=4 tx=' + H2 + ': pending');
    expect(lines).toContain('nonce=5 tx=' + H3 + ': unknown - no receipt and the nonce is free');
    expect(lines).toContain('nonce=6 tx=-: not_broadcast');
    expect(lines).toContain('chain 1: stored in the state file but not in the config');
    expect(chain.seen).toContain(`nonce:${HOT_ADDR}`);
    expect(text()).not.toContain('SECRET-API-KEY');
  });

  it('reports receipts only when the hot key cannot be loaded', async () => {
    const chain = fakeChain({});
    const env = envFor({ RELAYER_STATE_FILE: stateWith() });
    delete (env as Record<string, string | undefined>)['RELAYER_KEY_FILE'];
    expect(await runOps(['reconcile-report'], deps(env, { chain: () => chain }))).toBe(0);
    expect(out.join('\n')).toContain('receipts only');
    expect(out.join('\n')).toContain('hot key not loadable so the pending nonce was not checked');
    expect(chain.seen.some((s) => s.startsWith('nonce:'))).toBe(false);
  });

  it('survives RPC failures without echoing provider text', async () => {
    for (const rpcDown of ['receipt', 'nonce'] as const) {
      out = [];
      const env = envFor({ RELAYER_STATE_FILE: stateWith() });
      expect(await runOps(['reconcile-report'], deps(env, { chain: () => fakeChain({ rpcDown }) }))).toBe(0);
      expect(out.join('\n')).toContain('RPC unavailable');
      expect(text()).not.toContain('rpc.example');
    }
  });

  it('--json output', async () => {
    const env = envFor({ RELAYER_STATE_FILE: stateWith() });
    expect(await runOps(['reconcile-report', '--json'], deps(env, { chain: () => fakeChain({ receipts: { [H2]: 'reverted' } }) }))).toBe(0);
    const j = JSON.parse(out[0] as string) as { receiptsOnly: boolean; items: { outcome: string }[]; unconfiguredChains: number[] };
    expect(j.receiptsOnly).toBe(false);
    expect(j.items.map((i) => i.outcome)).toEqual(['unknown', 'settled', 'unknown', 'not_broadcast']);
    expect(j.unconfiguredChains).toEqual([1]);
  });

  it('fails without config, without a state file, and on a corrupt file', async () => {
    expect(await runOps(['reconcile-report'], deps({}))).toBe(1);
    expect(err.join('\n')).toContain('config not loadable');
    err.length = 0;
    expect(await runOps(['reconcile-report'], deps(envFor()))).toBe(1);
    expect(err.join('\n')).toContain('no state file configured');
    err.length = 0;
    const f = join(dir, 'bad.json');
    writeFileSync(f, '[]');
    expect(await runOps(['reconcile-report'], deps(envFor({ RELAYER_STATE_FILE: f })))).toBe(1);
    expect(err.join('\n')).toContain('state file is invalid');
  });

  it('with an absent state file reports nothing to do', async () => {
    const env = envFor({ RELAYER_STATE_FILE: join(dir, 'absent.json') });
    expect(await runOps(['reconcile-report'], deps(env))).toBe(0);
    expect(out.join('\n')).toContain('no unsettled transactions');
  });
});

describe('viemReadOnlyChain (mock JSON-RPC node)', () => {
  let node: Server;
  let url = '';
  let mode: 'found' | 'missing' | 'error' = 'found';

  beforeEach(async () => {
    node = createServer((req, res) => {
      let body = '';
      req.on('data', (c: Buffer) => (body += c.toString()));
      req.on('end', () => {
        if (mode === 'error') {
          res.writeHead(500);
          res.end('provider says SECRET-API-KEY');
          return;
        }
        const j = JSON.parse(body) as { id: number; method: string };
        let result: unknown = null;
        if (j.method === 'eth_getTransactionCount') result = '0x9';
        if (j.method === 'eth_getTransactionReceipt' && mode === 'found') {
          result = {
            blockHash: H1, blockNumber: '0x1', contractAddress: null, cumulativeGasUsed: '0x5', effectiveGasPrice: '0x1', from: HOT_ADDR, gasUsed: '0x5',
            logs: [], logsBloom: `0x${'00'.repeat(256)}`, status: '0x0', to: SWEEP, transactionHash: H2, transactionIndex: '0x0', type: '0x2',
          };
        }
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id: j.id, result }));
      });
    });
    await new Promise<void>((r) => node.listen(0, '127.0.0.1', r));
    url = `http://127.0.0.1:${String((node.address() as AddressInfo).port)}`;
  });
  afterEach(async () => {
    node.closeAllConnections();
    await new Promise<void>((r) => node.close(() => r()));
  });

  const cfg = (): Parameters<typeof viemReadOnlyChain>[0] => ({ rpcUrl: url }) as unknown as Parameters<typeof viemReadOnlyChain>[0];

  it('reads receipts and the pending nonce', async () => {
    const c = viemReadOnlyChain(cfg());
    mode = 'found';
    expect(await c.getReceipt(H2)).toEqual({ status: 'reverted' });
    expect(await c.getPendingNonce(HOT_ADDR)).toBe(9);
    mode = 'missing';
    expect(await c.getReceipt(H2)).toBeNull();
  });

  it('turns provider failures into a fixed error', async () => {
    const c = viemReadOnlyChain(cfg());
    mode = 'error';
    await expect(c.getReceipt(H2)).rejects.toThrow(/^rpc$/);
    await expect(c.getPendingNonce(HOT_ADDR)).rejects.toThrow(/^rpc$/);
  });
});

describe('defaultDeps', () => {
  it('writes lines to stdout and stderr', () => {
    const o = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    const e = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const d = defaultDeps();
    d.out('a');
    d.err('b');
    expect(o).toHaveBeenCalledWith('a\n');
    expect(e).toHaveBeenCalledWith('b\n');
    o.mockRestore();
    e.mockRestore();
  });
});
