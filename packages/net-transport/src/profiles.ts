import type { RpcTransport } from '@ghostpay/chain-adapters';
import { ChainAdapterError, RpcHttpError } from '@ghostpay/chain-adapters';
import { CredentialSource, PURPOSES, type Isolation, type Purpose, type RandomBytes } from './credentials.js';
import { NetTransportError, requireConfig } from './errors.js';
import { createFetchTransport, type FetchLike } from './fetchTransport.js';
import { assertTestnet, type NetworkRef } from './guard.js';
import { httpConnect } from './httpConnect.js';
import { validateOnionUrl } from './onion.js';
import {
  compareRelayGateway,
  decapsulateResponse,
  encapsulateRequest,
  parseKeyConfigs,
  selectSuite,
  type OhttpHpke,
} from './ohttp.js';
import { decodeBhttpResponse, encodeBhttpRequest } from './bhttp.js';
import { parseHttpProxyUrl, parseProxyUrl, type ProxyEndpoint } from './proxyUrl.js';
import type { Claim, ProfileId, SelfTestCheck, SelfTestOptions, SelfTestResult, TransportProfile } from './profile.js';
import { postOverTunnel, type OpenTunnel, type TlsExtras } from './request.js';
import { socks5Connect, socks5Probe } from './socks5.js';
import { parseTargetUrl } from './url.js';

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

/** Browser facts the `tor-browser` self-check reports (all local; NP-B-1). */
export interface BrowserEnv {
  /** `window.isSecureContext`. */
  readonly isSecureContext: boolean;
  /** `crypto.subtle` present. */
  readonly hasSubtleCrypto: boolean;
  /** `localStorage`/IndexedDB usable. */
  readonly storageAvailable: boolean;
}

interface Common {
  /** Network the profile will be used for; testnet-only guard (NP-C-4). */
  readonly network: NetworkRef;
}

/** `direct`: plain fetch. */
export interface DirectConfig extends Common {
  readonly id: 'direct';
  /** Development: permit http on loopback. */
  readonly allowInsecureLocalhost?: boolean;
  /** Fetch override (tests). */
  readonly fetchImpl?: FetchLike;
}

/** `tor-browser`: ambient egress; user assertion only. */
export interface TorBrowserConfig extends Common {
  readonly id: 'tor-browser';
  /** Local facts for the self-check; omitted fields are reported as unknown/false. */
  readonly env?: BrowserEnv;
  /** Fetch override (tests). */
  readonly fetchImpl?: FetchLike;
}

interface SocksCommon extends Common {
  /** `socks5h://127.0.0.1:9150` style URL. */
  readonly proxyUrl: string;
  /** Credential rotation. Default `per-purpose` (Tor) / `none` (Nym). */
  readonly isolate?: Isolation;
  /** Random source override (tests). */
  readonly rand?: RandomBytes;
  /** Connect+handshake deadline, ms. Default 10000. */
  readonly connectTimeoutMs?: number;
  /** Permit non-loopback proxy IP. Default false. */
  readonly allowNonLoopbackProxy?: boolean;
  /** Permit http:// destinations. TEST ONLY (the onion profile always allows http to onion hosts). */
  readonly allowPlainHttp?: boolean;
  /** Extra TLS CA. TEST ONLY. */
  readonly tlsCa?: string | Buffer;
}

/** `tor-socks`: SOCKS5h to a local Tor. */
export interface TorSocksConfig extends SocksCommon {
  readonly id: 'tor-socks';
}

/** `onion`: onion-service URLs over SOCKS5h. */
export interface OnionConfig extends SocksCommon {
  readonly id: 'onion';
}

/** `nym-socks5`: SOCKS5h to a local nym-socks5-client. Experimental. */
export interface NymSocksConfig extends SocksCommon {
  readonly id: 'nym-socks5';
  /** Must be `true`: explicit experimental opt-in (NP-N-1). */
  readonly experimentalAck: boolean;
}

/** `i2p-outproxy`: HTTP CONNECT through a local I2P HTTP proxy. */
export interface I2pConfig extends Common {
  readonly id: 'i2p-outproxy';
  /** `http://127.0.0.1:4444` style URL. */
  readonly proxyUrl: string;
  /** Connect+CONNECT deadline, ms. Default 10000. */
  readonly connectTimeoutMs?: number;
  /** Permit non-loopback proxy IP. Default false. */
  readonly allowNonLoopbackProxy?: boolean;
  /** Permit http:// destinations. TEST ONLY. */
  readonly allowPlainHttp?: boolean;
  /** Extra TLS CA. TEST ONLY. */
  readonly tlsCa?: string | Buffer;
}

