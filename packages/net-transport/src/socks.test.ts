import fc from 'fast-check';
import { afterEach, describe, expect, it } from 'vitest';
import net from 'node:net';
import { ChainAdapterError, RpcHttpError, type RpcTransport } from '@ghostpay/chain-adapters';
import {
  installPoisonedResolver,
  startConnectProxy,
  startHttpEcho,
  startSocks5Server,
  type Running,
} from '@ghostpay/net-harness';
import {
  NetTransportError,
  createI2pOutproxyProfile,
  createNymMixFetchProfile,
  createNymSocksProfile,
  createOnionProfile,
  createProfile,
  createTorBrowserProfile,
  createTorSocksProfile,
  createDirectProfile,
  httpConnect,
  parseProxyUrl,
  socks5Connect,
  PROFILE_IDS,
  type FetchLike,
  type NetworkRef,
  type ProfileConfig,
  type Purpose,
  type TransportProfile,
} from './index.js';

const NET: NetworkRef = { kind: 'evm', chainId: 84532 };
const DDG = 'duckduckgogg42xjoc72x3sjasowoarfbgcmvfimaftt6twagswzczad.onion';
const RPC_NAME = 'rpc.example.test';
const JSON_BODY = '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}';
const CHAIN_ID_RESPONSE = '{"jsonrpc":"2.0","id":1,"result":"0x14a34"}'; // 84532

const toClose: Running[] = [];
afterEach(async () => {
  while (toClose.length > 0) await toClose.pop()?.close();
});
function track<T extends Running>(r: T): T {
  toClose.push(r);
  return r;
}
const LIM = { timeoutMs: 5000, maxBytes: 100_000 };

async function errOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected rejection');
}
const code = (e: unknown): string => (e instanceof NetTransportError ? e.code : `other:${(e as Error).name}`);

async function closedPort(): Promise<number> {
  const s = await startHttpEcho();
  const p = s.port;
  await s.close();
  return p;
}

describe('SOCKS5h through the harness (NP-T-3, AT-NP-2)', () => {
  it('sends the hostname as ATYP 3, never resolves locally, POSTs JSON over TLS', async () => {
    const echo = track(await startHttpEcho({ tls: true, responseBody: CHAIN_ID_RESPONSE }));
    const proxy = track(await startSocks5Server({ auth: 'userpass', hosts: { [RPC_NAME]: '127.0.0.1' } }));
    const poisoned = installPoisonedResolver();
    try {
      const profile = createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}`, tlsCa: echo.ca });
      const out = await profile.transport('quote').send(`https://${RPC_NAME}:${String(echo.port)}/v1/key?x=1`, JSON_BODY, LIM);
      expect(out).toBe(CHAIN_ID_RESPONSE);
      expect(poisoned.calls).toEqual([]);
    } finally {
      poisoned.restore();
    }
    expect(proxy.records).toHaveLength(1);
    expect(proxy.records[0]).toMatchObject({ atyp: 3, host: RPC_NAME, port: echo.port, cmd: 1, reply: 0 });
    expect(echo.records[0]).toMatchObject({ method: 'POST', url: '/v1/key?x=1' });
    expect(echo.records[0]?.body.toString()).toBe(JSON_BODY);
    expect(echo.records[0]?.headers['content-type']).toBe('application/json');
    expect(echo.records[0]?.headers['user-agent']).toBeUndefined();
    expect(echo.records[0]?.headers['cookie']).toBeUndefined();
  });
  it('works over plain http when explicitly allowed (test option), through a split reply', async () => {
    const echo = track(await startHttpEcho());
    const proxy = track(await startSocks5Server({ auth: 'userpass', hosts: { 'echo.test': '127.0.0.1' } }));
    const p = createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://localhost:${String(proxy.port)}`, allowPlainHttp: true });
    expect(await p.transport('health').send(`http://echo.test:${String(echo.port)}/`, 'abc', LIM)).toBe('abc');
  });
  it('handles concurrent requests with distinct isolation credentials', async () => {
    const echo = track(await startHttpEcho());
    const proxy = track(await startSocks5Server({ auth: 'userpass', hosts: { 'echo.test': '127.0.0.1' } }));
    const p = createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}`, allowPlainHttp: true });
    const t = p.transport('sweep');
    const outs = await Promise.all([1, 2, 3, 4, 5].map((i) => t.send(`http://echo.test:${String(echo.port)}/`, String(i), LIM)));
    expect(outs).toEqual(['1', '2', '3', '4', '5']);
    expect(new Set(proxy.records.map((r) => r.username)).size).toBe(5);
  });
  it('IPv4-literal destinations use ATYP 1', async () => {
    const echo = track(await startHttpEcho());
    const proxy = track(await startSocks5Server({ auth: 'userpass' }));
    const p = createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}`, allowPlainHttp: true });
    await p.transport('health').send(`http://127.0.0.1:${String(echo.port)}/`, 'x', LIM);
    expect(proxy.records[0]).toMatchObject({ atyp: 1, host: '127.0.0.1' });
  });
});

