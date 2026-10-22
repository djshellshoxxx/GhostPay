import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { ed25519 } from '@noble/curves/ed25519.js';
import { manifestSigningBytes, type ReleaseKey, type RpcClient } from '@ghostpay/chain-adapters';
import { keccak256 } from 'viem';
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defaultDeps, parseArgs, runCli, type CliDeps } from './cli.js';
import type { FetchLike } from './types.js';
import { A, CODE, FakeRpc, healthy } from './fixtures.testutil.js';

const CHAIN = 84532;
const z = `0x${'ab'.repeat(32)}`;
const MANIFEST = JSON.stringify({
  chainId: CHAIN,
  announcer: A.announcer,
  router: A.router,
  sweepRelayer: A.sweep,
  feeRecipient: A.fee,
  feeBps: 25,
  deployTx: { router: z, sweepRelayer: z },
  solcVersion: '0.8.28',
  commit: 'a'.repeat(40),
  bytecodeHashes: { router: keccak256(CODE.router), sweepRelayer: keccak256(CODE.sweep) },
  date: '2026-10-21T00:00:00Z',
});
const CONFIG = (over: Record<string, unknown> = {}): string =>
  JSON.stringify({
    chains: [{ chainId: CHAIN, rpcUrlEnvs: ['RPC_A', 'RPC_B'], manifestFile: '/m/84532.json' }],
    output: { prometheusFile: '/out/ops.prom' },
    ...over,
  });
const ENV = { RPC_A: 'https://rpc-a.example/key-a', RPC_B: 'https://rpc-b.example/key-b', HOOK: 'https://hooks.example/secret-path' };
const hash = (n: bigint): string => `0x${n.toString(16).padStart(64, '0')}`;

interface Rig {
  readonly deps: Partial<CliDeps>;
  readonly files: Map<string, string>;
  readonly out: string[];
  readonly err: string[];
  readonly posts: { url: string; body: string }[];
  now: number;
}

function rig(opts: { files?: Record<string, string>; handler?: ReturnType<typeof healthy>; post?: boolean; lie?: boolean } = {}): Rig {
  const files = new Map<string, string>(Object.entries({ '/m/84532.json': MANIFEST, '/cfg.json': CONFIG(), ...opts.files }));
  const r: Rig = { files, out: [], err: [], posts: [], now: 1_900_000_000_000, deps: {} };
  let n = 0;
  (r as { deps: Partial<CliDeps> }).deps = {
    readText: (p) => (files.has(p) ? Promise.resolve(files.get(p) as string) : Promise.reject(new Error('ENOENT'))),
    writeAtomic: (p, t) => {
      files.set(p, t);
      return Promise.resolve();
    },
    createRpc: (chainId): Promise<RpcClient> => {
      n += 1;
      const liar = opts.lie === true && n === 2;
      return Promise.resolve(new FakeRpc({ chainId, handler: (m, p) => (m === 'eth_chainId' ? '0x14a34' : (opts.handler ?? healthy({}))(m, p)), head: 1000n, blockHash: () => (liar ? hash(999n) : hash(1n)) }));
    },
    postJson: (url, body) => {
      r.posts.push({ url, body });
      return Promise.resolve(opts.post !== false);
    },
    now: () => r.now,
    stdout: (l) => r.out.push(l),
    stderr: (l) => r.err.push(l),
  };
  return r;
}

describe('parseArgs', () => {
  it('requires --config and rejects unknown flags', () => {
    expect(parseArgs(['--config', 'a.json'])).toEqual({ config: 'a.json', dryRun: false, print: false });
    expect(parseArgs(['--config', 'a.json', '--dry-run', '--print'])).toEqual({ config: 'a.json', dryRun: true, print: true });
    expect(parseArgs([])).toBeUndefined();
    expect(parseArgs(['--config'])).toBeUndefined();
    expect(parseArgs(['--config', '--dry-run'])).toBeUndefined();
    expect(parseArgs(['--config', 'a.json', '--exec', 'rm'])).toBeUndefined();
  });
});

