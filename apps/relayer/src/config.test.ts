import { chmodSync, mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync, chownSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEV_CHAIN_ID, loadConfigFile, parseConfig, type ConfigContext } from './config.js';
import { ConfigError, HOT_KEY_SOURCE, QUOTE_SECRET_PREVIOUS_SOURCE, QUOTE_SECRET_SOURCE, loadOptionalSecret, loadSecret } from './secrets.js';
import { DEST, FEE_TO, HOT_ADDRESS, NOPERMIT, ORIGIN, STRANGER, SWEEP_CONTRACT, USDC } from './harness.testutil.js';

type Json = Record<string, unknown>;

const chain = (over: Json = {}): Json => ({
  chainId: 11155111,
  rpcUrl: 'https://rpc.example/key',
  sweepRelayer: SWEEP_CONTRACT,
  feeTo: FEE_TO,
  tokens: [{ address: USDC, usdStable: true }],
  nativeUsdPrice: '3000.5',
  gasUnits: { sweep: '100000', sweepWithPermit: '130000' },
  maxGasLimit: '400000',
  maxGasPriceWei: '50000000000',
  dailyBudgetWei: '100000000000000000',
  minBalanceWei: '1000000000000000',
  ...over,
});
const custom = [{ address: NOPERMIT, usdStable: true, symbol: 'USDX', decimals: 6, permit: false }];
const good = (over: Json = {}): Json => ({ allowedOrigins: [ORIGIN], chains: [chain()], ...over });
const ctx = (over: Partial<ConfigContext> = {}): ConfigContext => ({ env: {}, hotKeyAddress: HOT_ADDRESS, readManifest: () => undefined, ...over });
const parse = (raw: unknown, c: Partial<ConfigContext> = {}) => parseConfig(raw, ctx(c));

const MANIFEST = (chainId: number, sweep: string = SWEEP_CONTRACT): string =>
  JSON.stringify({
    chainId,
    announcer: '0x55649e01b5df198d18d95b5cc5051630cfd45564',
    router: DEST,
    sweepRelayer: sweep,
    feeRecipient: STRANGER,
    feeBps: 25,
    deployTx: { router: `0x${'11'.repeat(32)}`, sweepRelayer: `0x${'22'.repeat(32)}` },
    solcVersion: '0.8.28',
    commit: 'a'.repeat(40),
    bytecodeHashes: { router: `0x${'33'.repeat(32)}`, sweepRelayer: `0x${'44'.repeat(32)}` },
    date: '2026-10-01T00:00:00Z',
  });

