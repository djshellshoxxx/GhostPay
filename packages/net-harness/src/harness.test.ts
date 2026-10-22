import dns from 'node:dns';
import net from 'node:net';
import tls from 'node:tls';
import http from 'node:http';
import { afterEach, describe, expect, it } from 'vitest';
import {
  assertLoopback,
  installPoisonedResolver,
  isLoopbackHost,
  startConnectProxy,
  startHttpEcho,
  startOhttpGateway,
  startOhttpRelay,
  startSocks5Server,
  OHTTP_REQ_TYPE,
  type Running,
  TEST_TLS_HOSTNAMES,
} from './index.js';

const toClose: Running[] = [];
afterEach(async () => {
  while (toClose.length > 0) await toClose.pop()?.close();
});
function track<T extends Running>(r: T): T {
  toClose.push(r);
  return r;
}

/** Sends bytes and collects everything until the peer closes or `until` bytes arrive. */
function exchange(port: number, chunks: Buffer[], wantBytes: number, waitMs = 300): Promise<Buffer> {
  return new Promise((resolve) => {
    const s = net.connect({ host: '127.0.0.1', port });
    const got: Buffer[] = [];
    let total = 0;
    const done = (): void => {
      s.destroy();
      resolve(Buffer.concat(got));
    };
    const t = setTimeout(done, waitMs);
    s.on('data', (d: Buffer) => {
      got.push(d);
      total += d.length;
      if (total >= wantBytes) {
        clearTimeout(t);
        done();
      }
    });
    s.on('error', done);
    s.on('close', () => {
      clearTimeout(t);
      done();
    });
    s.on('connect', () => {
      for (const c of chunks) s.write(c);
    });
  });
}

const greet = (...methods: number[]): Buffer => Buffer.from([5, methods.length, ...methods]);
function connectReq(host: string, port: number, cmd = 1): Buffer {
  const h = Buffer.from(host);
  const p = Buffer.alloc(2);
  p.writeUInt16BE(port);
  return Buffer.concat([Buffer.from([5, cmd, 0, 3, h.length]), h, p]);
}

describe('loopback guard', () => {
  it('accepts loopback and rejects everything else', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('::1')).toBe(true);
    expect(isLoopbackHost('0.0.0.0')).toBe(false);
    expect(isLoopbackHost('192.168.1.10')).toBe(false);
    expect(isLoopbackHost('example.com')).toBe(false);
    expect(() => assertLoopback('0.0.0.0', 'x')).toThrow('must be loopback');
    expect(() => assertLoopback('127.0.0.1', 'x')).not.toThrow();
  });
  it('refuses non-loopback binds on every server', async () => {
    await expect(startSocks5Server({ host: '0.0.0.0' })).rejects.toThrow();
    await expect(startConnectProxy({ host: '0.0.0.0' })).rejects.toThrow();
    await expect(startHttpEcho({ host: '0.0.0.0' })).rejects.toThrow();
    await expect(startOhttpGateway({ host: '0.0.0.0', keyConfig: new Uint8Array(), handle: () => Promise.resolve(new Uint8Array()) })).rejects.toThrow();
    await expect(startOhttpRelay({ host: '0.0.0.0', gatewayUrl: 'http://127.0.0.1:1' })).rejects.toThrow();
    await expect(startOhttpRelay({ gatewayUrl: 'http://10.0.0.1:1' })).rejects.toThrow();
  });
  it('close is idempotent', async () => {
    const s = await startHttpEcho();
    await s.close();
    await s.close();
  });
});