/** `nym-mixfetch`: injected `mixFetch` (browser). Experimental. */
export interface NymMixFetchConfig extends Common {
  readonly id: 'nym-mixfetch';
  /** The `mixFetch` function from the optional Nym package, injected by the app. */
  readonly mixFetch: FetchLike | undefined;
  /** Must be `true` (NP-N-1). */
  readonly experimentalAck: boolean;
}

/** Relay POST result. */
export interface RelayResponse {
  /** HTTP status. */
  readonly status: number;
  /** Content-Type header. */
  readonly contentType: string | undefined;
  /** Body. */
  readonly body: Uint8Array;
}

/** POSTs bytes to the OHTTP relay. Injected; the default uses global `fetch`. */
export type RelayPost = (
  url: string,
  body: Uint8Array,
  o: { readonly signal: AbortSignal; readonly maxBytes: number },
) => Promise<RelayResponse>;

/** `ohttp`: RFC 9458 via a relay to a gateway. Experimental; crypto UNVERIFIED. */
export interface OhttpConfig extends Common {
  readonly id: 'ohttp';
  /** Relay endpoint the client POSTs to. */
  readonly relayUrl: string;
  /** Gateway origin (identity of the gateway; NOT contacted by the client). Must differ from the relay origin. */
  readonly gatewayOrigin: string;
  /** `application/ohttp-keys` bytes, user-supplied or pinned: never fetched from the relay (NP-H-1). */
  readonly keyConfig: Uint8Array;
  /** Origin of the target API the gateway will forward to. Requests to other origins are refused. */
  readonly targetBase: string;
  /** Injected HPKE implementation (none is bundled). */
  readonly hpke: OhttpHpke | undefined;
  /** Must be `true`: experimental opt-in (NP-H-2; crypto UNVERIFIED). */
  readonly experimentalAck: boolean;
  /** Relay POST override (tests, custom fetch). */
  readonly relayPost?: RelayPost;
  /** Pad encoded requests to a multiple of this many bytes. Default 256. */
  readonly padTo?: number;
  /** Permit http:// relay/target. TEST ONLY. */
  readonly allowPlainHttp?: boolean;
}

/** Discriminated union of every profile configuration. */
export type ProfileConfig =
  | DirectConfig
  | TorBrowserConfig
  | TorSocksConfig
  | OnionConfig
  | I2pConfig
  | NymMixFetchConfig
  | NymSocksConfig
  | OhttpConfig;

/** Normalizes an unknown throw into an Error for promise rejection. */
function asError(e: unknown): Error {
  return e instanceof Error ? e : new NetTransportError('PROXY_CONNECT', 'transport failure');
}

/** Mutable block state shared by a profile's transports. */
interface Gate {
  blocked: boolean;
}

function gated(gate: Gate, inner: (purpose: Purpose) => RpcTransport): (purpose: Purpose) => RpcTransport {
  return (purpose) => {
    if (!PURPOSES.includes(purpose)) throw new NetTransportError('INVALID_CONFIG', 'unknown purpose');
    const t = inner(purpose);
    return {
      send(url, body, init) {
        if (gate.blocked) return Promise.reject(new NetTransportError('PROFILE_SELFTEST', 'profile failed its self-test; requests are blocked'));
        return t.send(url, body, init);
      },
    };
  };
}

function buildProfile(
  id: ProfileId,
  gate: Gate,
  p: {
    experimental: boolean;
    claims: readonly Claim[];
    warnings?: readonly string[];
    transport: (purpose: Purpose) => RpcTransport;
    localChecks: () => Promise<SelfTestCheck[]> | SelfTestCheck[];
    probeTransport: () => RpcTransport;
  },
): TransportProfile {
  return {
    id,
    experimental: p.experimental,
    claims: Object.freeze([...p.claims]),
    warnings: Object.freeze([...(p.warnings ?? [])]),
    transport: gated(gate, p.transport),
    async selfTest(opts: SelfTestOptions = {}): Promise<SelfTestResult> {
      const checks: SelfTestCheck[] = [];
      try {
        checks.push(...(await p.localChecks()));
      } catch (e) {
        checks.push({ id: 'local', ok: false, detail: e instanceof NetTransportError ? `failed: ${e.code}` : 'failed' });
      }
      if (opts.probe !== undefined && checks.every((c) => c.ok)) {
        checks.push(await runProbe(p.probeTransport(), opts));
      }
      const ok = checks.every((c) => c.ok);
      gate.blocked = !ok;
      return { ok, checks };
    },
  };
}