describe('parseConfig', () => {
  it('accepts a minimal config and applies documented defaults', () => {
    const c = parse(good());
    expect(c.host).toBe('127.0.0.1');
    expect(c.port).toBe(8787);
    expect(c.quoteTtlSeconds).toBe(120);
    expect(c.minDeadlineSeconds).toBe(30);
    expect(c.maxDeadlineSeconds).toBe(1800);
    expect(c.queue).toEqual({ maxPending: 16, receiptTimeoutSeconds: 120 });
    expect(c.breaker).toEqual({ windowSize: 20, minSamples: 5, failureRatio: 0.5, cooldownSeconds: 60, halfOpenTimeoutSeconds: 30 });
    expect(c.trustProxy).toEqual([]); // X-Forwarded-For is never trusted by default
    expect(c.metrics).toEqual({ enabled: false, bearerToken: undefined });
    expect(c.alerts).toEqual({ webhookUrl: undefined, cooldownSeconds: 900 });
    expect(c.server.maxConnectionsPerIp).toBe(64);
    const ch = c.chains[0];
    expect(ch?.feeTo).toBe(FEE_TO);
    expect(ch?.nativeUsdMicro).toBe(3_000_500_000n);
    expect(ch?.tokens[0]).toEqual({ address: USDC, symbol: 'USDC', decimals: 6, permit: true, usdStable: true });
    expect(ch?.rpcUrl).toBe('https://rpc.example/key');
  });

  it('accepts overrides, rpcUrlEnv and custom tokens', () => {
    const c = parse(
      good({
        listen: { host: '0.0.0.0', port: 9000 },
        trustProxy: ['10.0.0.0/8', '2001:db8::/32'],
        deadline: { minSeconds: 10, maxSeconds: 600 },
        rateLimit: { ipPerMinute: 5, ipBurst: 2, ownerPerMinute: 1, ownerBurst: 1, maxKeys: 64, saltRotationHours: 6 },
        breaker: { windowSize: 10, minSamples: 4, failureRatio: 0.7, cooldownSeconds: 5 },
        queue: { maxPending: 3, receiptTimeoutSeconds: 10 },
        shutdownGraceSeconds: 3,
        chains: [
          chain({
            rpcUrl: undefined,
            rpcUrlEnv: 'MY_RPC',
            feeTo: FEE_TO,
            tokens: [{ address: USDC, usdStable: true, decimals: 6 }, { address: NOPERMIT, usdStable: true, symbol: 'USDX', decimals: 18, permit: false }],
          }),
        ],
      }),
      { env: { MY_RPC: 'https://rpc2.example' } },
    );
    expect(c.port).toBe(9000);
    expect(c.trustProxy).toEqual(['10.0.0.0/8', '2001:db8::/32']);
    expect(c.rateLimit.saltRotationHours).toBe(6);
    expect(c.chains[0]?.rpcUrl).toBe('https://rpc2.example/');
    expect(c.chains[0]?.feeTo).toBe(FEE_TO);
    expect(c.chains[0]?.tokens[1]).toMatchObject({ symbol: 'USDX', decimals: 18, permit: false });
  });

  const bad: [string, (c: Json) => Json, RegExp?][] = [
    ['unknown top-level key', (c) => ({ ...c, extra: 1 })],
    ['not an object', () => [] as unknown as Json],
    ['no origins', (c) => ({ ...c, allowedOrigins: [] })],
    ['origins not array', (c) => ({ ...c, allowedOrigins: 'x' })],
    ['wildcard origin', (c) => ({ ...c, allowedOrigins: ['*'] }), /allowedOrigins/],
    ['http non-local origin', (c) => ({ ...c, allowedOrigins: ['http://app.example'] })],
    ['origin with path', (c) => ({ ...c, allowedOrigins: ['https://app.example/x'] })],
    ['origin non-string', (c) => ({ ...c, allowedOrigins: [5] })],
    ['bad listen host', (c) => ({ ...c, listen: { host: '' } })],
    ['bad port', (c) => ({ ...c, listen: { port: 70000 } })],
    ['port float', (c) => ({ ...c, listen: { port: 1.5 } })],
    ['trustProxyHops string', (c) => ({ ...c, trustProxyHops: '1' })],
    ['allowDevChain not boolean', (c) => ({ ...c, allowDevChain: 'yes' })],
    ['deadline above spec max', (c) => ({ ...c, deadline: { maxSeconds: 1801 } })],
    ['deadline min >= max', (c) => ({ ...c, deadline: { minSeconds: 100, maxSeconds: 100 } })],
    ['rate limit zero', (c) => ({ ...c, rateLimit: { ipPerMinute: 0 } })],
    ['salt rotation above 24h', (c) => ({ ...c, rateLimit: { saltRotationHours: 25 } })],
    ['unknown nested key', (c) => ({ ...c, queue: { foo: 1 } })],
    ['nested not object', (c) => ({ ...c, queue: 5 })],
    ['no chains', (c) => ({ ...c, chains: [] })],
    ['duplicate chain', (c) => ({ ...c, chains: [chain(), chain()] })],
    ['chain unknown key', (c) => ({ ...c, chains: [chain({ extra: 1 })] })],
    ['chain missing key', (c) => ({ ...c, chains: [chain({ maxGasLimit: undefined })] })],
    ['chainId float', (c) => ({ ...c, chains: [chain({ chainId: 1.5 })] })],
    ['unknown chain', (c) => ({ ...c, chains: [chain({ chainId: 999999 })] }), /unknown chain/],
    ['dev chain without flag', (c) => ({ ...c, chains: [chain({ chainId: DEV_CHAIN_ID })] })],
    ['mainnet without manifest', (c) => ({ ...c, chains: [chain({ chainId: 1 })] }), /mainnet requires a deployment manifest/],
    ['no sweepRelayer and no manifest', (c) => ({ ...c, chains: [chain({ sweepRelayer: undefined })] }), /sweepRelayer/],
    ['bad sweepRelayer', (c) => ({ ...c, chains: [chain({ sweepRelayer: '0x12' })] })],
    ['feeTo is the contract', (c) => ({ ...c, chains: [chain({ feeTo: SWEEP_CONTRACT })] })],
    ['bad feeTo', (c) => ({ ...c, chains: [chain({ feeTo: 'x' })] })],
    ['both rpcUrl and env', (c) => ({ ...c, chains: [chain({ rpcUrlEnv: 'A' })] })],
    ['neither rpcUrl nor env', (c) => ({ ...c, chains: [chain({ rpcUrl: undefined })] })],
    ['rpcUrlEnv bad name', (c) => ({ ...c, chains: [chain({ rpcUrl: undefined, rpcUrlEnv: 'lower case' })] })],
    ['rpcUrlEnv unset', (c) => ({ ...c, chains: [chain({ rpcUrl: undefined, rpcUrlEnv: 'NOT_SET' })] })],
    ['rpcUrl not string', (c) => ({ ...c, chains: [chain({ rpcUrl: 5 })] })],
    ['rpc plain http', (c) => ({ ...c, chains: [chain({ rpcUrl: 'http://rpc.example' })] })],
    ['rpc credentials', (c) => ({ ...c, chains: [chain({ rpcUrl: 'https://u:p@rpc.example' })] })],
    ['price zero', (c) => ({ ...c, chains: [chain({ nativeUsdPrice: '0' })] })],
    ['price number', (c) => ({ ...c, chains: [chain({ nativeUsdPrice: 3000 })] })],
    ['gasUnits missing', (c) => ({ ...c, chains: [chain({ gasUnits: { sweep: '100000' } })] })],
    ['gasUnits too small', (c) => ({ ...c, chains: [chain({ gasUnits: { sweep: '1', sweepWithPermit: '2' } })] })],
    ['budget not decimal', (c) => ({ ...c, chains: [chain({ dailyBudgetWei: '1e18' })] })],
    ['maxGasPrice zero', (c) => ({ ...c, chains: [chain({ maxGasPriceWei: '0' })] })],
    ['no tokens', (c) => ({ ...c, chains: [chain({ tokens: [] })] })],
    ['non-stable token', (c) => ({ ...c, chains: [chain({ tokens: [{ address: USDC, usdStable: false }] })] }), /USD stablecoins/],
    ['usdStable missing', (c) => ({ ...c, chains: [chain({ tokens: [{ address: USDC }] })] })],
    ['token bad address', (c) => ({ ...c, chains: [chain({ tokens: [{ address: '0x1', usdStable: true }] })] })],
    ['duplicate token', (c) => ({ ...c, chains: [chain({ tokens: [{ address: USDC, usdStable: true }, { address: USDC.toLowerCase(), usdStable: true }] })] })],
    ['token conflicts with adapter', (c) => ({ ...c, chains: [chain({ tokens: [{ address: USDC, usdStable: true, decimals: 18 }] })] })],
    ['token permit conflicts', (c) => ({ ...c, chains: [chain({ tokens: [{ address: USDC, usdStable: true, permit: false }] })] })],
    ['custom token no symbol', (c) => ({ ...c, chains: [chain({ tokens: [{ address: NOPERMIT, usdStable: true, decimals: 6, permit: false }] })] })],
    ['custom token no decimals', (c) => ({ ...c, chains: [chain({ tokens: [{ address: NOPERMIT, usdStable: true, symbol: 'X', permit: false }] })] })],
    ['custom token decimals > 36', (c) => ({ ...c, chains: [chain({ tokens: [{ address: NOPERMIT, usdStable: true, symbol: 'X', decimals: 37, permit: false }] })] })],
    ['custom token no permit flag', (c) => ({ ...c, chains: [chain({ tokens: [{ address: NOPERMIT, usdStable: true, symbol: 'X', decimals: 6 }] })] })],
  ];
  it.each(bad)('refuses %s', (_n, mutate, re) => {
    const raw = mutate(good());
    expect(() => parse(raw)).toThrow(ConfigError);
    if (re !== undefined) expect(() => parse(raw)).toThrow(re);
  });

  it('allows the local dev chain only with the explicit flag', () => {
    const raw = good({ allowDevChain: true, allowInsecureLocalhostRpc: true, chains: [chain({ chainId: DEV_CHAIN_ID, rpcUrl: 'http://127.0.0.1:8545', tokens: custom })] });
    const c = parse(raw);
    expect(c.chains[0]?.name).toBe('Local development chain');
    expect(c.allowInsecureLocalhostRpc).toBe(true);
    expect(() => parse(good({ allowDevChain: true, chains: [chain({ chainId: DEV_CHAIN_ID, rpcUrl: 'http://127.0.0.1:8545', tokens: custom })] }))).toThrow(/rpc/i);
  });

  describe('mainnet gate', () => {
    const main = good({ chains: [chain({ chainId: 1, sweepRelayer: undefined, tokens: custom })] });
    it('needs ALLOW_MAINNET=1 even with a manifest', () => {
      expect(() => parse(main, { readManifest: (id) => MANIFEST(id) })).toThrow(/ALLOW_MAINNET/);
      expect(() => parse(main, { env: { ALLOW_MAINNET: 'true' }, readManifest: (id) => MANIFEST(id) })).toThrow(/ALLOW_MAINNET/);
    });
    it('starts with manifest and ALLOW_MAINNET=1, taking the contract from the manifest', () => {
      const c = parse(main, { env: { ALLOW_MAINNET: '1' }, readManifest: (id) => MANIFEST(id) });
      expect(c.chains[0]?.sweepRelayer).toBe(SWEEP_CONTRACT);
    });
    it('rejects an invalid manifest and a conflicting configured address', () => {
      expect(() => parse(main, { env: { ALLOW_MAINNET: '1' }, readManifest: () => '{}' })).toThrow();
      const conflict = good({ chains: [chain({ chainId: 1, sweepRelayer: DEST, tokens: custom })] });
      expect(() => parse(conflict, { env: { ALLOW_MAINNET: '1' }, readManifest: (id) => MANIFEST(id) })).toThrow(/differs from the deployment manifest/);
      const same = good({ chains: [chain({ chainId: 1, tokens: custom })] });
      expect(parse(same, { env: { ALLOW_MAINNET: '1' }, readManifest: (id) => MANIFEST(id) }).chains[0]?.chainId).toBe(1);
    });
    it('also reads manifests for testnets', () => {
      const c = parse(good({ chains: [chain({ sweepRelayer: undefined })] }), { readManifest: (id) => MANIFEST(id) });
      expect(c.chains[0]?.sweepRelayer).toBe(SWEEP_CONTRACT);
    });
  });
});