describe('credential isolation on the wire (NP-I-1, AT-NP-7)', () => {
  async function run(isolate: 'per-purpose' | 'per-request' | 'none', purposes: Purpose[]) {
    const echo = track(await startHttpEcho());
    const proxy = track(await startSocks5Server({ auth: isolate === 'none' ? 'none' : 'userpass', hosts: { 'echo.test': '127.0.0.1' } }));
    const p = createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}`, isolate, allowPlainHttp: true });
    for (const purpose of purposes) await p.transport(purpose).send(`http://echo.test:${String(echo.port)}/`, 'x', LIM);
    return proxy;
  }
  it('per-purpose: scan-bulk reuses, read-address never shares with scan-bulk, sweeps are fresh', async () => {
    const proxy = await run('per-purpose', ['scan-bulk', 'scan-bulk', 'read-address', 'read-address', 'quote', 'sweep', 'sweep']);
    const creds = proxy.records.map((r) => `${r.username as string}|${r.password as string}`);
    expect(creds[0]).toBe(creds[1]);
    expect(new Set(creds.slice(2)).size).toBe(5);
    expect(creds.slice(2)).not.toContain(creds[0]);
    expect(proxy.records.map((r) => (r.username as string).split('-').slice(0, -1).join('-'))).toEqual([
      'gp1-scan-bulk',
      'gp1-scan-bulk',
      'gp1-read-address',
      'gp1-read-address',
      'gp1-quote',
      'gp1-sweep',
      'gp1-sweep',
    ]);
    for (const r of proxy.records) expect(r.password).toMatch(/^[0-9a-f]{32}$/);
  });
  it('per-request: every request is a fresh class, even scan-bulk', async () => {
    const proxy = await run('per-request', ['scan-bulk', 'scan-bulk']);
    expect(proxy.records[0]?.username).not.toBe(proxy.records[1]?.username);
  });
  it('none: offers only method 0 and sends no credentials', async () => {
    const proxy = await run('none', ['quote']);
    expect(proxy.greetings[0]).toEqual([0]);
    expect(proxy.records[0]?.username).toBeUndefined();
  });
  it('with credentials only method 2 is offered (a proxy ignoring auth cannot silently drop isolation)', async () => {
    const proxy = await run('per-purpose', ['quote']);
    expect(proxy.greetings[0]).toEqual([2]);
  });
  it('credentials are independent of URL, body and purpose content (deterministic RNG)', async () => {
    const echo = track(await startHttpEcho());
    const proxy = track(await startSocks5Server({ auth: 'userpass', hosts: { 'echo.test': '127.0.0.1' } }));
    const mk = (): TransportProfile =>
      createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}`, allowPlainHttp: true, rand: (n) => new Uint8Array(n).fill(0x5a) });
    await mk().transport('quote').send(`http://echo.test:${String(echo.port)}/aaa?secret=1`, 'body-one', LIM);
    await mk().transport('quote').send(`http://echo.test:${String(echo.port)}/bbb`, 'completely different body 0xdeadbeef', LIM);
    expect(proxy.records[0]?.username).toBe(proxy.records[1]?.username);
    expect(proxy.records[0]?.username).toBe(`gp1-quote-${'5a'.repeat(8)}`);
    expect(proxy.records[0]?.password).toBe('5a'.repeat(16));
  });
});