async function runProbe(t: RpcTransport, opts: SelfTestOptions): Promise<SelfTestCheck> {
  const probe = opts.probe as NonNullable<SelfTestOptions['probe']>;
  try {
    if (opts.signal?.aborted === true) return { id: 'probe-chain-id', ok: false, detail: 'aborted' };
    const text = await t.send(probe.url, '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}', { timeoutMs: 15_000, maxBytes: 4096 });
    const j = JSON.parse(text) as { result?: unknown };
    const want = `0x${probe.expectedChainId.toString(16)}`;
    const got = typeof j.result === 'string' ? j.result.toLowerCase().replace(/^0x0+(?=.)/, '0x') : '';
    return got === want ? { id: 'probe-chain-id', ok: true, detail: 'eth_chainId matched' } : { id: 'probe-chain-id', ok: false, detail: 'eth_chainId did not match' };
  } catch (e) {
    return { id: 'probe-chain-id', ok: false, detail: e instanceof NetTransportError ? `failed: ${e.code}` : 'request failed' };
  }
}

/**
 * Creates the `direct` profile: plain fetch, no claims.
 *
 * @param cfg Config (testnet-guarded).
 */
export function createDirectProfile(cfg: DirectConfig): TransportProfile {
  assertTestnet(cfg.network);
  const t = createFetchTransport({ fetchImpl: cfg.fetchImpl, allowInsecureLocalhost: cfg.allowInsecureLocalhost });
  return buildProfile('direct', { blocked: false }, {
    experimental: false,
    claims: [],
    transport: () => t,
    localChecks: () => [{ id: 'direct', ok: true, detail: 'direct egress: your RPC/relayer sees your IP' }],
    probeTransport: () => t,
  });
}

/**
 * Creates the `tor-browser` profile: ambient egress, user assertion only, NO claims (NP-B-1, NP-B-4).
 *
 * @param cfg Config (testnet-guarded).
 */
export function createTorBrowserProfile(cfg: TorBrowserConfig): TransportProfile {
  assertTestnet(cfg.network);
  const t = createFetchTransport({ fetchImpl: cfg.fetchImpl });
  const env = cfg.env;
  return buildProfile('tor-browser', { blocked: false }, {
    experimental: false,
    claims: [],
    transport: () => t,
    localChecks: () => [
      { id: 'secure-context', ok: env?.isSecureContext === true, detail: 'window.isSecureContext (local check)' },
      { id: 'subtle-crypto', ok: env?.hasSubtleCrypto === true, detail: 'crypto.subtle present (local check)' },
      { id: 'storage', ok: env?.storageAvailable === true, detail: 'storage available (local check)' },
      { id: 'user-assertion', ok: true, detail: 'cannot verify Tor Browser; no third-party request was made' },
    ],
    probeTransport: () => t,
  });
}

function socksCheck(proxy: ProxyEndpoint, isolate: Isolation, rand: RandomBytes | undefined, timeoutMs: number): () => Promise<SelfTestCheck[]> {
  return async () => {
    const creds = new CredentialSource(isolate, rand).next('health');
    await socks5Probe(proxy, creds, timeoutMs);
    return [
      { id: 'proxy-handshake', ok: true, detail: 'SOCKS5 handshake well-formed' },
      { id: 'remote-dns', ok: true, detail: 'host names are sent to the proxy, never resolved locally' },
    ];
  };
}

function socksTransport(
  proxy: ProxyEndpoint,
  src: CredentialSource,
  timeoutMs: number,
  target: (url: string) => ReturnType<typeof parseTargetUrl>,
  extras: TlsExtras,
): (purpose: Purpose) => RpcTransport {
  return (purpose) => ({
    send(url, body, init) {
      let t: ReturnType<typeof parseTargetUrl>;
      try {
        t = target(url);
      } catch (e) {
        return Promise.reject(asError(e));
      }
      const open: OpenTunnel = (host, port, remaining) =>
        socks5Connect({ proxy, host, port, credentials: src.next(purpose), timeoutMs: Math.min(timeoutMs, remaining) });
      return postOverTunnel(t, body, init, open, extras);
    },
  });
}