describe('hardening options', () => {
  it('S3-07: trustProxy must be a list of valid, non-zero-length CIDRs', () => {
    expect(parse(good({ trustProxy: [] })).trustProxy).toEqual([]);
    for (const bad of ['10.0.0.0/8', [1], ['nope'], ['0.0.0.0/0'], ['::/0'], Array.from({ length: 33 }, () => '10.0.0.1')]) {
      expect(() => parse(good({ trustProxy: bad }))).toThrow(/trustProxy/);
    }
    expect(() => parse(good({ trustProxyHops: 1 }))).toThrow(/invalid/); // the old hop-count option is gone
  });
  it('S3-18(b,c): feeTo is explicit, not a precompile and not the hot key unless allowed', () => {
    const noFee = good({ chains: [chain({ feeTo: undefined })] });
    expect(() => parse(noFee)).toThrow(/feeTo: required/);
    expect(parse({ ...noFee, allowFeeToHotKey: true }).chains[0]?.feeTo).toBe(HOT_ADDRESS);
    expect(() => parse(good({ chains: [chain({ feeTo: '0x0000000000000000000000000000000000000001' })] }))).toThrow(/burn/);
    expect(() => parse(good({ chains: [chain({ feeTo: '0x0000000000000000000000000000000000000009' })] }))).toThrow(/burn/); // ecrecover/sha256/... range
    expect(() => parse(good({ chains: [chain({ feeTo: '0x0000000000000000000000000000000000000000' })] }))).toThrow(/feeTo/);
    expect(() => parse(good({ chains: [chain({ feeTo: 'REPLACE_WITH_COLD_FEE_ADDRESS' })] }))).toThrow(/feeTo/);
    expect(() => parse(good({ chains: [chain({ feeTo: HOT_ADDRESS })] }))).toThrow(/differ from the hot key/);
    expect(parse(good({ allowFeeToHotKey: true, chains: [chain({ feeTo: HOT_ADDRESS })] })).chains[0]?.feeTo).toBe(HOT_ADDRESS);
  });
  it('G-11: metrics need a token off loopback; the token comes from the environment and is validated', () => {
    const TOKEN = 'k'.repeat(40);
    expect(() => parse(good({ listen: { host: '0.0.0.0' }, metrics: { enabled: true } }))).toThrow(/bearerTokenEnv/);
    expect(parse(good({ metrics: { enabled: true } })).metrics).toEqual({ enabled: true, bearerToken: undefined });
    expect(parse(good({ listen: { host: '::1' }, metrics: { enabled: true } })).metrics.enabled).toBe(true);
    const ok = parse(good({ listen: { host: '0.0.0.0' }, metrics: { enabled: true, bearerTokenEnv: 'M_TOKEN' } }), { env: { M_TOKEN: TOKEN } });
    expect(ok.metrics).toEqual({ enabled: true, bearerToken: TOKEN });
    expect(() => parse(good({ metrics: { enabled: true, bearerTokenEnv: 'M_TOKEN' } }))).toThrow(/32\.\.256/);
    expect(() => parse(good({ metrics: { enabled: true, bearerTokenEnv: 'M_TOKEN' } }), { env: { M_TOKEN: 'short' } })).toThrow(/32\.\.256/);
    expect(() => parse(good({ metrics: { enabled: true, bearerTokenEnv: 'lower' } }))).toThrow(/env var name/);
    expect(() => parse(good({ metrics: { enabled: true, bearerTokenEnv: 7 } }))).toThrow(/env var name/);
    try {
      parse(good({ metrics: { enabled: true, bearerTokenEnv: 'M_TOKEN' } }), { env: { M_TOKEN: 'secret!' } });
    } catch (e) {
      expect((e as Error).message).not.toContain('secret!');
    }
  });
  it('G-11: alerts webhook is https and public, from the file or the environment', () => {
    const url = 'https://hooks.example.org/T/B/X';
    expect(parse(good({ alerts: { webhookUrl: url, cooldownSeconds: 60 } })).alerts).toEqual({ webhookUrl: url, cooldownSeconds: 60 });
    expect(parse(good({ alerts: { webhookUrlEnv: 'HOOK' } }), { env: { HOOK: url } }).alerts.webhookUrl).toBe(url);
    expect(parse(good()).alerts.webhookUrl).toBeUndefined();
    for (const bad of ['http://hooks.example.org/x', 'https://127.0.0.1/x', 'https://169.254.169.254/', 'https://localhost/x', 7]) {
      expect(() => parse(good({ alerts: { webhookUrl: bad } }))).toThrow(/alerts\.webhookUrl/);
    }
    expect(() => parse(good({ alerts: { webhookUrl: url, webhookUrlEnv: 'HOOK' } }), { env: { HOOK: url } })).toThrow(/only one/);
    expect(() => parse(good({ alerts: { webhookUrlEnv: 'HOOK' } }))).toThrow(/empty/);
    expect(() => parse(good({ alerts: { webhookUrlEnv: 'hook' } }))).toThrow(/env var name/);
    expect(() => parse(good({ alerts: { webhookUrlEnv: 'HOOK' } }), { env: { HOOK: 'https://10.0.0.1/' } })).toThrow(/private/);
  });
  it('S3-05/06/18: breaker, abuse, gas and server options are bounded', () => {
    const c = parse(good({
      breaker: { halfOpenTimeoutSeconds: 12 },
      abuse: { ownerMaxFailures: 2, destinationMaxFailures: 4, windowSeconds: 120 },
      gas: { coverPercent: 150, maxMovePercent: 10, quoteCacheSeconds: 0 },
      server: { headersTimeoutMs: 2000, requestTimeoutMs: 3000, keepAliveTimeoutMs: 1500, bodyTimeoutMs: 800, maxConnections: 10, maxConnectionsPerIp: 3, maxHeadersCount: 20 },
      rateLimit: { quotePerMinute: 10, quoteBurst: 5 },
    }));
    expect(c.breaker.halfOpenTimeoutSeconds).toBe(12);
    expect(c.abuse).toEqual({ ownerMaxFailures: 2, destinationMaxFailures: 4, windowSeconds: 120 });
    expect(c.gas).toEqual({ coverPercent: 150, maxMovePercent: 10, quoteCacheSeconds: 0 });
    expect(c.server.maxConnectionsPerIp).toBe(3);
    expect(c.rateLimit.quoteBurst).toBe(5);
    expect(() => parse(good({ gas: { coverPercent: 50 } }))).toThrow(/coverPercent/);
    expect(() => parse(good({ server: { bodyTimeoutMs: 1 } }))).toThrow(/bodyTimeoutMs/);
    expect(() => parse(good({ abuse: { windowSeconds: 1 } }))).toThrow(/windowSeconds/);
  });
});