describe('http echo', () => {
  it('records and echoes', async () => {
    const e = track(await startHttpEcho());
    const res = await fetch(`${e.baseUrl}/x?y=1`, { method: 'POST', body: '{"a":1}' });
    expect(await res.text()).toBe('{"a":1}');
    expect(e.records).toHaveLength(1);
    expect(e.records[0]?.url).toBe('/x?y=1');
    expect(e.records[0]?.body.toString()).toBe('{"a":1}');
    expect(e.records[0]?.method).toBe('POST');
  });
  it('fixed status, headers, bigBody, delay', async () => {
    const e1 = track(await startHttpEcho({ status: 302, responseHeaders: { location: 'http://127.0.0.1:1/' }, responseBody: 'r' }));
    const r1 = await fetch(e1.baseUrl, { redirect: 'manual' });
    expect(r1.status).toBe(302);
    const e2 = track(await startHttpEcho({ bigBody: 5000 }));
    expect((await (await fetch(e2.baseUrl)).text()).length).toBe(5000);
    const e3 = track(await startHttpEcho({ delayMs: 20 }));
    expect((await fetch(e3.baseUrl)).status).toBe(200);
  });
  it('hang records but never answers', async () => {
    const e = track(await startHttpEcho({ hang: true }));
    const ctl = AbortSignal.timeout(100);
    await expect(fetch(e.baseUrl, { signal: ctl })).rejects.toThrow();
    expect(e.records).toHaveLength(1);
  });
  it('serves TLS with the test certificate for the fake names', async () => {
    const e = track(await startHttpEcho({ tls: true, responseBody: 'tls-ok' }));
    expect(e.baseUrl.startsWith('https://')).toBe(true);
    expect(TEST_TLS_HOSTNAMES).toContain('rpc.example.test');
    const body = await new Promise<string>((resolve, reject) => {
      const s = tls.connect({ host: '127.0.0.1', port: e.port, servername: 'rpc.example.test', ca: e.ca }, () => {
        s.write('GET / HTTP/1.1\r\nhost: x\r\nconnection: close\r\n\r\n');
      });
      let out = '';
      s.on('data', (d: Buffer) => (out += d.toString()));
      s.on('end', () => resolve(out));
      s.on('error', reject);
    });
    expect(body).toContain('tls-ok');
  });
  it('rejects a wrong servername', async () => {
    const e = track(await startHttpEcho({ tls: true }));
    await new Promise<void>((resolve, reject) => {
      const s = tls.connect({ host: '127.0.0.1', port: e.port, servername: 'evil.example.test', ca: e.ca });
      s.on('secureConnect', () => reject(new Error('should not connect')));
      s.on('error', () => resolve());
    });
  });
});