function socksProfile(id: 'tor-socks' | 'onion' | 'nym-socks5', cfg: SocksCommon, experimental: boolean): TransportProfile {
  assertTestnet(cfg.network);
  const proxy = parseProxyUrl(cfg.proxyUrl, cfg.allowNonLoopbackProxy === true ? { allowNonLoopback: true } : {});
  const isolate: Isolation = cfg.isolate ?? (id === 'nym-socks5' ? 'none' : 'per-purpose');
  const src = new CredentialSource(isolate, cfg.rand);
  const timeoutMs = cfg.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  requireConfig(Number.isInteger(timeoutMs) && timeoutMs > 0, 'connectTimeoutMs must be a positive integer');
  const target = (url: string): ReturnType<typeof parseTargetUrl> => {
    if (id === 'onion') {
      const checked = validateOnionUrl(url, { allowHttp: true });
      return parseTargetUrl(checked, { allowPlainHttp: true });
    }
    const t = parseTargetUrl(url, cfg.allowPlainHttp === true ? { allowPlainHttp: true } : {});
    if (t.host.endsWith('.onion')) throw new NetTransportError('ONION_URL', 'onion destinations need the onion profile');
    return t;
  };
  const extras: TlsExtras = { ca: cfg.tlsCa };
  const gate: Gate = { blocked: false };
  const claims: Claim[] = ['hides-ip-from-destination', 'dns-remote'];
  if (isolate !== 'none' && id !== 'nym-socks5') claims.push('stream-isolation'); // never for Nym (NP-N-3)
  if (id === 'nym-socks5') claims.push('timing-mix');
  const make = socksTransport(proxy, src, timeoutMs, target, extras);
  return buildProfile(id, gate, {
    experimental,
    claims,
    transport: make,
    localChecks: socksCheck(proxy, isolate, cfg.rand, timeoutMs),
    probeTransport: () => make('health'),
  });
}

/**
 * Creates the `tor-socks` profile.
 *
 * @param cfg Config (testnet-guarded). `socks5://` URLs fail with `PROXY_LOCAL_DNS`.
 */
export function createTorSocksProfile(cfg: TorSocksConfig): TransportProfile {
  return socksProfile('tor-socks', cfg, false);
}

/**
 * Creates the `onion` profile (onion-service URLs through a SOCKS5h proxy).
 *
 * @param cfg Config (testnet-guarded).
 */
export function createOnionProfile(cfg: OnionConfig): TransportProfile {
  return socksProfile('onion', cfg, false);
}

/**
 * Creates the `nym-socks5` profile. Experimental; stream isolation is NOT claimed.
 *
 * @param cfg Config (testnet-guarded; `experimentalAck` must be true).
 */
export function createNymSocksProfile(cfg: NymSocksConfig): TransportProfile {
  requireConfig(cfg.experimentalAck === true, 'nym profiles need the experimental opt-in');
  return socksProfile('nym-socks5', cfg, true);
}

/**
 * Creates the `i2p-outproxy` profile (HTTP CONNECT to a local I2P HTTP proxy). Secondary, best-effort,
 * no isolation claimed.
 *
 * @param cfg Config (testnet-guarded).
 */
export function createI2pOutproxyProfile(cfg: I2pConfig): TransportProfile {
  assertTestnet(cfg.network);
  const proxy = parseHttpProxyUrl(cfg.proxyUrl, cfg.allowNonLoopbackProxy === true ? { allowNonLoopback: true } : {});
  const timeoutMs = cfg.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  requireConfig(Number.isInteger(timeoutMs) && timeoutMs > 0, 'connectTimeoutMs must be a positive integer');
  const extras: TlsExtras = { ca: cfg.tlsCa };
  const make = (): RpcTransport => ({
    send(url, body, init) {
      let t: ReturnType<typeof parseTargetUrl>;
      try {
        t = parseTargetUrl(url, cfg.allowPlainHttp === true ? { allowPlainHttp: true } : {});
        if (t.host.endsWith('.onion')) throw new NetTransportError('ONION_URL', 'onion destinations need the onion profile');
      } catch (e) {
        return Promise.reject(asError(e));
      }
      const open: OpenTunnel = (host, port, remaining) => httpConnect({ proxy, host, port, timeoutMs: Math.min(timeoutMs, remaining) });
      return postOverTunnel(t, body, init, open, extras);
    },
  });
  return buildProfile('i2p-outproxy', { blocked: false }, {
    experimental: false,
    claims: ['hides-ip-from-destination', 'dns-remote'],
    warnings: ['secondary-best-effort', 'outproxy-sees-destination'],
    transport: make,
    localChecks: () => [{ id: 'config', ok: true, detail: 'HTTP CONNECT through a local proxy; stream isolation not claimed' }],
    probeTransport: make,
  });
}

