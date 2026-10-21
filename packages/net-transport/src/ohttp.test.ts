import { afterEach, describe, expect, it } from 'vitest';
import { ChainAdapterError, RpcHttpError } from '@ghostpay/chain-adapters';
import { startHttpEcho, startOhttpGateway, startOhttpRelay, type Running } from '@ghostpay/net-harness';
import {
  NetTransportError,
  compareRelayGateway,
  createOhttpProfile,
  fetchRelayPost,
  decapsulateResponse,
  decodeBhttpRequest,
  encapsulateRequest,
  encodeBhttpResponse,
  encodeKeyConfig,
  encodeKeyConfigs,
  gatewayDecapsulate,
  parseKeyConfig,
  parseKeyConfigs,
  requestHeader,
  requestInfo,
  selectSuite,
  aeadParams,
  type GatewayKey,
  type NetworkRef,
  type OhttpConfig,
  type OhttpKeyConfig,
  type RelayPost,
} from './index.js';
import { FAKE_PUBLIC_KEY, counterRandom, fakeHpke } from './fakeHpke.testutil.js';

const NET: NetworkRef = { kind: 'evm', chainId: 11155111 };
const hex = (b: Uint8Array): string => Buffer.from(b).toString('hex');
const fromHex = (h: string): Uint8Array => Uint8Array.from(Buffer.from(h, 'hex'));
const te = new TextEncoder();
const td = new TextDecoder();
const BODY = '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}';
const LIM = { timeoutMs: 5000, maxBytes: 100_000 };

// RFC 9458 appendix A example key configuration, recalled from memory: UNVERIFIED.
const RFC_KEY_CONFIG_HEX = '01002031e1f05a740102115220e9af918f738674aec95f54db6e04eb705aae8e79815500080001000100010003';

const CONFIG: OhttpKeyConfig = {
  keyId: 7,
  kemId: 0x0020,
  publicKey: FAKE_PUBLIC_KEY,
  suites: [
    { kdfId: 0x0001, aeadId: 0x0001 },
    { kdfId: 0x0001, aeadId: 0x0003 },
  ],
};
const KEYS = encodeKeyConfigs([CONFIG]);

const toClose: Running[] = [];
afterEach(async () => {
  while (toClose.length > 0) await toClose.pop()?.close();
});
function track<T extends Running>(r: T): T {
  toClose.push(r);
  return r;
}
async function errOf(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error('expected rejection');
}
const code = (e: unknown): string => (e instanceof NetTransportError ? e.code : `other:${(e as Error).name}`);