describe('SOCKS failures fail closed with fixed messages (NP-T-5, NP-T-6, AT-NP-4, AT-NP-5)', () => {
  const SECRET_URL = `https://user:SECRETPW@${RPC_NAME}:9/KEY-abc123?apikey=XYZ`;
  const CLEAN_URL = `https://${RPC_NAME}:443/KEY-abc123?apikey=XYZ`;
  const forbidden = [RPC_NAME, 'SECRETPW', 'KEY-abc123', 'apikey', 'XYZ', 'gp1-', 'example.test', '127.0.0.1'];
  function assertRedacted(e: unknown, extra: string[] = []): void {
    const blob = `${(e as Error).message} ${String(e)} ${(e as Error).stack?.split('\n')[0] ?? ''}`;
    for (const f of [...forbidden, ...extra]) expect(blob).not.toContain(f);
  }
  const mkProfile = (port: number, extra: Partial<Extract<ProfileConfig, { id: 'tor-socks' }>> = {}): TransportProfile =>
    createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(port)}`, connectTimeoutMs: 400, ...extra });

  it('proxy not listening -> PROXY_CONNECT, and the destination is never contacted directly', async () => {
    const echo = track(await startHttpEcho({ tls: true }));
    const p = mkProfile(await closedPort(), { tlsCa: echo.ca });
    const e = await errOf(p.transport('quote').send(CLEAN_URL.replace(':443', `:${String(echo.port)}`), JSON_BODY, LIM));
    expect(code(e)).toBe('PROXY_CONNECT');
    assertRedacted(e);
    expect(echo.records).toHaveLength(0); // no fallback to direct
  });
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9])('proxy reply code %i -> SOCKS_REPLY', async (c) => {
    const proxy = track(await startSocks5Server({ auth: 'userpass', forceReply: c }));
    const e = await errOf(mkProfile(proxy.port).transport('quote').send(CLEAN_URL, JSON_BODY, LIM));
    expect(code(e)).toBe('SOCKS_REPLY');
    assertRedacted(e);
  });
  it('unknown name on the proxy side -> SOCKS_REPLY (reply 4)', async () => {
    const proxy = track(await startSocks5Server({ auth: 'userpass' }));
    const e = await errOf(mkProfile(proxy.port).transport('quote').send(CLEAN_URL, JSON_BODY, LIM));
    expect(code(e)).toBe('SOCKS_REPLY');
    expect((e as Error).message).toContain('reply 4');
  });
  it('bad credentials -> PROXY_AUTH; method mismatch -> PROXY_AUTH', async () => {
    const p1 = track(await startSocks5Server({ auth: 'userpass', checkCredentials: () => false }));
    const e1 = await errOf(mkProfile(p1.port).transport('quote').send(CLEAN_URL, JSON_BODY, LIM));
    expect(code(e1)).toBe('PROXY_AUTH');
    assertRedacted(e1);
    const p2 = track(await startSocks5Server({ auth: 'none' })); // we offer method 2, it only accepts 0
    expect(code(await errOf(mkProfile(p2.port).transport('quote').send(CLEAN_URL, JSON_BODY, LIM)))).toBe('PROXY_AUTH');
    const p3 = track(await startSocks5Server({ auth: 'userpass' })); // we offer 0 only
    expect(code(await errOf(mkProfile(p3.port, { isolate: 'none' }).transport('quote').send(CLEAN_URL, JSON_BODY, LIM)))).toBe('PROXY_AUTH');
  });
  it.each([
    ['bad-reply-version', 'SOCKS_REPLY'],
    ['truncated-reply', 'PROXY_CONNECT'],
    ['garbage-reply', 'SOCKS_REPLY'],
    ['hang-after-greeting', 'PROXY_CONNECT'],
    ['hang-after-auth', 'PROXY_CONNECT'],
    ['close-after-greeting', 'PROXY_CONNECT'],
    ['reply-bad-atyp', 'SOCKS_REPLY'],
  ] as const)('proxy misbehaviour %s -> %s', async (m, c) => {
    const echo = track(await startHttpEcho());
    const proxy = track(await startSocks5Server({ auth: 'userpass', hosts: { [RPC_NAME]: '127.0.0.1' }, misbehave: m }));
    const e = await errOf(mkProfile(proxy.port, { allowPlainHttp: true }).transport('quote').send(`http://${RPC_NAME}:${String(echo.port)}/`, JSON_BODY, LIM));
    expect(code(e)).toBe(c);
    assertRedacted(e);
  });
  it('proxy that is not SOCKS at all (wrong greeting version) is rejected', async () => {
    const proxy = track(await startSocks5Server({ misbehave: 'bad-greeting-version' }));
    const e = await errOf(mkProfile(proxy.port, { isolate: 'none' }).transport('quote').send(CLEAN_URL, JSON_BODY, LIM));
    expect(['PROXY_AUTH', 'SOCKS_REPLY']).toContain(code(e));
  });
  it('a plain TCP server answering with non-SOCKS bytes -> SOCKS_REPLY', async () => {
    const srv = net.createServer((s) => {
      s.on('data', () => s.write(Buffer.from([0x48, 0x54])));
      s.on('error', () => undefined);
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const port = (srv.address() as net.AddressInfo).port;
    try {
      const e = await errOf(mkProfile(port).transport('quote').send(CLEAN_URL, JSON_BODY, LIM));
      expect(code(e)).toBe('SOCKS_REPLY');
    } finally {
      srv.close();
    }
  });
  it('rejects bad destination URLs before touching the proxy, with redacted errors', async () => {
    const proxy = track(await startSocks5Server());
    const p = mkProfile(proxy.port);
    for (const u of [SECRET_URL, `http://${RPC_NAME}/`, `https://${RPC_NAME}/#frag`, 'not a url', `ftp://${RPC_NAME}/`]) {
      const e = await errOf(p.transport('quote').send(u, JSON_BODY, LIM));
      expect(code(e)).toBe('URL_REJECTED');
      assertRedacted(e);
    }
    expect(code(await errOf(p.transport('quote').send(`https://${DDG}/`, JSON_BODY, LIM)))).toBe('ONION_URL');
    assertRedacted(await errOf(p.transport('quote').send(`https://${DDG}/`, JSON_BODY, LIM)), ['duckduckgo', '.onion']);
    expect(proxy.greetings).toHaveLength(0);
  });
  it('unknown purpose is refused', () => {
    const p = mkProfile(1);
    expect(() => p.transport('nope' as Purpose)).toThrow(NetTransportError);
  });
  it('fuzz: arbitrary URL strings never leak into error text and never reach the proxy', async () => {
    const proxy = track(await startSocks5Server());
    const p = mkProfile(proxy.port);
    await fc.assert(
      fc.asyncProperty(fc.string({ minLength: 5, maxLength: 40 }), async (s) => {
        try {
          await p.transport('quote').send(s, JSON_BODY, LIM);
        } catch (e) {
          if (e instanceof NetTransportError) expect(e.message).not.toContain(s);
        }
      }),
      { numRuns: 100 },
    );
    expect(proxy.greetings).toHaveLength(0);
  });
});