/**
 * Creates the `nym-mixfetch` profile around an injected `mixFetch`. Browser-only; UNVERIFIED against
 * the real `@nymproject/mix-fetch`.
 *
 * @param cfg Config (testnet-guarded; `experimentalAck` must be true).
 * @throws {NetTransportError} `UNSUPPORTED_ENV` when `mixFetch` is absent.
 */
export function createNymMixFetchProfile(cfg: NymMixFetchConfig): TransportProfile {
  assertTestnet(cfg.network);
  requireConfig(cfg.experimentalAck === true, 'nym profiles need the experimental opt-in');
  if (typeof cfg.mixFetch !== 'function') throw new NetTransportError('UNSUPPORTED_ENV', 'mixFetch is not available in this environment');
  const t = createFetchTransport({ fetchImpl: cfg.mixFetch });
  return buildProfile('nym-mixfetch', { blocked: false }, {
    experimental: true,
    claims: ['hides-ip-from-destination', 'timing-mix'],
    transport: () => t,
    localChecks: () => [{ id: 'mixfetch', ok: true, detail: 'mixFetch function present (not exercised)' }],
    probeTransport: () => t,
  });
}

/** Default relay POST using global `fetch`. Network use happens only when a request is sent. */
export const fetchRelayPost: RelayPost = async (url, body, o) => {
  const f = globalThis.fetch as typeof fetch | undefined;
  if (f === undefined) throw new NetTransportError('UNSUPPORTED_ENV', 'no fetch implementation available');
  const res = await f(url, {
    method: 'POST',
    headers: { 'content-type': 'message/ohttp-req' },
    body: new Uint8Array(body),
    signal: o.signal,
    redirect: 'error',
    credentials: 'omit',
    cache: 'no-store',
    referrerPolicy: 'no-referrer',
  });
  const chunks: Uint8Array[] = [];
  let total = 0;
  if (res.body !== null) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > o.maxBytes) {
        await reader.cancel();
        throw new ChainAdapterError('RESPONSE_TOO_LARGE', 'response exceeds cap');
      }
      chunks.push(value);
    }
  }
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return { status: res.status, contentType: res.headers.get('content-type') ?? undefined, body: out };
};

/**
 * Creates the `ohttp` profile.
 *
 * @remarks Refuses (NP-H-1) a relay and gateway on the same origin; warns on the same-domain heuristic
 * (NP-H-3). The key config is supplied by the caller and never fetched from the relay. Requests to an
 * origin other than `targetBase` are refused. All HPKE work goes through the injected `hpke`.
 * UNVERIFIED: no RFC 9458 vectors were run.
 * @param cfg Config (testnet-guarded; `experimentalAck` must be true).
 * @throws {NetTransportError} `INVALID_CONFIG`, `OHTTP_KEYCONFIG`, `UNSUPPORTED_ENV`.
 */