describe('socks5 server', () => {
  it('no-auth: resolves the name itself and tunnels, recording ATYP 3', async () => {
    const echo = track(await startHttpEcho({ responseBody: 'hi' }));
    const p = track(await startSocks5Server({ hosts: { 'echo.test': '127.0.0.1' } }));
    const reply = await exchange(
      p.port,
      [greet(0), connectReq('echo.test', echo.port), Buffer.from('GET / HTTP/1.0\r\n\r\n')],
      1000,
      400,
    );
    expect(reply.subarray(0, 2)).toEqual(Buffer.from([5, 0]));
    expect(reply[2]).toBe(5);
    expect(reply[3]).toBe(0);
    expect(reply.toString('latin1')).toContain('hi');
    expect(p.records[0]).toMatchObject({ atyp: 3, host: 'echo.test', port: echo.port, cmd: 1, reply: 0 });
    expect(p.greetings[0]).toEqual([0]);
    expect(echo.records).toHaveLength(1);
  });
  it('userpass: records credentials, rejects bad ones', async () => {
    const echo = track(await startHttpEcho());
    const p = track(
      await startSocks5Server({ auth: 'userpass', hosts: { 'e.test': '127.0.0.1' }, checkCredentials: (u, pw) => u === 'gp1-x' && pw === 'pw' }),
    );
    const auth = (u: string, pw: string): Buffer => Buffer.concat([Buffer.from([1, u.length]), Buffer.from(u), Buffer.from([pw.length]), Buffer.from(pw)]);
    const ok = await exchange(p.port, [greet(2), auth('gp1-x', 'pw'), connectReq('e.test', echo.port)], 14, 400);
    expect(ok.subarray(0, 4)).toEqual(Buffer.from([5, 2, 1, 0]));
    expect(p.records[0]).toMatchObject({ username: 'gp1-x', password: 'pw', reply: 0 });
    const bad = await exchange(p.port, [greet(2), auth('nope', 'pw')], 4, 300);
    expect(bad).toEqual(Buffer.from([5, 2, 1, 1]));
    expect(p.records).toHaveLength(1);
  });
  it('rejects when the required method is not offered', async () => {
    const p = track(await startSocks5Server({ auth: 'userpass' }));
    expect(await exchange(p.port, [greet(0)], 2)).toEqual(Buffer.from([5, 0xff]));
    const q = track(await startSocks5Server());
    expect(await exchange(q.port, [greet(2)], 2)).toEqual(Buffer.from([5, 0xff]));
  });
  it('bad greeting version closes with 0xff', async () => {
    const p = track(await startSocks5Server());
    expect(await exchange(p.port, [Buffer.from([4, 1, 0])], 2)).toEqual(Buffer.from([5, 0xff]));
    const q = track(await startSocks5Server({ misbehave: 'bad-greeting-version' }));
    expect(await exchange(q.port, [greet(0)], 2)).toEqual(Buffer.from([5, 0xff]));
  });
  it('unknown name -> reply 4; non-CONNECT -> 7; forced reply; non-loopback dial -> 2', async () => {
    const p = track(await startSocks5Server());
    const r1 = await exchange(p.port, [greet(0), connectReq('nope.test', 80)], 12);
    expect(r1[3]).toBe(4);
    const r2 = await exchange(p.port, [greet(0), connectReq('nope.test', 80, 3)], 12);
    expect(r2[3]).toBe(7);
    const f = track(await startSocks5Server({ forceReply: 5 }));
    const r3 = await exchange(f.port, [greet(0), connectReq('x.test', 80)], 12);
    expect(r3[3]).toBe(5);
    const g = track(await startSocks5Server({ hosts: { 'far.test': '8.8.8.8' } }));
    const r4 = await exchange(g.port, [greet(0), connectReq('far.test', 80)], 12);
    expect(r4[3]).toBe(2);
    expect(g.records[0]?.reply).toBe(2);
  });
  it('IPv4 and IPv6 literals are recorded with their ATYP', async () => {
    const echo = track(await startHttpEcho());
    const p = track(await startSocks5Server());
    const port = Buffer.alloc(2);
    port.writeUInt16BE(echo.port);
    await exchange(p.port, [greet(0), Buffer.concat([Buffer.from([5, 1, 0, 1, 127, 0, 0, 1]), port])], 10, 300);
    const v6 = Buffer.concat([Buffer.from([5, 1, 0, 4]), Buffer.alloc(15), Buffer.from([1]), port]);
    const r = await exchange(p.port, [greet(0), v6], 12, 300);
    const far6 = Buffer.concat([Buffer.from([5, 1, 0, 4]), Buffer.alloc(15), Buffer.from([2]), port]);
    const r6 = await exchange(p.port, [greet(0), far6], 12, 300);
    expect(r6[3]).toBe(2);
    expect(p.records[0]).toMatchObject({ atyp: 1, host: '127.0.0.1' });
    expect(p.records[1]).toMatchObject({ atyp: 4, host: '::1' });
    expect(r[3]).toBe(5); // ::1 is allowed as a target but nothing listens there
    expect(p.records[2]).toMatchObject({ atyp: 4, host: '0:0:0:0:0:0:0:2', reply: 2 });
  });
  it('unknown ATYP closes the connection', async () => {
    const p = track(await startSocks5Server());
    const r = await exchange(p.port, [greet(0), Buffer.from([5, 1, 0, 9, 0, 0, 0, 0])], 100, 200);
    expect(r).toEqual(Buffer.from([5, 0]));
  });
  it('connect refused by the target gives reply 5', async () => {
    const dead = await startHttpEcho();
    const port = dead.port;
    await dead.close();
    const p = track(await startSocks5Server({ hosts: { 'dead.test': '127.0.0.1' } }));
    const r = await exchange(p.port, [greet(0), connectReq('dead.test', port)], 12, 500);
    expect(r[3]).toBe(5);
  });
  it('handles requests split across TCP segments', async () => {
    const echo = track(await startHttpEcho({ responseBody: 'split' }));
    const p = track(await startSocks5Server({ hosts: { 'e.test': '127.0.0.1' } }));
    const req = connectReq('e.test', echo.port);
    const r = await exchange(p.port, [greet(0).subarray(0, 1), greet(0).subarray(1), req.subarray(0, 3), req.subarray(3, 6), req.subarray(6), Buffer.from('GET / HTTP/1.0\r\n\r\n')], 500, 500);
    expect(r.toString('latin1')).toContain('split');
  });
  it('misbehaviours', async () => {
    const mk = async (m: Parameters<typeof startSocks5Server>[0]): Promise<Buffer> => {
      const echo = track(await startHttpEcho());
      const p = track(await startSocks5Server({ hosts: { 'e.test': '127.0.0.1' }, ...m }));
      return exchange(p.port, [greet(0), connectReq('e.test', echo.port)], 200, 300);
    };
    expect((await mk({ misbehave: 'bad-reply-version' }))[2]).toBe(4);
    expect((await mk({ misbehave: 'truncated-reply' })).length).toBeLessThanOrEqual(7);
    expect((await mk({ misbehave: 'garbage-reply' })).subarray(2, 6)).toEqual(Buffer.from([0xde, 0xad, 0xbe, 0xef]));
    expect(await mk({ misbehave: 'hang-after-greeting' })).toEqual(Buffer.from([5, 0]));
    expect(await mk({ misbehave: 'close-after-greeting' })).toEqual(Buffer.alloc(0));
    expect((await mk({ misbehave: 'reply-domain-bound-address' })).subarray(2, 7)).toEqual(Buffer.from([5, 0, 0, 3, 3]));
    expect((await mk({ misbehave: 'reply-ipv6-bound-address' }))[5]).toBe(4);
    expect((await mk({ misbehave: 'reply-bad-atyp' }))[5]).toBe(9);
    const echo = track(await startHttpEcho());
    const p = track(await startSocks5Server({ auth: 'userpass', misbehave: 'hang-after-auth' }));
    const a = Buffer.from([1, 1, 0x61, 1, 0x62]);
    expect(await exchange(p.port, [greet(2), a, connectReq('e.test', echo.port)], 100, 300)).toEqual(Buffer.from([5, 2, 1, 0]));
  });
  it('tracks open connections', async () => {
    const p = track(await startSocks5Server());
    const s = net.connect({ host: '127.0.0.1', port: p.port });
    await new Promise((r) => s.once('connect', r));
    await new Promise((r) => setTimeout(r, 20));
    expect(p.openConnections()).toBe(1);
    s.destroy();
  });
});