describe('example config', () => {
  it('stays valid (with a manifest for the chain)', () => {
    const raw: unknown = JSON.parse(readFileSync(new URL('../relayer.config.example.json', import.meta.url), 'utf8'));
    expect(() => parse(raw, { env: { RPC_URL_84532: 'https://rpc.example' }, readManifest: (id) => MANIFEST(id) })).toThrow(/feeTo/); // placeholder must be replaced
    const filled = structuredClone(raw) as { chains: { feeTo: string }[] };
    (filled.chains[0] as { feeTo: string }).feeTo = FEE_TO;
    const c = parse(filled, { env: { RPC_URL_84532: 'https://rpc.example' }, readManifest: (id) => MANIFEST(id) });
    expect(c.chains[0]?.chainId).toBe(84532);
    expect(c.chains[0]?.tokens[0]?.symbol).toBe('USDC');
  });
});

describe('loadConfigFile', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gp-cfg-'));
  const dep = join(dir, 'deployments');
  mkdirSync(dep);
  const base = { env: {}, hotKeyAddress: HOT_ADDRESS };

  it('reads config and manifests from disk', () => {
    const p = join(dir, 'ok.json');
    writeFileSync(p, JSON.stringify(good({ chains: [chain({ sweepRelayer: undefined })] })));
    expect(() => loadConfigFile(p, dep, base)).toThrow(/sweepRelayer/); // no manifest yet
    writeFileSync(join(dep, '11155111.json'), MANIFEST(11155111));
    expect(loadConfigFile(p, dep, base).chains[0]?.sweepRelayer).toBe(SWEEP_CONTRACT);
  });
  it('fails cleanly on missing, huge or malformed files', () => {
    expect(() => loadConfigFile(join(dir, 'missing.json'), dep, base)).toThrow(/not readable/);
    const big = join(dir, 'big.json');
    writeFileSync(big, ' '.repeat(70_000));
    expect(() => loadConfigFile(big, dep, base)).toThrow(/too large/);
    const junk = join(dir, 'junk.json');
    writeFileSync(junk, '{nope');
    expect(() => loadConfigFile(junk, dep, base)).toThrow(/not valid JSON/);
  });
});