describe('RpcTransport contract over SOCKS (NP-T-4, AT-NP-3)', () => {
  async function setup(echoOpts: Parameters<typeof startHttpEcho>[0], tlsOpt = true) {
    const echo = track(await startHttpEcho({ ...echoOpts, ...(tlsOpt ? { tls: true } : {}) }));
    const proxy = track(await startSocks5Server({ auth: 'userpass', hosts: { [RPC_NAME]: '127.0.0.1' } }));
    const p = createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}`, tlsCa: echo.ca, allowPlainHttp: !tlsOpt });
    return { echo, proxy, t: p.transport('quote'), url: `${tlsOpt ? 'https' : 'http'}://${RPC_NAME}:${String(echo.port)}/` };
  }
  it('non-2xx -> RpcHttpError with status and retryable semantics', async () => {
    for (const [status, retryable] of [[400, false], [404, false], [429, true], [500, true], [503, true]] as const) {
      const { t, url } = await setup({ status, responseBody: 'x' });
      const e = await errOf(t.send(url, JSON_BODY, LIM));
      expect(e).toBeInstanceOf(RpcHttpError);
      expect((e as RpcHttpError).status).toBe(status);
      expect((e as RpcHttpError).retryable).toBe(retryable);
    }
  });
  it('a 3xx is a failure and is not followed', async () => {
    const target = track(await startHttpEcho());
    const { t, url } = await setup({ status: 302, responseHeaders: { location: `${target.baseUrl}/stolen` } });
    const e = await errOf(t.send(url, JSON_BODY, LIM));
    expect(e).toBeInstanceOf(RpcHttpError);
    expect((e as RpcHttpError).status).toBe(302);
    expect(target.records).toHaveLength(0);
  });
  it('enforces maxBytes (streamed and declared) -> RESPONSE_TOO_LARGE', async () => {
    const { t, url } = await setup({ bigBody: 5000 });
    const e = await errOf(t.send(url, JSON_BODY, { timeoutMs: 5000, maxBytes: 1000 }));
    expect(e).toBeInstanceOf(ChainAdapterError);
    expect((e as ChainAdapterError).code).toBe('RESPONSE_TOO_LARGE');
    expect(await t.send(url, JSON_BODY, { timeoutMs: 5000, maxBytes: 5000 })).toHaveLength(5000);
    const { t: t2, url: u2 } = await setup({ bigBody: 5000 }, false);
    expect(((await errOf(t2.send(u2, JSON_BODY, { timeoutMs: 5000, maxBytes: 4999 }))) as ChainAdapterError).code).toBe('RESPONSE_TOO_LARGE');
  });
  it('enforces timeoutMs when the server hangs -> transport RPC_FAILURE', async () => {
    const { t, url } = await setup({ hang: true });
    const started = Date.now();
    const e = await errOf(t.send(url, JSON_BODY, { timeoutMs: 300, maxBytes: 1000 }));
    expect(Date.now() - started).toBeLessThan(3000);
    expect(e).toBeInstanceOf(ChainAdapterError);
    expect((e as ChainAdapterError).message).toBe('RPC_FAILURE: transport timeout');
  });
  it('timeout also bounds a hung proxy handshake', async () => {
    const proxy = track(await startSocks5Server({ misbehave: 'hang-after-greeting' }));
    const p = createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}`, isolate: 'none', connectTimeoutMs: 60_000 });
    const started = Date.now();
    const e = await errOf(p.transport('quote').send(`https://${RPC_NAME}/`, JSON_BODY, { timeoutMs: 300, maxBytes: 10 }));
    expect(Date.now() - started).toBeLessThan(3000);
    expect(code(e) === 'PROXY_CONNECT' || (e as Error).message.includes('timeout')).toBe(true);
  });
  it('TLS is verified: untrusted CA and wrong server name both fail', async () => {
    const echo = track(await startHttpEcho({ tls: true }));
    const proxy = track(await startSocks5Server({ auth: 'userpass', hosts: { [RPC_NAME]: '127.0.0.1', 'evil.example.test': '127.0.0.1' } }));
    const mk = (ca?: string): RpcTransport =>
      createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}`, ...(ca !== undefined ? { tlsCa: ca } : {}) }).transport('quote');
    const e1 = await errOf(mk().send(`https://${RPC_NAME}:${String(echo.port)}/`, JSON_BODY, LIM)); // no CA configured
    expect((e1 as ChainAdapterError).message).toBe('RPC_FAILURE: transport error');
    const e2 = await errOf(mk(echo.ca).send(`https://evil.example.test:${String(echo.port)}/`, JSON_BODY, LIM)); // name mismatch
    expect((e2 as ChainAdapterError).message).toBe('RPC_FAILURE: transport error');
    expect(await mk(echo.ca).send(`https://${RPC_NAME}:${String(echo.port)}/`, 'ok', LIM)).toBe('ok');
  });
  it('server closing mid-response is a transport failure', async () => {
    const srv = net.createServer((s) => {
      s.on('data', () => {
        s.write('HTTP/1.1 200 OK\r\ncontent-length: 100\r\n\r\npartial');
        s.destroy();
      });
      s.on('error', () => undefined);
    });
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const port = (srv.address() as net.AddressInfo).port;
    const proxy = track(await startSocks5Server({ auth: 'userpass', hosts: { 'cut.test': '127.0.0.1' } }));
    try {
      const p = createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}`, allowPlainHttp: true });
      const e = await errOf(p.transport('quote').send(`http://cut.test:${String(port)}/`, JSON_BODY, LIM));
      expect((e as ChainAdapterError).message).toBe('RPC_FAILURE: transport error');
    } finally {
      srv.close();
    }
  });
  it('destination refusing connection -> SOCKS_REPLY 5', async () => {
    const proxy = track(await startSocks5Server({ auth: 'userpass', hosts: { 'dead.test': '127.0.0.1' } }));
    const p = createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}`, allowPlainHttp: true });
    const e = await errOf(p.transport('quote').send(`http://dead.test:${String(await closedPort())}/`, JSON_BODY, LIM));
    expect(code(e)).toBe('SOCKS_REPLY');
  });
});