describe('connect proxy', () => {
  async function req(port: number, head: string, extra = ''): Promise<string> {
    return (await exchange(port, [Buffer.from(head + extra)], 100000, 300)).toString('latin1');
  }
  it('tunnels by name and records the target', async () => {
    const echo = track(await startHttpEcho({ responseBody: 'via-connect' }));
    const p = track(await startConnectProxy({ hosts: { 'echo.test': '127.0.0.1' } }));
    const out = await req(p.port, `CONNECT echo.test:${String(echo.port)} HTTP/1.1\r\nHost: echo.test:${String(echo.port)}\r\nX-A: b\r\n\r\n`, 'GET / HTTP/1.0\r\n\r\n');
    expect(out.startsWith('HTTP/1.1 200')).toBe(true);
    expect(out).toContain('via-connect');
    expect(p.records[0]).toMatchObject({ target: `echo.test:${String(echo.port)}`, status: 200 });
    expect(p.records[0]?.headers['x-a']).toBe('b');
  });
  it('loopback literal targets work; others get 502; bad line 400; forced status', async () => {
    const echo = track(await startHttpEcho());
    const p = track(await startConnectProxy());
    expect((await req(p.port, `CONNECT 127.0.0.1:${String(echo.port)} HTTP/1.1\r\n\r\n`)).startsWith('HTTP/1.1 200')).toBe(true);
    expect((await req(p.port, 'CONNECT unknown.test:80 HTTP/1.1\r\n\r\n')).startsWith('HTTP/1.1 502')).toBe(true);
    expect((await req(p.port, 'GET / HTTP/1.1\r\n\r\n')).startsWith('HTTP/1.1 400')).toBe(true);
    const f = track(await startConnectProxy({ forceStatus: 403 }));
    expect((await req(f.port, 'CONNECT a.test:1 HTTP/1.1\r\n\r\n')).startsWith('HTTP/1.1 403')).toBe(true);
    const d = await startHttpEcho();
    const dp = d.port;
    await d.close();
    expect((await req(p.port, `CONNECT 127.0.0.1:${String(dp)} HTTP/1.1\r\n\r\n`)).startsWith('HTTP/1.1 502')).toBe(true);
    const far = track(await startConnectProxy({ hosts: { 'far.test': '8.8.8.8' } }));
    expect((await req(far.port, 'CONNECT far.test:80 HTTP/1.1\r\n\r\n')).startsWith('HTTP/1.1 502')).toBe(true);
  });
  it('malformed and huge replies', async () => {
    const echo = track(await startHttpEcho());
    const m = track(await startConnectProxy({ malformed: true }));
    expect((await req(m.port, `CONNECT 127.0.0.1:${String(echo.port)} HTTP/1.1\r\n\r\n`)).startsWith('HTTP/1.1 banana')).toBe(true);
    const h = track(await startConnectProxy({ hugeHeaders: true }));
    expect((await req(h.port, `CONNECT 127.0.0.1:${String(echo.port)} HTTP/1.1\r\n\r\n`)).length).toBeGreaterThan(65_000);
  });
});

