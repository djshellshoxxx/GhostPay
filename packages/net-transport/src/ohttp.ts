import { NetTransportError } from './errors.js';

/**
 * Oblivious HTTP (RFC 9458) message framing and validation.
 *
 * UNVERIFIED: written from memory of RFC 9458 / RFC 9180 / RFC 9292; rfc-editor.org was not reachable and
 * the RFC 9458 test vectors have NOT been run. All cryptography (HPKE key schedule, AEAD, HKDF) is
 * delegated to an injected {@link OhttpHpke}; no HPKE library is bundled and this module performs no
 * encryption itself. Do not enable the `ohttp` profile outside tests until real vectors pass (NP-H-2).
 */

/** RFC 9180 KEM ids and public key sizes this module understands (Npk). */
export const KEM_PUBLIC_KEY_SIZE: Readonly<Record<number, number>> = Object.freeze({
  0x0010: 65, // DHKEM(P-256, HKDF-SHA256)
  0x0011: 97, // DHKEM(P-384, HKDF-SHA384)
  0x0012: 133, // DHKEM(P-521, HKDF-SHA512)
  0x0020: 32, // DHKEM(X25519, HKDF-SHA256)
  0x0021: 56, // DHKEM(X448, HKDF-SHA512)
});

/** AEAD parameters (RFC 9180): key size Nk and nonce size Nn. */
export function aeadParams(aeadId: number): { nk: number; nn: number } {
  if (aeadId === 0x0001) return { nk: 16, nn: 12 };
  if (aeadId === 0x0002 || aeadId === 0x0003) return { nk: 32, nn: 12 };
  throw new NetTransportError('OHTTP_KEYCONFIG', 'unsupported AEAD');
}

/** One HPKE symmetric suite offered by a key config. */
export interface HpkeSuiteIds {
  /** KDF id. */
  readonly kdfId: number;
  /** AEAD id. */
  readonly aeadId: number;
}

/** A parsed OHTTP key configuration (RFC 9458 section 3). */
export interface OhttpKeyConfig {
  /** Key identifier byte. */
  readonly keyId: number;
  /** KEM id. */
  readonly kemId: number;
  /** Gateway HPKE public key. */
  readonly publicKey: Uint8Array;
  /** Offered KDF/AEAD pairs. */
  readonly suites: readonly HpkeSuiteIds[];
}

/**
 * Injected HPKE boundary. The caller supplies a real implementation (for example built on a vetted HPKE
 * library chosen under spec Q4); tests supply an INSECURE fake. This package never calls HPKE itself.
 */
export interface OhttpHpke {
  /** True if the (KEM, KDF, AEAD) combination is implemented. */
  supports(kemId: number, kdfId: number, aeadId: number): boolean;
  /** Cryptographically random bytes. */
  randomBytes(n: number): Uint8Array;
  /** Client: SetupBaseS then Seal with empty AAD. */
  sealRequest(a: {
    kemId: number;
    kdfId: number;
    aeadId: number;
    recipientPublicKey: Uint8Array;
    info: Uint8Array;
    plaintext: Uint8Array;
  }): Promise<{
    enc: Uint8Array;
    ciphertext: Uint8Array;
    /** HPKE `Export(context, length)` of the sender context. */
    readonly exportSecret: (context: Uint8Array, length: number) => Promise<Uint8Array>;
  }>;
  /** Gateway: SetupBaseR then Open with empty AAD. `recipient` is an opaque handle to the private key. */
  openRequest(a: {
    kemId: number;
    kdfId: number;
    aeadId: number;
    recipient: unknown;
    enc: Uint8Array;
    info: Uint8Array;
    ciphertext: Uint8Array;
  }): Promise<OpenedRequest>;
  /** `prk = Extract(salt, secret)`, key/nonce via `Expand`, then AEAD seal with empty AAD. */
  sealResponse(a: { kdfId: number; aeadId: number; secret: Uint8Array; salt: Uint8Array; plaintext: Uint8Array }): Promise<Uint8Array>;
  /** Inverse of {@link OhttpHpke.sealResponse}; MUST throw on authentication failure. */
  openResponse(a: { kdfId: number; aeadId: number; secret: Uint8Array; salt: Uint8Array; ciphertext: Uint8Array }): Promise<Uint8Array>;
}