describe('socks5Connect / httpConnect low level', () => {
  it('leftover bytes sent right after the reply are preserved', async () => {
    const srv = net.createServer((s) => s.write('hello-banner'));
    await new Promise<void>((r) => srv.listen(0, '127.0.0.1', r));
    const port = (srv.address() as net.AddressInfo).port;
    const proxy = track(await startSocks5Server({ hosts: { 'banner.test': '127.0.0.1' } }));
    try {
      const sock = await socks5Connect({ proxy: parseProxyUrl(`socks5h://127.0.0.1:${String(proxy.port)}`), host: 'banner.test', port, timeoutMs: 2000 });
      sock.resume();
      const got = await new Promise<string>((resolve) => sock.once('data', (d: Buffer) => resolve(d.toString())));
      expect(got).toBe('hello-banner');
      sock.destroy();
    } finally {
      srv.close();
    }
  });
  it('rejects bad destinations before dialing', async () => {
    const proxy = track(await startSocks5Server());
    const ep = parseProxyUrl(`socks5h://127.0.0.1:${String(proxy.port)}`);
    expect(code(await errOf(socks5Connect({ proxy: ep, host: 'a b', port: 1, timeoutMs: 500 })))).toBe('URL_REJECTED');
    expect(proxy.greetings).toHaveLength(0);
    const long = { username: 'u'.repeat(256), password: 'p' };
    const auth = track(await startSocks5Server({ auth: 'userpass', hosts: { 'a.test': '127.0.0.1' } }));
    expect(code(await errOf(socks5Connect({ proxy: parseProxyUrl(`socks5h://127.0.0.1:${String(auth.port)}`), host: 'a.test', port: 1, credentials: long, timeoutMs: 500 })))).toBe('INVALID_CONFIG');
  });
  it('httpConnect validates its inputs', async () => {
    const ep = parseProxyUrl('socks5h://127.0.0.1:9');
    for (const [host, port] of [['', 1], ['a b', 1], ['a.test', 0], ['a.test', 70000]] as const) {
      expect(code(await errOf(httpConnect({ proxy: ep, host, port, timeoutMs: 100 })))).toBe('URL_REJECTED');
    }
  });
});

describe('i2p-outproxy via HTTP CONNECT', () => {
  it('sends the hostname in CONNECT, tunnels TLS, never resolves locally', async () => {
    const echo = track(await startHttpEcho({ tls: true, responseBody: 'i2p-ok' }));
    const proxy = track(await startConnectProxy({ hosts: { [RPC_NAME]: '127.0.0.1' } }));
    const poisoned = installPoisonedResolver();
    try {
      const p = createI2pOutproxyProfile({ id: 'i2p-outproxy', network: NET, proxyUrl: `http://127.0.0.1:${String(proxy.port)}`, tlsCa: echo.ca });
      expect(await p.transport('submit').send(`https://${RPC_NAME}:${String(echo.port)}/`, JSON_BODY, LIM)).toBe('i2p-ok');
      expect(poisoned.calls).toEqual([]);
    } finally {
      poisoned.restore();
    }
    expect(proxy.records[0]).toMatchObject({ target: `${RPC_NAME}:${String(echo.port)}`, status: 200 });
    expect(proxy.records[0]?.headers['proxy-authorization']).toBeUndefined();
  });
  it('is labelled secondary and does not claim stream isolation', () => {
    const p = createI2pOutproxyProfile({ id: 'i2p-outproxy', network: NET, proxyUrl: 'http://127.0.0.1:4444' });
    expect(p.claims).not.toContain('stream-isolation');
    expect(p.warnings).toEqual(['secondary-best-effort', 'outproxy-sees-destination']);
  });
  it('proxy failures are fixed-message errors', async () => {
    const mk = (port: number): RpcTransport =>
      createI2pOutproxyProfile({ id: 'i2p-outproxy', network: NET, proxyUrl: `http://127.0.0.1:${String(port)}`, connectTimeoutMs: 400, allowPlainHttp: true }).transport('quote');
    const url = `http://${RPC_NAME}:80/`;
    expect(code(await errOf(mk(await closedPort()).send(url, 'x', LIM)))).toBe('PROXY_CONNECT');
    const cases: [Parameters<typeof startConnectProxy>[0], string][] = [
      [{ forceStatus: 403 }, 'HTTP_PROXY'],
      [{}, 'HTTP_PROXY'], // unknown name -> 502
      [{ malformed: true, hosts: { [RPC_NAME]: '127.0.0.1' } }, 'HTTP_PROXY'],
      [{ hugeHeaders: true, hosts: { [RPC_NAME]: '127.0.0.1' } }, 'HTTP_PROXY'],
    ];
    const echo = track(await startHttpEcho());
    for (const [o, c] of cases) {
      const proxy = track(await startConnectProxy(o));
      const e = await errOf(mk(proxy.port).send(`http://${RPC_NAME}:${String(echo.port)}/`, 'x', LIM));
      expect(code(e)).toBe(c);
      expect((e as Error).message).not.toContain(RPC_NAME);
    }
    const hang = net.createServer(() => undefined);
    await new Promise<void>((r) => hang.listen(0, '127.0.0.1', r));
    try {
      expect(code(await errOf(mk((hang.address() as net.AddressInfo).port).send(url, 'x', LIM)))).toBe('PROXY_CONNECT');
    } finally {
      hang.close();
    }
  });
  it('rejects bad URLs and onion destinations; non-loopback proxies by default', async () => {
    const p = createI2pOutproxyProfile({ id: 'i2p-outproxy', network: NET, proxyUrl: 'http://127.0.0.1:4444' });
    expect(code(await errOf(p.transport('quote').send('http://a.test/', 'x', LIM)))).toBe('URL_REJECTED');
    expect(code(await errOf(p.transport('quote').send(`https://${DDG}/`, 'x', LIM)))).toBe('ONION_URL');
    expect(() => createI2pOutproxyProfile({ id: 'i2p-outproxy', network: NET, proxyUrl: 'http://10.0.0.5:4444' })).toThrow(NetTransportError);
    expect(createI2pOutproxyProfile({ id: 'i2p-outproxy', network: NET, proxyUrl: 'http://10.0.0.5:4444', allowNonLoopbackProxy: true }).id).toBe('i2p-outproxy');
    expect(() => createI2pOutproxyProfile({ id: 'i2p-outproxy', network: NET, proxyUrl: 'http://127.0.0.1:4444', connectTimeoutMs: 0 })).toThrow(NetTransportError);
  });
});