describe('ohttp stubs', () => {
  it('gateway serves keys, enforces media type, delegates, 400 on handler throw', async () => {
    const gw = track(
      await startOhttpGateway({
        keyConfig: Uint8Array.from([1, 2, 3]),
        handle: (b) => (b.length === 0 ? Promise.reject(new Error('x')) : Promise.resolve(Uint8Array.from([...b].reverse()))),
      }),
    );
    const keys = await fetch(`${gw.baseUrl}/ohttp-keys`);
    expect(keys.headers.get('content-type')).toBe('application/ohttp-keys');
    expect([...new Uint8Array(await keys.arrayBuffer())]).toEqual([1, 2, 3]);
    const ok = await fetch(`${gw.baseUrl}/ohttp-gateway`, { method: 'POST', headers: { 'content-type': OHTTP_REQ_TYPE }, body: Uint8Array.from([9, 8]) });
    expect([...new Uint8Array(await ok.arrayBuffer())]).toEqual([8, 9]);
    expect(ok.headers.get('content-type')).toBe('message/ohttp-res');
    expect((await fetch(`${gw.baseUrl}/ohttp-gateway`, { method: 'POST', headers: { 'content-type': 'text/plain' }, body: 'x' })).status).toBe(415);
    expect((await fetch(`${gw.baseUrl}/ohttp-gateway`, { method: 'POST', headers: { 'content-type': OHTTP_REQ_TYPE }, body: new Uint8Array() })).status).toBe(400);
    expect((await fetch(`${gw.baseUrl}/nope`)).status).toBe(404);
  });
  it('relay forwards opaque bytes and records what it saw', async () => {
    const gw = track(await startOhttpGateway({ keyConfig: new Uint8Array(), handle: (b) => Promise.resolve(b) }));
    const relay = track(await startOhttpRelay({ gatewayUrl: gw.baseUrl }));
    const r = await fetch(relay.relayUrl, { method: 'POST', headers: { 'content-type': OHTTP_REQ_TYPE }, body: Uint8Array.from([7, 7, 7]) });
    expect([...new Uint8Array(await r.arrayBuffer())]).toEqual([7, 7, 7]);
    expect(relay.records[0]?.body.length).toBe(3);
    expect(gw.records.filter((x) => x.path === '/ohttp-gateway')).toHaveLength(1);
    expect((await fetch(relay.relayUrl, { method: 'POST', headers: { 'content-type': 'x/y' }, body: 'x' })).status).toBe(415);
    expect((await fetch(relay.relayUrl.replace('/relay', '/other'))).status).toBe(404);
  });
  it('relay answers 502 when the gateway is down', async () => {
    const gw = await startOhttpGateway({ keyConfig: new Uint8Array(), handle: (b) => Promise.resolve(b) });
    const url = gw.baseUrl;
    await gw.close();
    const relay = track(await startOhttpRelay({ gatewayUrl: url }));
    const r = await fetch(relay.relayUrl, { method: 'POST', headers: { 'content-type': OHTTP_REQ_TYPE }, body: 'x' });
    expect(r.status).toBe(502);
  });
});

describe('poisoned resolver', () => {
  it('records and fails local resolution, then restores', async () => {
    const orig = dns.lookup;
    const p = installPoisonedResolver();
    await expect(dns.promises.lookup('leak.example.test')).rejects.toThrow('poisoned');
    await expect(dns.promises.resolve('leak2.example.test')).rejects.toThrow('poisoned');
    await expect(dns.promises.resolve4(5 as unknown as string)).rejects.toThrow('poisoned');
    const err = await new Promise<Error | null>((resolve) => {
      dns.lookup('leak3.example.test', (e) => resolve(e));
    });
    expect(err?.message).toContain('poisoned');
    dns.resolve('x.example.test', () => undefined);
    dns.lookup(7 as unknown as string, () => undefined);
    // a plain net.connect to a name must hit the poisoned resolver
    await new Promise<void>((resolve) => {
      const s = net.connect({ host: 'leak4.example.test', port: 9 });
      s.on('error', () => resolve());
    });
    expect(p.calls).toEqual(
      expect.arrayContaining(['leak.example.test', 'leak2.example.test', '?', 'leak3.example.test', 'x.example.test', 'leak4.example.test']),
    );
    p.restore();
    p.restore();
    expect(dns.lookup).toBe(orig);
  });
  it('is invisible to a loopback IP connect', async () => {
    const e = track(await startHttpEcho());
    const p = installPoisonedResolver();
    await new Promise<void>((resolve, reject) => {
      const req = http.get({ host: '127.0.0.1', port: e.port }, (res) => {
        res.resume();
        res.on('end', resolve);
      });
      req.on('error', reject);
    });
    expect(p.calls).toEqual([]);
    p.restore();
  });
});