describe('loadSecret', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gp-sec-'));
  const KEY = '11'.repeat(32);
  const file = (name: string, content: string, mode: number): string => {
    const p = join(dir, name);
    writeFileSync(p, content);
    chmodSync(p, mode);
    return p;
  };

  it('reads a mode-600 file (with or without 0x and trailing newline)', () => {
    expect(loadSecret({ RELAYER_KEY_FILE: file('k1', `${KEY}\n`, 0o600) }, HOT_KEY_SOURCE)).toHaveLength(32);
    expect(loadSecret({ RELAYER_KEY_FILE: file('k2', `0x${KEY}`, 0o400) }, HOT_KEY_SOURCE)).toHaveLength(32);
  });
  it.each([0o640, 0o644, 0o604, 0o660, 0o666, 0o610])('refuses group/world-accessible mode %o', (mode) => {
    const p = file(`m${mode.toString(8)}`, KEY, mode);
    expect(() => loadSecret({ RELAYER_KEY_FILE: p }, HOT_KEY_SOURCE)).toThrow(/mode/);
  });
  it('accepts an env value and rejects invalid sources', () => {
    expect(loadSecret({ RELAYER_KEY: KEY }, HOT_KEY_SOURCE)).toHaveLength(32);
    expect(() => loadSecret({}, HOT_KEY_SOURCE)).toThrow(/required/);
    expect(() => loadSecret({ RELAYER_KEY: '' }, HOT_KEY_SOURCE)).toThrow(/required/);
    expect(() => loadSecret({ RELAYER_KEY: KEY, RELAYER_KEY_FILE: file('both', KEY, 0o600) }, HOT_KEY_SOURCE)).toThrow(/only one/);
    expect(() => loadSecret({ RELAYER_KEY_FILE: join(dir, 'nope') }, HOT_KEY_SOURCE)).toThrow(/not readable/);
    expect(() => loadSecret({ RELAYER_KEY_FILE: dir }, HOT_KEY_SOURCE)).toThrow(/regular/);
    expect(() => loadSecret({ RELAYER_KEY_FILE: file('big', 'a'.repeat(5000), 0o600) }, HOT_KEY_SOURCE)).toThrow(/regular/);
    expect(() => loadSecret({ RELAYER_KEY_FILE: file('short', '1122', 0o600) }, HOT_KEY_SOURCE)).toThrow(/invalid secret format/);
    expect(() => loadSecret({ RELAYER_KEY: 'zz'.repeat(32) }, HOT_KEY_SOURCE)).toThrow(/RELAYER_KEY: invalid/);
    expect(() => loadSecret({ RELAYER_KEY: `${KEY}00` }, HOT_KEY_SOURCE)).toThrow(/invalid secret/);
    expect(loadSecret({ QUOTE_SECRET: 'ab'.repeat(64) }, QUOTE_SECRET_SOURCE)).toHaveLength(64);
    expect(() => loadSecret({ QUOTE_SECRET: 'ab'.repeat(16) }, QUOTE_SECRET_SOURCE)).toThrow();
  });
  it('never puts the secret in an error message', () => {
    const secret = 'ab'.repeat(33);
    for (const env of [{ RELAYER_KEY: secret }, { RELAYER_KEY_FILE: file('toolong', secret, 0o600) }, { RELAYER_KEY_FILE: file('leaky', secret, 0o644) }]) {
      try {
        loadSecret(env, HOT_KEY_SOURCE);
        expect.unreachable();
      } catch (e) {
        expect((e as Error).message).not.toContain(secret);
        expect((e as Error).message).not.toContain('abab');
      }
    }
  });
  it('S3-18(d): refuses symlinks and files owned by someone else', () => {
    const real = file('real', KEY, 0o600);
    const link = join(dir, 'link');
    symlinkSync(real, link);
    expect(() => loadSecret({ RELAYER_KEY_FILE: link }, HOT_KEY_SOURCE)).toThrow(/symlink/);
    if (process.getuid?.() === 0) {
      const other = file('foreign', KEY, 0o600);
      chownSync(other, 12345, 12345);
      expect(() => loadSecret({ RELAYER_KEY_FILE: other }, HOT_KEY_SOURCE)).toThrow(/owned by/);
    }
  });
  it('S3-18(d): refuses secrets passed in the environment in production unless explicitly allowed', () => {
    expect(() => loadSecret({ RELAYER_KEY: KEY, NODE_ENV: 'production' }, HOT_KEY_SOURCE)).toThrow(/production/);
    expect(loadSecret({ RELAYER_KEY: KEY, NODE_ENV: 'production', ALLOW_SECRET_ENV: '1' }, HOT_KEY_SOURCE)).toHaveLength(32);
    expect(loadSecret({ RELAYER_KEY_FILE: file('prodfile', KEY, 0o600), NODE_ENV: 'production' }, HOT_KEY_SOURCE)).toHaveLength(32);
  });
  it('S3-21: the previous quote secret is optional', () => {
    expect(loadOptionalSecret({}, QUOTE_SECRET_PREVIOUS_SOURCE)).toBeUndefined();
    expect(loadOptionalSecret({ QUOTE_SECRET_PREVIOUS: '' }, QUOTE_SECRET_PREVIOUS_SOURCE)).toBeUndefined();
    expect(loadOptionalSecret({ QUOTE_SECRET_PREVIOUS: 'ab'.repeat(32) }, QUOTE_SECRET_PREVIOUS_SOURCE)).toHaveLength(32);
    expect(loadOptionalSecret({ QUOTE_SECRET_PREVIOUS_FILE: file('prev', 'ab'.repeat(40), 0o600) }, QUOTE_SECRET_PREVIOUS_SOURCE)).toHaveLength(40);
    expect(() => loadOptionalSecret({ QUOTE_SECRET_PREVIOUS: 'zz' }, QUOTE_SECRET_PREVIOUS_SOURCE)).toThrow(/invalid/);
  });
  it('reports an unreadable file whose stat succeeded', () => {
    const p = file('unreadable', KEY, 0o600);
    chmodSync(p, 0o000);
    if (process.getuid?.() === 0) return; // root can read anything
    expect(() => loadSecret({ RELAYER_KEY_FILE: p }, HOT_KEY_SOURCE)).toThrow(/not readable/);
  });
});