describe('key configuration parsing (RFC 9458 section 3) [UNVERIFIED]', () => {
  it('parses the recalled RFC example and re-encodes it byte for byte', () => {
    const c = parseKeyConfig(fromHex(RFC_KEY_CONFIG_HEX));
    expect(c.keyId).toBe(1);
    expect(c.kemId).toBe(0x0020);
    expect(c.publicKey).toHaveLength(32);
    expect(hex(c.publicKey)).toBe('31e1f05a740102115220e9af918f738674aec95f54db6e04eb705aae8e798155');
    expect(c.suites).toEqual([
      { kdfId: 1, aeadId: 1 },
      { kdfId: 1, aeadId: 3 },
    ]);
    expect(hex(encodeKeyConfig(c))).toBe(RFC_KEY_CONFIG_HEX);
  });
  it('header and HPKE info for the example', () => {
    const c = parseKeyConfig(fromHex(RFC_KEY_CONFIG_HEX));
    const hdr = requestHeader(c.keyId, c.kemId, { kdfId: 1, aeadId: 1 });
    expect(hex(hdr)).toBe('01002000010001');
    expect(hex(requestInfo(hdr))).toBe(`${hex(te.encode('message/bhttp request'))}00${hex(hdr)}`);
  });
  it('parses application/ohttp-keys lists', () => {
    const second: OhttpKeyConfig = { ...CONFIG, keyId: 8, kemId: 0x0010, publicKey: new Uint8Array(65).fill(4), suites: [{ kdfId: 1, aeadId: 2 }] };
    const list = parseKeyConfigs(encodeKeyConfigs([CONFIG, second]));
    expect(list.map((c) => c.keyId)).toEqual([7, 8]);
    for (const [kem, n] of [[0x0011, 97], [0x0012, 133], [0x0021, 56]] as const) {
      expect(parseKeyConfig(encodeKeyConfig({ ...CONFIG, kemId: kem, publicKey: new Uint8Array(n) })).kemId).toBe(kem);
    }
  });
  it('rejects malformed configs (table)', () => {
    const good = encodeKeyConfig(CONFIG);
    const bad: [string, Uint8Array][] = [
      ['empty', new Uint8Array()],
      ['too short', good.subarray(0, 4)],
      ['unknown kem', Uint8Array.from([...good.subarray(0, 1), 0x00, 0x99, ...good.subarray(3)])],
      ['truncated key', good.subarray(0, 20)],
      ['trailing byte', Uint8Array.from([...good, 0])],
      ['truncated suites', good.subarray(0, good.length - 1)],
      ['suite len not multiple of 4', Uint8Array.from([...good.subarray(0, 35), 0, 6, ...good.subarray(37, 43)])],
      ['zero suites', Uint8Array.from([...good.subarray(0, 35), 0, 0])],
      ['wrong key length for kem', encodeKeyConfig({ ...CONFIG, publicKey: new Uint8Array(31) })],
    ];
    for (const [name, b] of bad) expect(code(((): unknown => { try { return parseKeyConfig(b); } catch (e) { return e; } })()), name).toBe('OHTTP_KEYCONFIG');
    const listBad: [string, Uint8Array][] = [
      ['empty list', new Uint8Array()],
      ['length prefix past end', Uint8Array.from([0, 200, 1, 2])],
      ['zero length entry', Uint8Array.from([0, 0])],
      ['one byte tail', Uint8Array.from([...encodeKeyConfigs([CONFIG]), 0])],
      ['duplicate key ids', Uint8Array.from([...encodeKeyConfigs([CONFIG]), ...encodeKeyConfigs([CONFIG])])],
      ['oversize', new Uint8Array(70_000)],
    ];
    for (const [name, b] of listBad) expect(code(((): unknown => { try { return parseKeyConfigs(b); } catch (e) { return e; } })()), name).toBe('OHTTP_KEYCONFIG');
  });
  it('suite selection honours what the HPKE implementation supports', () => {
    const hpke = fakeHpke();
    expect(selectSuite([CONFIG], hpke).suite).toEqual({ kdfId: 1, aeadId: 1 });
    const unsupported: OhttpKeyConfig = { ...CONFIG, suites: [{ kdfId: 9, aeadId: 9 }] };
    expect(() => selectSuite([unsupported], hpke)).toThrow('no supported OHTTP cipher suite');
    expect(() => selectSuite([], hpke)).toThrow(NetTransportError);
    expect(selectSuite([unsupported, CONFIG], hpke).config.keyId).toBe(7);
    const weird = { ...hpke, supports: () => true };
    expect(() => selectSuite([{ ...CONFIG, suites: [{ kdfId: 1, aeadId: 0x1234 }] }], weird)).toThrow('unsupported AEAD');
    expect(aeadParams(1)).toEqual({ nk: 16, nn: 12 });
    expect(aeadParams(2)).toEqual({ nk: 32, nn: 12 });
    expect(aeadParams(3)).toEqual({ nk: 32, nn: 12 });
  });
});