describe('onion profile', () => {
  it('validates the onion URL, then reaches it through SOCKS5h by name (http allowed here only)', async () => {
    const echo = track(await startHttpEcho({ responseBody: 'onion-ok' }));
    const proxy = track(await startSocks5Server({ auth: 'userpass', hosts: { [DDG]: '127.0.0.1' } }));
    const p = createOnionProfile({ id: 'onion', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}` });
    expect(await p.transport('quote').send(`http://${DDG}:${String(echo.port)}/rpc`, JSON_BODY, LIM)).toBe('onion-ok');
    expect(proxy.records[0]).toMatchObject({ atyp: 3, host: DDG });
  });
  it('rejects invalid onion URLs without contacting the proxy, and non-onion URLs', async () => {
    const proxy = track(await startSocks5Server());
    const p = createOnionProfile({ id: 'onion', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}` });
    const flipped = `${DDG.slice(0, 5)}${DDG[5] === 'a' ? 'b' : 'a'}${DDG.slice(6)}`;
    for (const u of [`http://${flipped}/`, 'https://example.com/', `http://${DDG.toUpperCase()}/`]) {
      const e = await errOf(p.transport('quote').send(u, 'x', LIM));
      expect(code(e)).toBe('ONION_URL');
      expect((e as Error).message).not.toContain('duckduckgo');
    }
    expect(proxy.greetings).toHaveLength(0);
  });
});

describe('profile creation, defaults and gating', () => {
  it('creating every profile performs no network I/O (AT-NP default)', async () => {
    const proxy = track(await startSocks5Server());
    const connect = track(await startConnectProxy());
    let fetchCalls = 0;
    const fetchImpl: FetchLike = () => {
      fetchCalls++;
      return Promise.reject(new Error('no network allowed'));
    };
    const socks = `socks5h://127.0.0.1:${String(proxy.port)}`;
    const cfgs: ProfileConfig[] = [
      { id: 'direct', network: NET, fetchImpl },
      { id: 'tor-browser', network: NET, fetchImpl },
      { id: 'tor-socks', network: NET, proxyUrl: socks },
      { id: 'onion', network: NET, proxyUrl: socks },
      { id: 'i2p-outproxy', network: NET, proxyUrl: `http://127.0.0.1:${String(connect.port)}` },
      { id: 'nym-mixfetch', network: NET, mixFetch: fetchImpl, experimentalAck: true },
      { id: 'nym-socks5', network: NET, proxyUrl: socks, experimentalAck: true },
    ];
    for (const c of cfgs) {
      const p = createProfile(c);
      expect(p.id).toBe(c.id);
      p.transport('health');
    }
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchCalls).toBe(0);
    expect(proxy.greetings).toHaveLength(0);
    expect(connect.records).toHaveLength(0);
  });
  it('every profile id is testnet-guarded at creation', () => {
    for (const chainId of [1, 8453, 10]) {
      for (const id of PROFILE_IDS) {
        expect(() => createProfile({ id, network: { kind: 'evm', chainId } } as unknown as ProfileConfig)).toThrow(/testnet PoC/);
      }
    }
    expect(() => createProfile({ id: 'direct' } as unknown as ProfileConfig)).toThrow(NetTransportError);
    expect(() => createProfile(undefined as unknown as ProfileConfig)).toThrow(NetTransportError);
    expect(() => createProfile({ id: 'warp', network: NET } as unknown as ProfileConfig)).toThrow('unknown transport profile');
  });
  it('rejects socks5:// at config time (PROXY_LOCAL_DNS) for every SOCKS-based profile', () => {
    for (const id of ['tor-socks', 'onion', 'nym-socks5'] as const) {
      expect(() => createProfile({ id, network: NET, proxyUrl: 'socks5://127.0.0.1:9050', experimentalAck: true })).toThrow(expect.objectContaining({ code: 'PROXY_LOCAL_DNS' }));
    }
  });
  it('claims: tor-socks claims isolation only when enabled; nym never claims it; direct and tor-browser claim nothing', () => {
    const socks = 'socks5h://127.0.0.1:9150';
    expect(createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: socks }).claims).toEqual(['hides-ip-from-destination', 'dns-remote', 'stream-isolation']);
    expect(createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: socks, isolate: 'none' }).claims).toEqual(['hides-ip-from-destination', 'dns-remote']);
    const nym = createNymSocksProfile({ id: 'nym-socks5', network: NET, proxyUrl: socks, isolate: 'per-purpose', experimentalAck: true });
    expect(nym.claims).not.toContain('stream-isolation');
    expect(nym.experimental).toBe(true);
    expect(createDirectProfile({ id: 'direct', network: NET }).claims).toEqual([]);
    expect(createTorBrowserProfile({ id: 'tor-browser', network: NET }).claims).toEqual([]);
    expect(createNymMixFetchProfile({ id: 'nym-mixfetch', network: NET, mixFetch: () => Promise.reject(new Error('x')), experimentalAck: true }).claims).not.toContain('stream-isolation');
  });
  it('experimental profiles need the explicit opt-in; mixFetch must exist', () => {
    const socks = 'socks5h://127.0.0.1:9150';
    expect(() => createNymSocksProfile({ id: 'nym-socks5', network: NET, proxyUrl: socks, experimentalAck: false })).toThrow(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    expect(() => createNymMixFetchProfile({ id: 'nym-mixfetch', network: NET, mixFetch: undefined, experimentalAck: true })).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_ENV' }));
    expect(() => createNymMixFetchProfile({ id: 'nym-mixfetch', network: NET, mixFetch: () => Promise.reject(new Error('x')), experimentalAck: false })).toThrow(expect.objectContaining({ code: 'INVALID_CONFIG' }));
  });
  it('connectTimeoutMs is validated', () => {
    for (const v of [0, -1, 1.5]) {
      expect(() => createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: 'socks5h://127.0.0.1:9150', connectTimeoutMs: v })).toThrow(NetTransportError);
    }
  });
});