/** Result of the gateway-side HPKE open. */
export interface OpenedRequest {
  /** Decrypted binary HTTP request. */
  readonly plaintext: Uint8Array;
  /** HPKE `Export` of the receiver context. */
  readonly exportSecret: (context: Uint8Array, length: number) => Promise<Uint8Array>;
}

const MAX_KEY_CONFIGS_BYTES = 64 * 1024;

function bad(): NetTransportError {
  return new NetTransportError('OHTTP_KEYCONFIG', 'invalid OHTTP key configuration');
}

/**
 * Parses ONE key config: `key_id(1) kem_id(2) public_key(Npk) cipher_suites_len(2) { kdf_id(2) aead_id(2) }+`.
 *
 * @param b Bytes of exactly one config.
 * @throws {NetTransportError} `OHTTP_KEYCONFIG` on unknown KEM, wrong key length, empty or ragged suite
 * list, or trailing bytes.
 */
export function parseKeyConfig(b: Uint8Array): OhttpKeyConfig {
  if (b.length < 1 + 2 + 2) throw bad();
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const keyId = b[0] as number;
  const kemId = dv.getUint16(1);
  const npk = KEM_PUBLIC_KEY_SIZE[kemId];
  if (npk === undefined) throw bad();
  let o = 3;
  if (b.length < o + npk + 2) throw bad();
  const publicKey = b.slice(o, o + npk);
  o += npk;
  const sl = dv.getUint16(o);
  o += 2;
  if (sl < 4 || sl % 4 !== 0 || o + sl !== b.length) throw bad();
  const suites: HpkeSuiteIds[] = [];
  for (let i = 0; i < sl; i += 4) suites.push({ kdfId: dv.getUint16(o + i), aeadId: dv.getUint16(o + i + 2) });
  return { keyId, kemId, publicKey, suites };
}

/** Serializes one key config (used by tests and by the gateway stub). */
export function encodeKeyConfig(c: OhttpKeyConfig): Uint8Array {
  const out = new Uint8Array(1 + 2 + c.publicKey.length + 2 + c.suites.length * 4);
  const dv = new DataView(out.buffer);
  out[0] = c.keyId;
  dv.setUint16(1, c.kemId);
  out.set(c.publicKey, 3);
  let o = 3 + c.publicKey.length;
  dv.setUint16(o, c.suites.length * 4);
  o += 2;
  for (const s of c.suites) {
    dv.setUint16(o, s.kdfId);
    dv.setUint16(o + 2, s.aeadId);
    o += 4;
  }
  return out;
}

/**
 * Parses an `application/ohttp-keys` body: a sequence of `length(2) || key_config`. [UNVERIFIED: framing
 * recalled from RFC 9458 section 3.]
 *
 * @throws {NetTransportError} `OHTTP_KEYCONFIG`; also on duplicate key ids.
 */
export function parseKeyConfigs(b: Uint8Array): OhttpKeyConfig[] {
  if (b.length === 0 || b.length > MAX_KEY_CONFIGS_BYTES) throw bad();
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const out: OhttpKeyConfig[] = [];
  let o = 0;
  while (o < b.length) {
    if (o + 2 > b.length) throw bad();
    const n = dv.getUint16(o);
    o += 2;
    if (n === 0 || o + n > b.length) throw bad();
    out.push(parseKeyConfig(b.subarray(o, o + n)));
    o += n;
  }
  if (new Set(out.map((c) => c.keyId)).size !== out.length) throw bad();
  return out;
}