describe('encapsulation round trip with an INSECURE FAKE HPKE (framing only)', () => {
  const hpke = fakeHpke(counterRandom(5));
  const gwKeys: GatewayKey[] = [{ config: CONFIG, recipient: FAKE_PUBLIC_KEY }];
  it('request and response survive the wire format', async () => {
    const suite = { kdfId: 1, aeadId: 1 };
    const { message, context } = await encapsulateRequest(te.encode('request-bytes'), CONFIG, suite, hpke);
    expect(hex(message.subarray(0, 7))).toBe('07002000010001');
    expect(message.length).toBe(7 + 32 + 'request-bytes'.length + 8);
    const g = await gatewayDecapsulate(message, gwKeys, hpke);
    expect(td.decode(g.bhttp)).toBe('request-bytes');
    const resp = await g.respond(te.encode('response-bytes'));
    expect(resp.length).toBe(16 + 'response-bytes'.length + 8); // nonce = max(Nk, Nn) = 16 for AES-128-GCM
    expect(td.decode(await decapsulateResponse(resp, context, hpke))).toBe('response-bytes');
  });
  it('AEAD 3 uses a 32-byte response nonce', async () => {
    const suite = { kdfId: 1, aeadId: 3 };
    const { message, context } = await encapsulateRequest(te.encode('a'), CONFIG, suite, hpke);
    const g = await gatewayDecapsulate(message, gwKeys, hpke);
    expect((await g.respond(te.encode('b'))).length).toBe(32 + 1 + 8);
    expect(td.decode(await decapsulateResponse(await g.respond(te.encode('b')), context, hpke))).toBe('b');
  });
  it('refuses a suite the config does not offer', async () => {
    expect(code(await errOf(encapsulateRequest(te.encode('x'), CONFIG, { kdfId: 1, aeadId: 2 }, hpke)))).toBe('OHTTP_KEYCONFIG');
  });
  it('gateway rejects every malformed or tampered request with ONE generic error (no oracle)', async () => {
    const { message } = await encapsulateRequest(te.encode('payload'), CONFIG, { kdfId: 1, aeadId: 1 }, hpke);
    const flip = (i: number): Uint8Array => {
      const m = Uint8Array.from(message);
      m[i] = (m[i] as number) ^ 1;
      return m;
    };
    const cases: Uint8Array[] = [
      new Uint8Array(),
      message.subarray(0, 6),
      message.subarray(0, 7 + 32),
      message.subarray(0, 7 + 32 + 4),
      flip(0), // key id
      flip(2), // kem id
      flip(4), // kdf id
      flip(6), // aead id
      flip(7 + 5), // enc
      flip(message.length - 1), // tag
      flip(7 + 32), // ciphertext
    ];
    const messages = new Set<string>();
    for (const c of cases) {
      const e = await errOf(gatewayDecapsulate(c, gwKeys, hpke));
      expect(code(e)).toBe('OHTTP_DECAP');
      messages.add((e as Error).message);
    }
    expect(messages.size).toBe(1);
  });
  it('client rejects short, tampered and replayed-to-wrong-context responses', async () => {
    const suite = { kdfId: 1, aeadId: 1 };
    const a = await encapsulateRequest(te.encode('one'), CONFIG, suite, hpke);
    const b = await encapsulateRequest(te.encode('two'), CONFIG, suite, hpke);
    const g = await gatewayDecapsulate(a.message, gwKeys, hpke);
    const resp = await g.respond(te.encode('answer'));
    expect(code(await errOf(decapsulateResponse(resp.subarray(0, 16), a.context, hpke)))).toBe('OHTTP_DECAP');
    expect(code(await errOf(decapsulateResponse(new Uint8Array(), a.context, hpke)))).toBe('OHTTP_DECAP');
    const t = Uint8Array.from(resp);
    t[t.length - 1] = (t[t.length - 1] as number) ^ 1;
    expect(code(await errOf(decapsulateResponse(t, a.context, hpke)))).toBe('OHTTP_DECAP');
    expect(code(await errOf(decapsulateResponse(resp, b.context, hpke)))).toBe('OHTTP_DECAP'); // wrong context
  });
});