describe('selfTest and blocking (NP-T-5, AT-NP-4)', () => {
  it('passes against a healthy proxy and reports no hosts', async () => {
    const proxy = track(await startSocks5Server({ auth: 'userpass' }));
    const p = createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}` });
    const r = await p.selfTest();
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => c.id)).toEqual(['proxy-handshake', 'remote-dns']);
    expect(JSON.stringify(r)).not.toContain('127.0.0.1');
    expect(proxy.records).toHaveLength(0); // handshake only, no CONNECT
    expect(proxy.greetings[0]).toEqual([2]);
  });
  it('probe: eth_chainId through the profile must match', async () => {
    const echo = track(await startHttpEcho({ responseBody: CHAIN_ID_RESPONSE }));
    const proxy = track(await startSocks5Server({ auth: 'userpass', hosts: { 'node.test': '127.0.0.1' } }));
    const p = createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}`, allowPlainHttp: true });
    const url = `http://node.test:${String(echo.port)}/`;
    const ok = await p.selfTest({ probe: { url, expectedChainId: 84532 } });
    expect(ok.ok).toBe(true);
    expect(ok.checks.at(-1)).toMatchObject({ id: 'probe-chain-id', ok: true });
    const bad = await p.selfTest({ probe: { url, expectedChainId: 11155111 } });
    expect(bad.ok).toBe(false);
    expect(bad.checks.at(-1)?.detail).toBe('eth_chainId did not match');
    expect(JSON.stringify(bad)).not.toContain('node.test');
    const aborted = new AbortController();
    aborted.abort();
    expect((await p.selfTest({ signal: aborted.signal, probe: { url, expectedChainId: 84532 } })).checks.at(-1)?.detail).toBe('aborted');
  });
  it('failed self-test blocks every transport until a later one passes; there is no fallback to direct', async () => {
    const echo = track(await startHttpEcho({ tls: true }));
    const proxyPort = await closedPort();
    const p = createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxyPort)}`, connectTimeoutMs: 300, tlsCa: echo.ca });
    const t = p.transport('quote');
    const r = await p.selfTest();
    expect(r.ok).toBe(false);
    expect(r.checks[0]).toMatchObject({ id: 'local', ok: false, detail: 'failed: PROXY_CONNECT' });
    const e = await errOf(t.send(`https://${RPC_NAME}:${String(echo.port)}/`, 'x', LIM));
    expect(code(e)).toBe('PROFILE_SELFTEST');
    expect(echo.records).toHaveLength(0);
    // bring the proxy up on that port: the same profile unblocks after a passing self-test
    const proxy = track(await startSocks5Server({ hosts: { [RPC_NAME]: '127.0.0.1' } }));
    const p2 = createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}`, tlsCa: echo.ca, isolate: 'none' });
    expect((await p2.selfTest()).ok).toBe(true);
    expect(await p2.transport('quote').send(`https://${RPC_NAME}:${String(echo.port)}/`, 'fine', LIM)).toBe('fine');
  });
  it('tor-browser self-check is local, reports facts, and cannot prove Tor', async () => {
    const good = createTorBrowserProfile({ id: 'tor-browser', network: NET, env: { isSecureContext: true, hasSubtleCrypto: true, storageAvailable: true } });
    const r = await good.selfTest();
    expect(r.ok).toBe(true);
    expect(r.checks.find((c) => c.id === 'user-assertion')?.detail).toContain('cannot verify Tor Browser');
    const bad = await createTorBrowserProfile({ id: 'tor-browser', network: NET, env: { isSecureContext: false, hasSubtleCrypto: true, storageAvailable: false } }).selfTest();
    expect(bad.ok).toBe(false);
    expect(bad.checks.filter((c) => !c.ok).map((c) => c.id)).toEqual(['secure-context', 'storage']);
    expect((await createTorBrowserProfile({ id: 'tor-browser', network: NET }).selfTest()).ok).toBe(false);
  });
  it('direct self-test is trivially ok and says who sees your IP', async () => {
    const r = await createDirectProfile({ id: 'direct', network: NET }).selfTest();
    expect(r.ok).toBe(true);
    expect(r.checks[0]?.detail).toContain('sees your IP');
  });
  it('a throw that is not a NetTransportError is reported generically', async () => {
    const proxy = track(await startSocks5Server());
    const p = createTorSocksProfile({ id: 'tor-socks', network: NET, proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}`, rand: () => new Uint8Array(1) });
    const r = await p.selfTest();
    expect(r.ok).toBe(false);
    expect(r.checks[0]?.detail).toBe('failed: INVALID_CONFIG');
    const q = createTorSocksProfile({
      id: 'tor-socks',
      network: NET,
      proxyUrl: `socks5h://127.0.0.1:${String(proxy.port)}`,
      rand: () => {
        throw new Error('boom');
      },
    });
    expect((await q.selfTest()).checks[0]?.detail).toBe('failed');
  });
});