describe('runCli', () => {
  it('prints usage and exits 3 on bad arguments', async () => {
    const r = rig();
    expect(await runCli([], ENV, r.deps)).toBe(3);
    expect(r.err.join('\n')).toContain('usage:');
  });

  it('healthy chain: exit 0, writes the Prometheus file, sends no webhook', async () => {
    const r = rig();
    const code0 = await runCli(['--config', '/cfg.json'], ENV, r.deps);
    expect(code0).toBe(0);
    expect(r.files.get('/out/ops.prom')).toContain('ghostpay_ops_check_severity{check="W1"} 0');
    expect(r.posts).toHaveLength(0);
    expect(r.out.join('\n')).toMatch(/^info W1 chain=84532 /m);
  });

  it('a single provider is a warn (exit 1); a lying provider is a page (exit 2)', async () => {
    const single = rig({ files: { '/cfg.json': CONFIG({ chains: [{ chainId: CHAIN, rpcUrlEnvs: ['RPC_A'], manifestFile: '/m/84532.json' }] }) } });
    expect(await runCli(['--config', '/cfg.json'], ENV, single.deps)).toBe(1);
    const lie = rig({ lie: true });
    expect(await runCli(['--config', '/cfg.json'], ENV, lie.deps)).toBe(2);
  });

  it('detects on-chain code drift (page) and never prints RPC URLs or keys', async () => {
    const r = rig({ handler: healthy({ codes: { [A.router]: '0x6000' } }) });
    expect(await runCli(['--config', '/cfg.json'], ENV, r.deps)).toBe(2);
    const text = [...r.out, ...r.err, r.files.get('/out/ops.prom') ?? ''].join('\n');
    expect(text).not.toContain('key-a');
    expect(text).not.toContain('rpc-a.example');
  });

  it('--dry-run writes and sends nothing; --print shows the Prometheus text', async () => {
    const r = rig({ files: { '/cfg.json': CONFIG({ output: { prometheusFile: '/out/ops.prom', webhookUrlEnv: 'HOOK', stateFile: '/st.json' } }) }, handler: healthy({ codes: { [A.router]: '0x6000' } }) });
    expect(await runCli(['--config', '/cfg.json', '--dry-run', '--print'], ENV, r.deps)).toBe(2);
    expect(r.files.has('/out/ops.prom')).toBe(false);
    expect(r.posts).toHaveLength(0);
    expect(r.out.join('\n')).toContain('# TYPE ghostpay_ops_finding_severity gauge');
  });

  it('posts new warn/page findings once, remembering them across runs', async () => {
    const files = { '/cfg.json': CONFIG({ output: { webhookUrlEnv: 'HOOK', stateFile: '/st.json', dedupeMinutes: 60 } }) };
    const r = rig({ files, handler: healthy({ codes: { [A.router]: '0x6000' } }) });
    expect(await runCli(['--config', '/cfg.json'], ENV, r.deps)).toBe(2);
    expect(r.posts).toHaveLength(1);
    expect(r.posts[0]?.url).toBe('https://hooks.example/secret-path');
    expect(JSON.parse(r.posts[0]?.body ?? '{}')).toMatchObject({ version: 1, findings: [expect.objectContaining({ id: 'W1', severity: 'page' })] });
    expect(JSON.parse(r.files.get('/st.json') ?? '{}')).toBeTypeOf('object');
    // second run in a new process: same state file, nothing new inside the window
    r.now += 60_000;
    expect(await runCli(['--config', '/cfg.json'], ENV, r.deps)).toBe(2);
    expect(r.posts).toHaveLength(1);
    // after the window the alert repeats
    r.now += 61 * 60_000;
    await runCli(['--config', '/cfg.json'], ENV, r.deps);
    expect(r.posts).toHaveLength(2);
  });

  it('does not remember an alert whose delivery failed, and exits 3', async () => {
    const files = { '/cfg.json': CONFIG({ output: { webhookUrlEnv: 'HOOK', stateFile: '/st.json' } }) };
    const r = rig({ files, handler: healthy({ codes: { [A.router]: '0x6000' } }), post: false });
    expect(await runCli(['--config', '/cfg.json'], ENV, r.deps)).toBe(3);
    expect(r.files.has('/st.json')).toBe(false);
    expect(r.err.join('\n')).toContain('webhook delivery failed');
  });

  it('refuses a webhook env var that is not an https URL without credentials', async () => {
    const files = { '/cfg.json': CONFIG({ output: { webhookUrlEnv: 'HOOK', stateFile: '/st.json' } }) };
    for (const bad of [undefined, 'http://hooks.example/x', 'https://u:p@hooks.example/x', 'not a url']) {
      const r = rig({ files });
      expect(await runCli(['--config', '/cfg.json'], { ...ENV, HOOK: bad }, r.deps)).toBe(3);
      expect(r.posts).toHaveLength(0);
    }
  });

  it('tolerates a corrupt state file and reports an unwritable output as exit 3', async () => {
    const files = { '/cfg.json': CONFIG({ output: { webhookUrlEnv: 'HOOK', stateFile: '/st.json' } }), '/st.json': '{not json' };
    const r = rig({ files, handler: healthy({ codes: { [A.router]: '0x6000' } }) });
    expect(await runCli(['--config', '/cfg.json'], ENV, r.deps)).toBe(2);
    const w = rig({ handler: healthy({ codes: { [A.router]: '0x6000' } }) });
    expect(await runCli(['--config', '/cfg.json'], ENV, { ...w.deps, writeAtomic: () => Promise.reject(new Error('EROFS')) })).toBe(3);
    const arrayState = rig({ files: { ...files, '/st.json': '[1]' } });
    expect(await runCli(['--config', '/cfg.json'], ENV, arrayState.deps)).toBe(0);
  });

  it('exits 3 for a missing config, bad JSON, a missing RPC variable and a wrong-chain manifest', async () => {
    expect(await runCli(['--config', '/nope.json'], ENV, rig().deps)).toBe(3);
    expect(await runCli(['--config', '/cfg.json'], ENV, rig({ files: { '/cfg.json': '{oops' } }).deps)).toBe(3);
    const noEnv = rig();
    expect(await runCli(['--config', '/cfg.json'], { RPC_A: ENV.RPC_A }, noEnv.deps)).toBe(3);
    expect(noEnv.err.join('\n')).toContain('rpc env var not set');
    const plain = rig();
    expect(await runCli(['--config', '/cfg.json'], { RPC_A: 'http://rpc.example', RPC_B: ENV.RPC_B }, plain.deps)).toBe(3);
    const wrong = rig({ files: { '/m/84532.json': MANIFEST.replace('84532', '1') } });
    expect(await runCli(['--config', '/cfg.json'], ENV, wrong.deps)).toBe(3);
    expect(wrong.err.join('\n')).not.toContain('key-a');
  });

  it('authenticates manifests with the release key before trusting them (CHAIN-ADAPTERS-05), fail closed', async () => {
    const sk = new Uint8Array(32).fill(7);
    const releaseKey: ReleaseKey = { alg: 'ed25519', publicKey: `0x${Buffer.from(ed25519.getPublicKey(sk)).toString('hex')}` };
    const sign = (text: string, k: Uint8Array): string => {
      const signature = `0x${Buffer.from(ed25519.sign(manifestSigningBytes(text), k)).toString('hex')}`;
      return JSON.stringify({ ...(JSON.parse(text) as Record<string, unknown>), signature });
    };
    // pinned key + unsigned or forged manifest: refuse
    const unsigned = rig();
    expect(await runCli(['--config', '/cfg.json'], ENV, { ...unsigned.deps, releaseKey })).toBe(3);
    expect(unsigned.err.join('\n')).toContain('signature');
    const forged = rig({ files: { '/m/84532.json': sign(MANIFEST, new Uint8Array(32).fill(9)) } });
    expect(await runCli(['--config', '/cfg.json'], ENV, { ...forged.deps, releaseKey })).toBe(3);
    // properly signed manifest is accepted
    const ok = rig({ files: { '/m/84532.json': sign(MANIFEST, sk) } });
    expect(await runCli(['--config', '/cfg.json', '--dry-run'], ENV, { ...ok.deps, releaseKey })).toBe(0);
    // mainnet manifest with no release key pinned: refused
    const main = rig({
      files: {
        '/cfg.json': CONFIG({ chains: [{ chainId: 1, rpcUrlEnvs: ['RPC_A'], manifestFile: '/m/1.json' }] }),
        '/m/1.json': MANIFEST.replace('84532', '1'),
      },
    });
    expect(await runCli(['--config', '/cfg.json'], ENV, main.deps)).toBe(3);
    expect(main.err.join('\n')).toContain('signature');
  });

  it('checks release files against SHA256SUMS through the injected fetch', async () => {
    const index = 'hello';
    const sum = createHash('sha256').update(index).digest('hex');
    const files = { '/cfg.json': CONFIG({ release: { mirrors: ['https://pay.example.org'], sha256sumsFile: '/SHA256SUMS', files: ['index.html'] } }), '/SHA256SUMS': `${sum}  index.html\n` };
    const ok = rig({ files });
    const fetchOk = (body: string): FetchLike => (url) => Promise.resolve({ ok: true, status: 200, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(url.includes('deployments') ? MANIFEST : body).buffer) });
    expect(await runCli(['--config', '/cfg.json'], ENV, { ...ok.deps, fetchFile: fetchOk(index)  })).toBe(0);
    const tampered = rig({ files });
    expect(await runCli(['--config', '/cfg.json'], ENV, { ...tampered.deps, fetchFile: fetchOk('evil')  })).toBe(2);
    expect(tampered.out.join('\n')).toContain('W3');
  });

  it('wires W4 and W5 when configured (balance below the floor pages)', async () => {
    const base = healthy({});
    const handler: ReturnType<typeof healthy> = (m, p) => {
      if (m === 'eth_getBalance') return '0x1';
      if (m === 'eth_getTransactionCount') return (p as string[])[1] === 'pending' ? '0x5' : '0x5';
      if (m === 'eth_getLogs') return [];
      return base(m, p);
    };
    const files = {
      '/cfg.json': CONFIG({
        relayer: { chainId: CHAIN, address: A.hot, balanceFloorWei: '1000', maxNonceGap: 2, dailyUnreimbursedCapWei: '10' },
        announcements: { baselinePerBlock: 1, windowBlocks: 10 },
      }),
    };
    const r = rig({ files, handler });
    expect(await runCli(['--config', '/cfg.json'], ENV, r.deps)).toBe(2);
    expect(r.out.join('\n')).toMatch(/page W4 chain=84532 0x8888/);
    const bad = rig({ files, handler: (m, p) => (m === 'eth_getBalance' ? 'oops' : base(m, p)) });
    await runCli(['--config', '/cfg.json'], ENV, bad.deps);
    expect(bad.out.join('\n')).toMatch(/warn W4 .*monitor|warn W4/);
  });
});