describe('relay / gateway split checks (NP-H-1, NP-H-3, AT-NP-10)', () => {
  it('same origin = no split; same last-two-labels is only a heuristic warning', () => {
    expect(compareRelayGateway('https://relay.example.com/r', 'https://relay.example.com')).toEqual({ sameOrigin: true, sameDomainHeuristic: true });
    expect(compareRelayGateway('https://relay.example.com/r', 'https://gw.example.com')).toEqual({ sameOrigin: false, sameDomainHeuristic: true });
    expect(compareRelayGateway('https://relay.one.test/r', 'https://gw.two.test')).toEqual({ sameOrigin: false, sameDomainHeuristic: false });
    expect(compareRelayGateway('https://Relay.Example.COM./r', 'https://gw.example.com.')).toMatchObject({ sameDomainHeuristic: true });
    expect(code(((): unknown => { try { return compareRelayGateway('nope', 'https://a.test'); } catch (e) { return e; } })())).toBe('INVALID_CONFIG');
  });
  const base = (): OhttpConfig => ({
    id: 'ohttp',
    network: NET,
    relayUrl: 'https://relay.one.test/relay',
    gatewayOrigin: 'https://gw.two.test',
    keyConfig: KEYS,
    targetBase: 'https://rpc.example.test',
    hpke: fakeHpke(),
    experimentalAck: true,
  });
  it('profile refuses same-origin relay and gateway, no opt-in, missing HPKE, bad key config, bad padTo', () => {
    expect(() => createOhttpProfile({ ...base(), gatewayOrigin: 'https://relay.one.test' })).toThrow('different origins');
    expect(() => createOhttpProfile({ ...base(), experimentalAck: false })).toThrow(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    expect(() => createOhttpProfile({ ...base(), hpke: undefined })).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_ENV' }));
    expect(() => createOhttpProfile({ ...base(), keyConfig: new Uint8Array([1, 2, 3]) })).toThrow(expect.objectContaining({ code: 'OHTTP_KEYCONFIG' }));
    expect(() => createOhttpProfile({ ...base(), padTo: -1 })).toThrow(expect.objectContaining({ code: 'INVALID_CONFIG' }));
    expect(() => createOhttpProfile({ ...base(), network: { kind: 'evm', chainId: 1 } })).toThrow(expect.objectContaining({ code: 'NETWORK_NOT_ALLOWED' }));
    expect(() => createOhttpProfile({ ...base(), relayUrl: 'http://relay.one.test/r' })).toThrow(expect.objectContaining({ code: 'URL_REJECTED' }));
  });
  it('warns on the same-domain heuristic, claims no isolation, is experimental', () => {
    const p = createOhttpProfile({ ...base(), relayUrl: 'https://relay.example.com/r', gatewayOrigin: 'https://gw.example.com' });
    expect(p.warnings).toEqual(['relay-gateway-same-domain']);
    expect(p.experimental).toBe(true);
    expect(p.claims).toEqual(['hides-ip-from-destination', 'splits-who-what']);
    expect(createOhttpProfile(base()).warnings).toEqual([]);
  });
});

describe('ohttp profile end to end over the harness relay and gateway stubs', () => {
  async function rig(opts: { innerStatus?: number; innerBody?: string; tamper?: boolean } = {}) {
    const hpke = fakeHpke(counterRandom(40));
    const target = track(await startHttpEcho()); // must NEVER be contacted by the client
    const gwKeys: GatewayKey[] = [{ config: CONFIG, recipient: FAKE_PUBLIC_KEY }];
    const seen: { method: string; authority: string; path: string; body: string }[] = [];
    const gateway = track(
      await startOhttpGateway({
        keyConfig: KEYS,
        handle: async (msg) => {
          const g = await gatewayDecapsulate(msg, gwKeys, fakeHpke(counterRandom(99)));
          const req = decodeBhttpRequest(g.bhttp);
          seen.push({ method: req.method, authority: req.authority, path: req.path, body: td.decode(req.content) });
          const out = await g.respond(encodeBhttpResponse({ status: opts.innerStatus ?? 200, headers: [['content-type', 'application/json']], content: te.encode(opts.innerBody ?? '{"jsonrpc":"2.0","id":1,"result":"0xaa36a7"}') }, 64));
          if (opts.tamper === true) out[out.length - 1] = (out[out.length - 1] as number) ^ 1;
          return out;
        },
      }),
    );
    const relay = track(await startOhttpRelay({ gatewayUrl: gateway.baseUrl }));
    const cfg: OhttpConfig = {
      id: 'ohttp',
      network: NET,
      relayUrl: relay.relayUrl,
      gatewayOrigin: 'https://gateway.example.test',
      keyConfig: KEYS,
      targetBase: 'http://rpc.example.test:8545',
      hpke,
      experimentalAck: true,
      allowPlainHttp: true,
    };
    return { cfg, target, gateway, relay, seen };
  }
  const URL_ = 'http://rpc.example.test:8545/v1/k?z=1';

  it('round trips JSON-RPC; relay sees only ciphertext; client never contacts the target or gateway directly', async () => {
    const { cfg, target, gateway, relay, seen } = await rig();
    const p = createOhttpProfile(cfg);
    expect(await p.transport('quote').send(URL_, BODY, LIM)).toBe('{"jsonrpc":"2.0","id":1,"result":"0xaa36a7"}');
    expect(seen).toEqual([{ method: 'POST', authority: 'rpc.example.test:8545', path: '/v1/k?z=1', body: BODY }]);
    expect(relay.records).toHaveLength(1);
    const wire = relay.records[0]?.body as Buffer;
    for (const needle of ['eth_chainId', 'jsonrpc', 'rpc.example.test', '/v1/k']) expect(wire.includes(Buffer.from(needle))).toBe(false);
    expect(relay.records[0]?.contentType).toBe('message/ohttp-req');
    expect(target.records).toHaveLength(0);
    expect(gateway.records.every((r) => r.path === '/ohttp-gateway')).toBe(true); // reached only via the relay
    expect(gateway.records).toHaveLength(1);
  });
  it('request plaintext is padded to the configured multiple', async () => {
    const { cfg, relay } = await rig();
    await createOhttpProfile({ ...cfg, padTo: 512 }).transport('quote').send(URL_, BODY, LIM);
    const len = (relay.records[0]?.body as Buffer).length;
    expect((len - 7 - 32 - 8) % 512).toBe(0);
  });
  it('inner non-2xx -> RpcHttpError; relay/gateway 4xx -> RpcHttpError', async () => {
    const { cfg } = await rig({ innerStatus: 503, innerBody: 'no' });
    const e = await errOf(createOhttpProfile(cfg).transport('quote').send(URL_, BODY, LIM));
    expect(e).toBeInstanceOf(RpcHttpError);
    expect((e as RpcHttpError).status).toBe(503);
    const r = await rig();
    const wrongKeys = encodeKeyConfigs([{ ...CONFIG, keyId: 9 }]); // gateway does not know key id 9 -> 400
    const e2 = await errOf(createOhttpProfile({ ...r.cfg, keyConfig: wrongKeys }).transport('quote').send(URL_, BODY, LIM));
    expect((e2 as RpcHttpError).status).toBe(400);
  });
  it('tampered response -> OHTTP_DECAP; oversize inner body -> RESPONSE_TOO_LARGE', async () => {
    const t = await rig({ tamper: true });
    expect(code(await errOf(createOhttpProfile(t.cfg).transport('quote').send(URL_, BODY, LIM)))).toBe('OHTTP_DECAP');
    const big = await rig({ innerBody: 'x'.repeat(3000) });
    const e = await errOf(createOhttpProfile(big.cfg).transport('quote').send(URL_, BODY, { timeoutMs: 5000, maxBytes: 1000 }));
    expect((e as ChainAdapterError).code).toBe('RESPONSE_TOO_LARGE');
  });
  it('refuses targets outside the configured origin and bad URLs, before any network I/O', async () => {
    const { cfg, relay } = await rig();
    const t = createOhttpProfile(cfg).transport('quote');
    expect(code(await errOf(t.send('http://other.example.test:8545/', BODY, LIM)))).toBe('URL_REJECTED');
    expect(code(await errOf(t.send('https://rpc.example.test:8545/', BODY, LIM)))).toBe('URL_REJECTED');
    expect(code(await errOf(t.send('http://u:p@rpc.example.test:8545/', BODY, LIM)))).toBe('URL_REJECTED');
    expect(relay.records).toHaveLength(0);
  });
  it('relay misbehaviour: wrong content type, transport error, injected relayPost errors and timeout', async () => {
    const { cfg } = await rig();
    const mk = (post: RelayPost) => createOhttpProfile({ ...cfg, relayPost: post }).transport('quote');
    expect(code(await errOf(mk(() => Promise.resolve({ status: 200, contentType: 'text/html', body: new Uint8Array(40) })).send(URL_, BODY, LIM)))).toBe('OHTTP_DECAP');
    expect(code(await errOf(mk(() => Promise.resolve({ status: 200, contentType: undefined, body: new Uint8Array(40) })).send(URL_, BODY, LIM)))).toBe('OHTTP_DECAP');
    expect(((await errOf(mk(() => Promise.resolve({ status: 502, contentType: undefined, body: new Uint8Array() })).send(URL_, BODY, LIM))) as RpcHttpError).status).toBe(502);
    expect(((await errOf(mk(() => Promise.reject(new Error('http://secret.example.test'))).send(URL_, BODY, LIM))) as Error).message).toBe('RPC_FAILURE: transport error or timeout');
    expect(code(await errOf(mk(() => Promise.reject(new NetTransportError('UNSUPPORTED_ENV', 'x'))).send(URL_, BODY, LIM)))).toBe('UNSUPPORTED_ENV');
    expect(((await errOf(mk(() => Promise.reject(new ChainAdapterError('RESPONSE_TOO_LARGE', 'x'))).send(URL_, BODY, LIM))) as ChainAdapterError).code).toBe('RESPONSE_TOO_LARGE');
    const hang = mk((_u, _b, o) => new Promise((_res, rej) => o.signal.addEventListener('abort', () => rej(new Error('aborted')))));
    expect(((await errOf(hang.send(URL_, BODY, { timeoutMs: 100, maxBytes: 100 }))) as Error).message).toBe('RPC_FAILURE: transport error or timeout');
  });
  it('relay post receives a bounded response cap and the relay URL only', async () => {
    const { cfg } = await rig();
    let seen: { url: string; max: number } | undefined;
    const t = createOhttpProfile({ ...cfg, relayPost: (u, _b, o) => { seen = { url: u, max: o.maxBytes }; return Promise.reject(new Error('stop')); } }).transport('submit');
    await errOf(t.send(URL_, BODY, { timeoutMs: 1000, maxBytes: 500 }));
    expect(seen).toEqual({ url: cfg.relayUrl, max: 500 + 4096 });
  });
  it('selfTest: key config ok; probe uses the profile', async () => {
    const { cfg } = await rig();
    const p = createOhttpProfile(cfg);
    const r = await p.selfTest({ probe: { url: URL_, expectedChainId: 11155111 } });
    expect(r.checks.map((c) => c.id)).toEqual(['key-config', 'relay-gateway-origins', 'probe-chain-id']);
    expect(r.ok).toBe(true);
    const bad = await p.selfTest({ probe: { url: URL_, expectedChainId: 1 } });
    expect(bad.ok).toBe(false);
    expect(code(await errOf(p.transport('quote').send(URL_, BODY, LIM)))).toBe('PROFILE_SELFTEST'); // blocked, no fallback
  });
  it('default relay POST (global fetch) works against the stub relay', async () => {
    const { cfg } = await rig();
    const { relayPost: _omit, ...noPost } = { ...cfg, relayPost: undefined } as OhttpConfig & { relayPost: undefined };
    void _omit;
    expect(await createOhttpProfile(noPost as OhttpConfig).transport('quote').send(URL_, BODY, LIM)).toContain('0xaa36a7');
  });
});

describe('fetchRelayPost (default relay transport)', () => {
  it('streams with a cap and reports status and content type', async () => {
    const srv = track(await startHttpEcho({ bigBody: 5000, status: 200 }));
    const ctl = new AbortController();
    const ok = await fetchRelayPost(`${srv.baseUrl}/`, new Uint8Array([1]), { signal: ctl.signal, maxBytes: 10_000 });
    expect(ok.status).toBe(200);
    expect(ok.body).toHaveLength(5000);
    expect(ok.contentType).toBe('application/json');
    const e = await errOf(fetchRelayPost(`${srv.baseUrl}/`, new Uint8Array([1]), { signal: ctl.signal, maxBytes: 100 }));
    expect((e as ChainAdapterError).code).toBe('RESPONSE_TOO_LARGE');
    const empty = track(await startHttpEcho({ status: 204, responseBody: '' }));
    expect((await fetchRelayPost(`${empty.baseUrl}/`, new Uint8Array(), { signal: ctl.signal, maxBytes: 10 })).body).toHaveLength(0);
  });
  it('fails closed when fetch is missing', async () => {
    const g = globalThis as { fetch?: unknown };
    const saved = g.fetch;
    g.fetch = undefined;
    try {
      expect(code(await errOf(fetchRelayPost('https://a.test/', new Uint8Array(), { signal: new AbortController().signal, maxBytes: 1 })))).toBe('UNSUPPORTED_ENV');
    } finally {
      g.fetch = saved;
    }
  });
});