/** Serializes configs as `application/ohttp-keys`. */
export function encodeKeyConfigs(cs: readonly OhttpKeyConfig[]): Uint8Array {
  const parts = cs.map((c) => {
    const e = encodeKeyConfig(c);
    const p = new Uint8Array(2 + e.length);
    new DataView(p.buffer).setUint16(0, e.length);
    p.set(e, 2);
    return p;
  });
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

/** Picks the first config/suite the HPKE implementation supports; throws if none. */
export function selectSuite(configs: readonly OhttpKeyConfig[], hpke: OhttpHpke): { config: OhttpKeyConfig; suite: HpkeSuiteIds } {
  for (const config of configs) {
    for (const suite of config.suites) {
      if (hpke.supports(config.kemId, suite.kdfId, suite.aeadId)) {
        aeadParams(suite.aeadId); // fails on an AEAD whose sizes we do not know
        return { config, suite };
      }
    }
  }
  throw new NetTransportError('OHTTP_KEYCONFIG', 'no supported OHTTP cipher suite');
}

const ENC = new TextEncoder();

function concat(...p: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(p.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of p) {
    out.set(x, o);
    o += x.length;
  }
  return out;
}

/** Encapsulated request header: `key_id(1) kem_id(2) kdf_id(2) aead_id(2)`. */
export function requestHeader(keyId: number, kemId: number, s: HpkeSuiteIds): Uint8Array {
  const h = new Uint8Array(7);
  const dv = new DataView(h.buffer);
  h[0] = keyId;
  dv.setUint16(1, kemId);
  dv.setUint16(3, s.kdfId);
  dv.setUint16(5, s.aeadId);
  return h;
}

/** HPKE `info` for requests: `"message/bhttp request" || 0x00 || hdr`. */
export function requestInfo(hdr: Uint8Array): Uint8Array {
  return concat(ENC.encode('message/bhttp request'), Uint8Array.of(0), hdr);
}

const RESPONSE_LABEL = ENC.encode('message/bhttp response');

/** State the client keeps between encapsulating a request and decapsulating its response. */
export interface RequestContext {
  /** HPKE encapsulated key from the request. */
  readonly enc: Uint8Array;
  /** Chosen suite. */
  readonly suite: HpkeSuiteIds;
  /** Export function of the sender context. */
  readonly exportSecret: (context: Uint8Array, length: number) => Promise<Uint8Array>;
}

/**
 * Client side: builds `hdr || enc || ct` for a binary HTTP request.
 *
 * @param bhttp Encoded binary HTTP request.
 * @param config Chosen key config.
 * @param suite Chosen suite (must be one the config offers).
 * @param hpke Injected HPKE.
 * @returns Encapsulated request and the context needed for the response.
 * @throws {NetTransportError} `OHTTP_KEYCONFIG` if the suite is not offered by the config.
 */
export async function encapsulateRequest(
  bhttp: Uint8Array,
  config: OhttpKeyConfig,
  suite: HpkeSuiteIds,
  hpke: OhttpHpke,
): Promise<{ message: Uint8Array; context: RequestContext }> {
  if (!config.suites.some((s) => s.kdfId === suite.kdfId && s.aeadId === suite.aeadId)) throw bad();
  const hdr = requestHeader(config.keyId, config.kemId, suite);
  const sealed = await hpke.sealRequest({
    kemId: config.kemId,
    kdfId: suite.kdfId,
    aeadId: suite.aeadId,
    recipientPublicKey: config.publicKey,
    info: requestInfo(hdr),
    plaintext: bhttp,
  });
  return {
    message: concat(hdr, sealed.enc, sealed.ciphertext),
    context: { enc: sealed.enc, suite, exportSecret: sealed.exportSecret },
  };
}

/**
 * Client side: opens `response_nonce || ct`.
 *
 * @param message Encapsulated response bytes.
 * @param ctx Context from {@link encapsulateRequest}.
 * @param hpke Injected HPKE.
 * @returns The binary HTTP response bytes.
 * @throws {NetTransportError} `OHTTP_DECAP` on short input or authentication failure.
 */
export async function decapsulateResponse(message: Uint8Array, ctx: RequestContext, hpke: OhttpHpke): Promise<Uint8Array> {
  const { nk, nn } = aeadParams(ctx.suite.aeadId);
  const len = Math.max(nk, nn);
  if (message.length <= len) throw new NetTransportError('OHTTP_DECAP', 'OHTTP response could not be opened');
  const nonce = message.subarray(0, len);
  const ct = message.subarray(len);
  try {
    const secret = await ctx.exportSecret(RESPONSE_LABEL, len);
    return await hpke.openResponse({ kdfId: ctx.suite.kdfId, aeadId: ctx.suite.aeadId, secret, salt: concat(ctx.enc, nonce), ciphertext: ct });
  } catch {
    throw new NetTransportError('OHTTP_DECAP', 'OHTTP response could not be opened');
  }
}

/** What a gateway holds per key id: the config it published and an opaque private-key handle. */
export interface GatewayKey {
  /** Published config. */
  readonly config: OhttpKeyConfig;
  /** Opaque handle passed to {@link OhttpHpke.openRequest}. */
  readonly recipient: unknown;
}

/**
 * Gateway side: validates and opens an encapsulated request.
 *
 * @param message `hdr || enc || ct`.
 * @param keys Keys the gateway serves.
 * @param hpke Injected HPKE.
 * @returns The binary HTTP request and a `respond` function that encapsulates the answer.
 * @throws {NetTransportError} `OHTTP_DECAP` for unknown key id, unoffered suite, truncated or
 * unauthenticated input (one generic message: no oracle).
 */
export async function gatewayDecapsulate(
  message: Uint8Array,
  keys: readonly GatewayKey[],
  hpke: OhttpHpke,
): Promise<{ bhttp: Uint8Array; respond: (bhttpResponse: Uint8Array) => Promise<Uint8Array> }> {
  const fail = (): NetTransportError => new NetTransportError('OHTTP_DECAP', 'OHTTP request could not be opened');
  if (message.length < 7) throw fail();
  const dv = new DataView(message.buffer, message.byteOffset, message.byteLength);
  const key = keys.find((k) => k.config.keyId === message[0]);
  const kemId = dv.getUint16(1);
  const suite = { kdfId: dv.getUint16(3), aeadId: dv.getUint16(5) };
  if (key === undefined || key.config.kemId !== kemId) throw fail();
  if (!key.config.suites.some((s) => s.kdfId === suite.kdfId && s.aeadId === suite.aeadId)) throw fail();
  const npk = KEM_PUBLIC_KEY_SIZE[kemId] as number; // key.config was parsed, so the KEM is known
  if (message.length < 7 + npk + 1) throw fail();
  const hdr = message.subarray(0, 7);
  const enc = message.subarray(7, 7 + npk);
  const ciphertext = message.subarray(7 + npk);
  let opened: OpenedRequest;
  try {
    opened = await hpke.openRequest({ kemId, kdfId: suite.kdfId, aeadId: suite.aeadId, recipient: key.recipient, enc, info: requestInfo(hdr), ciphertext });
  } catch {
    throw fail();
  }
  const { nk, nn } = aeadParams(suite.aeadId);
  const len = Math.max(nk, nn);
  return {
    bhttp: opened.plaintext,
    async respond(bhttpResponse) {
      const secret = await opened.exportSecret(RESPONSE_LABEL, len);
      const nonce = hpke.randomBytes(len);
      const ct = await hpke.sealResponse({ kdfId: suite.kdfId, aeadId: suite.aeadId, secret, salt: concat(enc, nonce), plaintext: bhttpResponse });
      return concat(nonce, ct);
    },
  };
}

/** Registrable-domain heuristic input: two last labels (NOT a Public Suffix List lookup). */
function lastTwoLabels(host: string): string {
  const labels = host.toLowerCase().replace(/\.$/, '').split('.');
  return labels.slice(-2).join('.');
}

/**
 * NP-H-1 / NP-H-3: checks the relay and gateway origins.
 *
 * @remarks `sameOrigin` means no split at all and the profile is refused. `sameDomainHeuristic` is a
 * naive last-two-labels comparison (no Public Suffix List): a hint to warn about one operator running
 * both, never a proof either way.
 * @param relayUrl Relay URL.
 * @param gatewayOrigin Gateway origin (`https://host`).
 * @throws {NetTransportError} `INVALID_CONFIG` for unparsable input.
 */
export function compareRelayGateway(relayUrl: string, gatewayOrigin: string): { sameOrigin: boolean; sameDomainHeuristic: boolean } {
  let r: URL;
  let g: URL;
  try {
    r = new URL(relayUrl);
    g = new URL(gatewayOrigin);
  } catch {
    throw new NetTransportError('INVALID_CONFIG', 'relay or gateway URL is not valid');
  }
  return { sameOrigin: r.origin === g.origin, sameDomainHeuristic: lastTwoLabels(r.hostname) === lastTwoLabels(g.hostname) };
}