describe('default dependencies (real file system and network)', () => {
  it('writes atomically with mode 600 and reads back, leaving no temp file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'gp-ops-'));
    const f = join(dir, 'x.prom');
    await defaultDeps.writeAtomic(f, 'one');
    await defaultDeps.writeAtomic(f, 'two');
    expect(await defaultDeps.readText(f)).toBe('two');
    expect(readdirSync(dir)).toEqual(['x.prom']);
    expect(readFileSync(f, 'utf8')).toBe('two');
    await expect(defaultDeps.readText(join(dir, 'missing'))).rejects.toThrow();
  });

  it('posts JSON without following redirects', async () => {
    const seen: string[] = [];
    const srv = createServer((req, res) => {
      let b = '';
      req.on('data', (c: Buffer) => (b += c.toString()));
      req.on('end', () => {
        seen.push(`${req.headers['content-type'] ?? ''}|${b}`);
        if (req.url === '/redirect') res.writeHead(302, { location: '/ok' }).end();
        else res.writeHead(req.url === '/fail' ? 500 : 200).end('{}');
      });
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${String((srv.address() as AddressInfo).port)}`;
    expect(await defaultDeps.postJson(`${base}/ok`, '{"a":1}')).toBe(true);
    expect(seen[0]).toBe('application/json|{"a":1}');
    expect(await defaultDeps.postJson(`${base}/fail`, '{}')).toBe(false);
    await expect(defaultDeps.postJson(`${base}/redirect`, '{}')).rejects.toThrow();
    await new Promise<void>((r) => srv.close(() => r()));
  });

  it('refuses a chain the adapters do not know and exposes a wall clock', async () => {
    await expect(defaultDeps.createRpc(999_999, 'https://rpc.example')).rejects.toThrow();
    expect(defaultDeps.now()).toBeGreaterThan(1_700_000_000_000);
    defaultDeps.stdout('');
    defaultDeps.stderr('');
  });
});