describe('direct and fetch-based profiles', () => {
  it('direct: real loopback request via global fetch, contract honoured', async () => {
    const echo = track(await startHttpEcho());
    const p = createDirectProfile({ id: 'direct', network: NET, allowInsecureLocalhost: true });
    const t = p.transport('quote');
    expect(await t.send(`${echo.baseUrl}/x`, JSON_BODY, LIM)).toBe(JSON_BODY);
    expect(echo.records[0]?.headers['content-type']).toBe('application/json');
    const e500 = track(await startHttpEcho({ status: 500, responseBody: 'x' }));
    expect(await errOf(t.send(e500.baseUrl, 'x', LIM))).toBeInstanceOf(RpcHttpError);
    const big = track(await startHttpEcho({ bigBody: 5000 }));
    expect(((await errOf(t.send(big.baseUrl, 'x', { timeoutMs: 3000, maxBytes: 100 }))) as ChainAdapterError).code).toBe('RESPONSE_TOO_LARGE');
    const hang = track(await startHttpEcho({ hang: true }));
    expect(((await errOf(t.send(hang.baseUrl, 'x', { timeoutMs: 200, maxBytes: 100 }))) as ChainAdapterError).message).toBe('RPC_FAILURE: transport error or timeout');
    const redirect = track(await startHttpEcho({ status: 302, responseHeaders: { location: `${echo.baseUrl}/r` }, responseBody: '' }));
    const before = echo.records.length;
    expect(await errOf(t.send(redirect.baseUrl, 'x', LIM))).toBeInstanceOf(ChainAdapterError);
    expect(echo.records.length).toBe(before);
  });
  it('direct: URL policy (https only, no userinfo; loopback http needs the flag; wss refused)', async () => {
    const strict = createDirectProfile({ id: 'direct', network: NET }).transport('quote');
    const e1 = await errOf(strict.send('http://127.0.0.1:1/', 'x', LIM));
    expect((e1 as Error).message).toContain('RPC_URL_REJECTED');
    expect((e1 as Error).message).not.toContain('127.0.0.1');
    expect((await errOf(strict.send('https://u:p@a.test/', 'x', LIM)) as Error).message).toContain('RPC_URL_REJECTED');
    expect(code(await errOf(strict.send('wss://a.test/', 'x', LIM)))).toBe('URL_REJECTED');
  });
  it('fetch-based profiles use the injected fetch with hardened options; empty body and missing fetch handled', async () => {
    const seen: unknown[] = [];
    const mk = (body: ReadableStream<Uint8Array> | null, ok = true): FetchLike => (url, init) => {
      seen.push({ url, ...init, signal: undefined });
      return Promise.resolve({ ok, status: ok ? 200 : 503, body });
    };
    const stream = (s: string): ReadableStream<Uint8Array> => new ReadableStream({ start: (c) => { c.enqueue(new TextEncoder().encode(s)); c.close(); } });
    const nym = createNymMixFetchProfile({ id: 'nym-mixfetch', network: NET, mixFetch: mk(stream('mixed')), experimentalAck: true });
    expect(await nym.transport('quote').send('https://a.test/p', 'B', LIM)).toBe('mixed');
    expect(seen[0]).toMatchObject({ url: 'https://a.test/p', method: 'POST', body: 'B', redirect: 'error', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer' });
    const empty = createNymMixFetchProfile({ id: 'nym-mixfetch', network: NET, mixFetch: mk(null), experimentalAck: true });
    expect(((await errOf(empty.transport('quote').send('https://a.test/', 'x', LIM))) as ChainAdapterError).message).toBe('RPC_FAILURE: empty body');
    const bad = createNymMixFetchProfile({ id: 'nym-mixfetch', network: NET, mixFetch: mk(null, false), experimentalAck: true });
    expect(((await errOf(bad.transport('quote').send('https://a.test/', 'x', LIM))) as RpcHttpError).status).toBe(503);
    const tb = createTorBrowserProfile({ id: 'tor-browser', network: NET, fetchImpl: mk(stream('tb')) });
    expect(await tb.transport('quote').send('https://a.test/', 'x', LIM)).toBe('tb');
    const throwing = createDirectProfile({ id: 'direct', network: NET, fetchImpl: () => Promise.reject(new Error('https://leak.example.test/secret')) });
    const e = await errOf(throwing.transport('quote').send('https://a.test/', 'x', LIM));
    expect((e as Error).message).toBe('RPC_FAILURE: transport error or timeout');
    const nofetch = vi_stubFetchUndefined();
    try {
      const p = createDirectProfile({ id: 'direct', network: NET });
      expect(code(await errOf(p.transport('quote').send('https://a.test/', 'x', LIM)))).toBe('UNSUPPORTED_ENV');
    } finally {
      nofetch();
    }
  });
});

function vi_stubFetchUndefined(): () => void {
  const g = globalThis as { fetch?: unknown };
  const saved = g.fetch;
  g.fetch = undefined;
  return () => {
    g.fetch = saved;
  };
}