export function createOhttpProfile(cfg: OhttpConfig): TransportProfile {
  assertTestnet(cfg.network);
  requireConfig(cfg.experimentalAck === true, 'ohttp needs the experimental opt-in (crypto UNVERIFIED)');
  if (cfg.hpke === undefined) throw new NetTransportError('UNSUPPORTED_ENV', 'no HPKE implementation was provided');
  const hpke = cfg.hpke;
  const relay = parseTargetUrl(cfg.relayUrl, cfg.allowPlainHttp === true ? { allowPlainHttp: true } : {});
  const targetBase = parseTargetUrl(cfg.targetBase, cfg.allowPlainHttp === true ? { allowPlainHttp: true } : {});
  const cmp = compareRelayGateway(cfg.relayUrl, cfg.gatewayOrigin);
  requireConfig(!cmp.sameOrigin, 'relay and gateway must be different origins');
  const configs = parseKeyConfigs(cfg.keyConfig);
  const { config, suite } = selectSuite(configs, hpke);
  const padTo = cfg.padTo ?? 256;
  requireConfig(Number.isInteger(padTo) && padTo >= 0 && padTo <= 65536, 'padTo out of range');
  const post = cfg.relayPost ?? fetchRelayPost;
  const warnings = cmp.sameDomainHeuristic ? ['relay-gateway-same-domain'] : [];
  const make = (): RpcTransport => ({
    async send(url, body, init) {
      const t = parseTargetUrl(url, cfg.allowPlainHttp === true ? { allowPlainHttp: true } : {});
      if (t.url.origin !== targetBase.url.origin) throw new NetTransportError('URL_REJECTED', 'destination is not the configured target');
      const ctl = new AbortController();
      const timer = setTimeout(() => {
        ctl.abort();
      }, init.timeoutMs);
      try {
        const bhttp = encodeBhttpRequest(
          {
            method: 'POST',
            scheme: t.tls ? 'https' : 'http',
            authority: t.url.host,
            path: t.path,
            headers: [
              ['content-type', 'application/json'],
              ['accept', 'application/json'],
            ],
            content: new TextEncoder().encode(body),
          },
          padTo,
        );
        const { message, context } = await encapsulateRequest(bhttp, config, suite, hpke);
        let res: RelayResponse;
        try {
          res = await post(relay.url.toString(), message, { signal: ctl.signal, maxBytes: init.maxBytes + 4096 });
        } catch (e) {
          if (e instanceof ChainAdapterError || e instanceof NetTransportError) throw e;
          throw new ChainAdapterError('RPC_FAILURE', 'transport error or timeout');
        }
        if (res.status < 200 || res.status > 299) throw new RpcHttpError(res.status);
        if (res.contentType?.split(';')[0]?.trim().toLowerCase() !== 'message/ohttp-res') {
          throw new NetTransportError('OHTTP_DECAP', 'OHTTP response could not be opened');
        }
        const inner = decodeBhttpResponse(await decapsulateResponse(res.body, context, hpke));
        if (inner.status < 200 || inner.status > 299) throw new RpcHttpError(inner.status);
        if (inner.content.length > init.maxBytes) throw new ChainAdapterError('RESPONSE_TOO_LARGE', 'response exceeds cap');
        return new TextDecoder().decode(inner.content);
      } finally {
        clearTimeout(timer);
      }
    },
  });
  return buildProfile('ohttp', { blocked: false }, {
    experimental: true,
    claims: ['hides-ip-from-destination', 'splits-who-what'],
    warnings,
    transport: make,
    localChecks: () => [
      { id: 'key-config', ok: true, detail: 'key config parsed; a supported suite was selected' },
      { id: 'relay-gateway-origins', ok: true, detail: 'relay and gateway origins differ (not proof of non-collusion)' },
    ],
    probeTransport: make,
  });
}

/**
 * Creates a profile from a config. Unknown ids throw. No profile is ever chosen automatically
 * (NP-T-2): the caller always names one.
 *
 * @param cfg Config.
 * @throws {NetTransportError} `INVALID_CONFIG` for an unknown id; `NETWORK_NOT_ALLOWED`; and the
 * per-profile errors.
 */
export function createProfile(cfg: ProfileConfig): TransportProfile {
  assertTestnet((cfg as { network?: NetworkRef } | undefined)?.network as NetworkRef);
  switch (cfg.id) {
    case 'direct':
      return createDirectProfile(cfg);
    case 'tor-browser':
      return createTorBrowserProfile(cfg);
    case 'tor-socks':
      return createTorSocksProfile(cfg);
    case 'onion':
      return createOnionProfile(cfg);
    case 'i2p-outproxy':
      return createI2pOutproxyProfile(cfg);
    case 'nym-mixfetch':
      return createNymMixFetchProfile(cfg);
    case 'nym-socks5':
      return createNymSocksProfile(cfg);
    case 'ohttp':
      return createOhttpProfile(cfg);
    default:
      throw new NetTransportError('INVALID_CONFIG', 'unknown transport profile');
  }
}
