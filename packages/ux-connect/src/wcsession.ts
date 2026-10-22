/**
 * WalletConnect-style session and request model (pure; no relay, no sockets).
 * Namespaces, allowlisted methods, request validation, origin binding,
 * expiry, rejection of unknown methods, and strict response checking.
 *
 * UNVERIFIED: nothing here talks to a real relay or wallet. Error codes and
 * the pairing-URI grammar follow WalletConnect v2 as remembered; confirm
 * against the pinned SDK before wiring.
 */
import {
  err,
  isAddress,
  isBytes32,
  isHexData,
  isHexQuantity,
  isRecord,
  ok,
  quantityToBigInt,
  validateSignature,
  type Result,
} from './hex.js';

export const allowedMethods = [
  'eth_chainId',
  'eth_accounts',
  'eth_sendTransaction',
  'eth_signTypedData_v4',
  'wallet_switchEthereumChain',
] as const;
export type AllowedMethod = (typeof allowedMethods)[number];
export const allowedEvents = ['chainChanged', 'accountsChanged'] as const;

/** Type guard for the allowlist (exact, case-sensitive). */
export function isAllowedMethod(m: unknown): m is AllowedMethod {
  return typeof m === 'string' && (allowedMethods as readonly string[]).includes(m);
}

/** JSON-RPC / EIP-1193 / WalletConnect error codes used here. */
export const RpcCodes = {
  userRejected: 4001,
  unsupportedMethod: 4200,
  wcUnsupportedChains: 5100,
  wcUnsupportedMethods: 5101,
  wcUnsupportedAccounts: 5102,
  invalidParams: -32602,
} as const;

export interface RpcError {
  readonly code: number;
  readonly message: string;
}

/** CAIP-2 for eip155, e.g. "eip155:1". */
export function parseChainId(c: unknown): number | null {
  if (typeof c !== 'string') return null;
  const m = /^eip155:([1-9][0-9]{0,15})$/.exec(c);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isSafeInteger(n) ? n : null;
}

/** CAIP-10 "eip155:<chain>:<address>" -> parts. */
export function parseAccount(a: unknown): { chain: string; address: string } | null {
  if (typeof a !== 'string') return null;
  const i = a.lastIndexOf(':');
  if (i < 0) return null;
  const chain = a.slice(0, i);
  const address = a.slice(i + 1);
  if (parseChainId(chain) === null || !isAddress(address)) return null;
  return { chain, address: address.toLowerCase() };
}

/**
 * Normalise a URL to an origin. Only https (or http://localhost / 127.0.0.1
 * when explicitly allowed); no credentials; no path-confusion.
 */
export function parseOrigin(url: unknown, opts: { allowInsecureLocalhost?: boolean } = {}): string | null {
  if (typeof url !== 'string' || url.length > 2048) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.username !== '' || u.password !== '') return null;
  const local = u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  if (u.protocol === 'https:') return u.origin;
  if (u.protocol === 'http:' && local && opts.allowInsecureLocalhost === true) return u.origin;
  return null;
}

/** Namespace as requested / settled. */
export interface Namespace {
  readonly chains: readonly string[];
  readonly methods: readonly string[];
  readonly events: readonly string[];
  /** CAIP-10 accounts (settlement only). */
  readonly accounts?: readonly string[];
}

/** What GhostPay asks the wallet for: one chain, allowlisted methods only (WALLE-1). */
export function buildProposal(chainId: number): Result<{ eip155: Namespace }> {
  if (!Number.isSafeInteger(chainId) || chainId <= 0) return err('bad chain id');
  return ok({
    eip155: { chains: [`eip155:${chainId}`], methods: [...allowedMethods], events: [...allowedEvents] },
  });
}

export interface Session {
  readonly topic: string;
  /** Origin of THIS app that created the session (binding). */
  readonly origin: string;
  /** Wallet metadata origin pinned at settlement, if the wallet supplied a valid one. */
  readonly peerOrigin: string | null;
  readonly chains: readonly string[];
  /** Lowercase addresses per chain, CAIP-10. */
  readonly accounts: readonly string[];
  readonly methods: readonly AllowedMethod[];
  readonly createdAtSec: number;
  readonly expirySec: number;
}

export const MAX_SESSION_TTL_SEC = 7 * 24 * 3600;
export const DEFAULT_REQUEST_TTL_MS = 300_000;

/**
 * Validate the wallet's settlement against what we requested and produce a
 * Session. Extra chains/methods the wallet added are rejected (chains) or
 * stripped (methods); every required thing must be present.
 */
export function settleSession(input: {
  topic: unknown;
  origin: string;
  requested: { eip155: Namespace };
  settled: unknown;
  peerUrl?: unknown;
  nowSec: number;
  expirySec: unknown;
}): Result<Session, RpcError> {
  const topic = input.topic;
  if (typeof topic !== 'string' || !/^[0-9a-f]{64}$/.test(topic))
    return err({ code: RpcCodes.invalidParams, message: 'bad topic' });
  if (parseOrigin(input.origin, { allowInsecureLocalhost: true }) !== input.origin)
    return err({ code: RpcCodes.invalidParams, message: 'bad origin' });
  const exp = input.expirySec;
  if (typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp <= input.nowSec)
    return err({ code: RpcCodes.invalidParams, message: 'session already expired' });
  if (exp > input.nowSec + MAX_SESSION_TTL_SEC)
    return err({ code: RpcCodes.invalidParams, message: 'session lifetime too long' });
  const s = isRecord(input.settled) ? input.settled['eip155'] : undefined;
  if (
    !isRecord(s) ||
    !Array.isArray(s['chains']) ||
    !Array.isArray(s['methods']) ||
    !Array.isArray(s['accounts'])
  ) {
    return err({ code: RpcCodes.wcUnsupportedChains, message: 'missing eip155 namespace' });
  }
  const wantChains = input.requested.eip155.chains;
  const chains = s['chains'] as unknown[];
  if (chains.length === 0 || chains.some((c) => typeof c !== 'string' || !wantChains.includes(c))) {
    return err({ code: RpcCodes.wcUnsupportedChains, message: 'chains not requested' });
  }
  const methods = (s['methods'] as unknown[]).filter(
    (m): m is AllowedMethod => isAllowedMethod(m) && input.requested.eip155.methods.includes(m),
  );
  for (const m of ['eth_sendTransaction', 'eth_chainId'] as const) {
    if (input.requested.eip155.methods.includes(m) && !methods.includes(m))
      return err({ code: RpcCodes.wcUnsupportedMethods, message: `wallet did not grant ${m}` });
  }
  const accounts: string[] = [];
  for (const a of s['accounts'] as unknown[]) {
    const p = parseAccount(a);
    if (p === null || !chains.includes(p.chain))
      return err({ code: RpcCodes.wcUnsupportedAccounts, message: 'bad account' });
    accounts.push(`${p.chain}:${p.address}`);
  }
  if (accounts.length === 0) return err({ code: RpcCodes.wcUnsupportedAccounts, message: 'no accounts' });
  return ok({
    topic,
    origin: input.origin,
    peerOrigin: input.peerUrl === undefined ? null : parseOrigin(input.peerUrl),
    chains: chains as string[],
    accounts,
    methods,
    createdAtSec: input.nowSec,
    expirySec: exp,
  });
}

/** True at or after expiry. */
export const isSessionExpired = (s: Session, nowSec: number): boolean => nowSec >= s.expirySec;

const TX_KEYS = new Set([
  'from',
  'to',
  'value',
  'data',
  'gas',
  'gasLimit',
  'maxFeePerGas',
  'maxPriorityFeePerGas',
  'nonce',
  'chainId',
]);
const QTY_KEYS = ['value', 'gas', 'gasLimit', 'maxFeePerGas', 'maxPriorityFeePerGas', 'nonce'] as const;
const MAX_TYPED = 64 * 1024;

function bad(message: string): Result<never, RpcError> {
  return err({ code: RpcCodes.invalidParams, message });
}

/** Validate params for an allowlisted method against a session and chain. */
export function validateParams(
  session: Session,
  chain: string,
  method: AllowedMethod,
  params: unknown,
): Result<readonly unknown[], RpcError> {
  const chainNum = parseChainId(chain) as number;
  const raw: unknown = params === undefined ? [] : params;
  if (!Array.isArray(raw)) return bad('params must be an array');
  const list: readonly unknown[] = raw;
  const accountsOnChain = session.accounts
    .filter((a) => a.startsWith(chain + ':'))
    .map((a) => a.slice(chain.length + 1));
  switch (method) {
    case 'eth_chainId':
    case 'eth_accounts':
      return list.length === 0 ? ok(list) : bad('no params expected');
    case 'wallet_switchEthereumChain': {
      const p = list[0];
      if (list.length !== 1 || !isRecord(p) || Object.keys(p).length !== 1 || !isHexQuantity(p['chainId']))
        return bad('expected [{chainId}]');
      const target = `eip155:${BigInt(p['chainId'])}`;
      if (!session.chains.includes(target))
        return err({ code: RpcCodes.wcUnsupportedChains, message: 'chain not in session' });
      return ok(list);
    }
    case 'eth_signTypedData_v4': {
      if (list.length !== 2) return bad('expected [address, typedData]');
      const addr: unknown = list[0];
      const json: unknown = list[1];
      if (!isAddress(addr) || !accountsOnChain.includes(addr.toLowerCase()))
        return bad('signer is not a session account');
      if (typeof json !== 'string' || json.length > MAX_TYPED)
        return bad('typed data must be a JSON string <= 64KB');
      let t: unknown;
      try {
        t = JSON.parse(json);
      } catch {
        return bad('typed data is not JSON');
      }
      if (
        !isRecord(t) ||
        !isRecord(t['domain']) ||
        !isRecord(t['types']) ||
        !isRecord(t['message']) ||
        typeof t['primaryType'] !== 'string'
      )
        return bad('malformed typed data');
      const dc: unknown = t['domain']['chainId'];
      const dn = typeof dc === 'string' && /^(0x[0-9a-fA-F]+|[0-9]+)$/.test(dc) ? Number(BigInt(dc)) : dc;
      if (dn !== chainNum) return bad('typed data chain does not match request chain');
      return ok(list);
    }
    case 'eth_sendTransaction': {
      const tx = list[0];
      if (list.length !== 1 || !isRecord(tx)) return bad('expected [tx]');
      for (const k of Object.keys(tx)) if (!TX_KEYS.has(k)) return bad(`unknown field ${k}`);
      if (!isAddress(tx['from']) || !accountsOnChain.includes(tx['from'].toLowerCase()))
        return bad('from is not a session account');
      if (!isAddress(tx['to'])) return bad('to is required (no contract creation)');
      if (tx['data'] !== undefined && !isHexData(tx['data'])) return bad('bad data');
      for (const k of QTY_KEYS) if (tx[k] !== undefined && !isHexQuantity(tx[k])) return bad(`bad ${k}`);
      if (tx['chainId'] !== undefined && quantityToBigInt(tx['chainId']) !== BigInt(chainNum))
        return bad('tx chainId does not match request chain');
      return ok(list);
    }
  }
}

export interface PendingRequest {
  readonly id: number;
  readonly topic: string;
  readonly chain: string;
  readonly method: AllowedMethod;
  readonly params: readonly unknown[];
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

export type PendingTable = ReadonlyMap<number, PendingRequest>;
export const emptyPending: PendingTable = new Map();

/**
 * Build an outgoing request. Order of checks: session expiry, origin
 * binding, chain membership, method allowlist (unknown methods are rejected
 * with 4200 and never serialised), method granted by wallet, params.
 *
 * @security Origin binding: a session restored in, or driven from, a
 * different origin than the one that created it is refused.
 */
export function buildRequest(input: {
  session: Session;
  origin: string;
  chain: string;
  method: unknown;
  params?: unknown;
  id: number;
  nowMs: number;
  pending: PendingTable;
  ttlMs?: number;
}): Result<{ request: PendingRequest; pending: PendingTable }, RpcError> {
  const { session: s } = input;
  if (isSessionExpired(s, Math.floor(input.nowMs / 1000)))
    return err({ code: RpcCodes.wcUnsupportedAccounts, message: 'session expired' });
  if (input.origin !== s.origin) return err({ code: RpcCodes.invalidParams, message: 'origin mismatch' });
  if (!s.chains.includes(input.chain))
    return err({ code: RpcCodes.wcUnsupportedChains, message: 'chain not in session' });
  if (!isAllowedMethod(input.method))
    return err({ code: RpcCodes.unsupportedMethod, message: 'method not allowed' });
  if (!s.methods.includes(input.method))
    return err({ code: RpcCodes.wcUnsupportedMethods, message: 'method not granted by wallet' });
  if (!Number.isSafeInteger(input.id) || input.id <= 0 || input.pending.has(input.id))
    return bad('bad or duplicate request id');
  const ttl = input.ttlMs ?? DEFAULT_REQUEST_TTL_MS;
  if (!Number.isSafeInteger(ttl) || ttl <= 0) return bad('bad ttl');
  const p = validateParams(s, input.chain, input.method, input.params);
  if (!p.ok) return p;
  const expiresAtMs = Math.min(input.nowMs + ttl, s.expirySec * 1000);
  const request: PendingRequest = {
    id: input.id,
    topic: s.topic,
    chain: input.chain,
    method: input.method,
    params: p.value,
    createdAtMs: input.nowMs,
    expiresAtMs,
  };
  const pending = new Map(input.pending);
  pending.set(input.id, request);
  return ok({ request, pending });
}

/** Incoming JSON-RPC response from the wallet (untrusted). */
export type WcOutcome =
  | { readonly kind: 'result'; readonly id: number; readonly method: AllowedMethod; readonly value: unknown }
  | { readonly kind: 'rejected'; readonly id: number; readonly error: RpcError }
  | { readonly kind: 'expired'; readonly id: number };

/**
 * Check a response against the pending table and session. Returns the next
 * table (entry removed) on any definitive outcome. Result shapes are
 * validated per method; a wallet that answers on the wrong chain, with an
 * unknown account, or with a malformed hash/signature is treated as an error
 * (WALLE-2 / WALLE-3 style defence against a lying wallet; the host must still
 * verify the submission on chain via its own RPC).
 */
export function acceptResponse(input: {
  session: Session;
  topic: string;
  response: unknown;
  pending: PendingTable;
  nowMs: number;
  peerUrl?: unknown;
}): Result<{ outcome: WcOutcome; pending: PendingTable }, RpcError> {
  const { session: s, response: r } = input;
  if (input.topic !== s.topic) return bad('topic mismatch');
  if (input.peerUrl !== undefined && s.peerOrigin !== null && parseOrigin(input.peerUrl) !== s.peerOrigin)
    return bad('peer origin changed');
  if (!isRecord(r) || typeof r['id'] !== 'number') return bad('malformed response');
  const id = r['id'];
  const req = input.pending.get(id);
  if (req === undefined) return bad('no such pending request');
  const rest = new Map(input.pending);
  rest.delete(id);
  if (input.nowMs >= req.expiresAtMs) return ok({ outcome: { kind: 'expired', id }, pending: rest });
  if ('error' in r) {
    const e = r['error'];
    const code = isRecord(e) && typeof e['code'] === 'number' ? e['code'] : RpcCodes.userRejected;
    const message = isRecord(e) && typeof e['message'] === 'string' ? e['message'].slice(0, 200) : 'rejected';
    return ok({ outcome: { kind: 'rejected', id, error: { code, message } }, pending: rest });
  }
  const v = checkResult(s, req, r['result']);
  if (!v.ok) return v;
  return ok({ outcome: { kind: 'result', id, method: req.method, value: v.value }, pending: rest });
}

function checkResult(s: Session, req: PendingRequest, result: unknown): Result<unknown, RpcError> {
  const chainNum = parseChainId(req.chain) as number;
  switch (req.method) {
    case 'eth_chainId':
      return isHexQuantity(result) && BigInt(result) === BigInt(chainNum)
        ? ok(result)
        : err({ code: RpcCodes.wcUnsupportedChains, message: 'chain-mismatch' });
    case 'eth_accounts': {
      const on = s.accounts
        .filter((a) => a.startsWith(req.chain + ':'))
        .map((a) => a.slice(req.chain.length + 1));
      if (
        !Array.isArray(result) ||
        result.length === 0 ||
        result.some((a) => !isAddress(a) || !on.includes(a.toLowerCase()))
      ) {
        return err({ code: RpcCodes.wcUnsupportedAccounts, message: 'accounts outside session' });
      }
      return ok(result.map((a: string) => a.toLowerCase()));
    }
    case 'eth_sendTransaction':
      return isBytes32(result) ? ok(result.toLowerCase()) : bad('transaction hash must be 32 bytes');
    case 'eth_signTypedData_v4': {
      const v = validateSignature(result);
      return v.ok ? v : bad(v.error);
    }
    case 'wallet_switchEthereumChain':
      return result === null ? ok(null) : bad('switch chain must return null');
  }
}

/** Drop expired entries; returns the new table and the ids that expired. */
export function sweepExpired(
  pending: PendingTable,
  nowMs: number,
): { pending: PendingTable; expired: readonly number[] } {
  const next = new Map<number, PendingRequest>();
  const expired: number[] = [];
  for (const [id, r] of pending) {
    if (nowMs >= r.expiresAtMs) expired.push(id);
    else next.set(id, r);
  }
  return { pending: next, expired };
}

/** Parsed pairing URI. `symKey` is a secret: never log or persist it. */
export interface PairingUri {
  readonly topic: string;
  readonly version: 2;
  readonly relayProtocol: string;
  readonly symKey: string;
  readonly expiryTimestamp: number | null;
}

/** Strictly parse "wc:<topic>@2?relay-protocol=irn&symKey=<64 hex>[&expiryTimestamp=N]". */
export function parsePairingUri(uri: unknown): Result<PairingUri> {
  if (typeof uri !== 'string' || uri.length > 1024) return err('bad uri');
  const m = /^wc:([0-9a-f]{64})@2\?(.+)$/.exec(uri);
  if (!m) return err('not a v2 pairing uri');
  const q = new URLSearchParams(m[2]);
  const seen = new Set<string>();
  for (const k of q.keys()) {
    if (seen.has(k)) return err('duplicate parameter');
    seen.add(k);
    if (!['relay-protocol', 'symKey', 'expiryTimestamp', 'methods'].includes(k))
      return err(`unknown parameter ${k}`);
  }
  const relay = q.get('relay-protocol');
  const key = q.get('symKey');
  if (relay !== 'irn') return err('unsupported relay protocol');
  if (key === null || !/^[0-9a-f]{64}$/.test(key)) return err('bad symKey');
  const e = q.get('expiryTimestamp');
  let expiry: number | null = null;
  if (e !== null) {
    if (!/^[0-9]{1,12}$/.test(e)) return err('bad expiry');
    expiry = Number(e);
  }
  return ok({
    topic: m[1] as string,
    version: 2,
    relayProtocol: relay,
    symKey: key,
    expiryTimestamp: expiry,
  });
}

/** Safe-to-log form of a pairing URI (secret removed). */
export function redactPairingUri(uri: string): string {
  return uri.replace(/symKey=[^&]*/g, 'symKey=REDACTED');
}

/** Opt-in state held by the host. */
export interface RelaySettings {
  readonly optedIn: boolean;
  /** Version of the disclosure text the user clicked through. */
  readonly disclosureAcked: number | null;
  readonly relayUrl: string | null;
  readonly projectId: string | null;
}

export const CURRENT_DISCLOSURE_VERSION = 1;

export type RelayGate =
  'ok' | 'not-opted-in' | 'disclosure-required' | 'relay-not-configured' | 'bad-relay-url' | 'bad-project-id';

/**
 * Gate before ANY relay connection (WALLE-3, WALLE-4). No default relay or
 * project id exists in this package; both must come from the user.
 */
export function relayGate(s: RelaySettings): RelayGate {
  if (!s.optedIn) return 'not-opted-in';
  if (s.disclosureAcked !== CURRENT_DISCLOSURE_VERSION) return 'disclosure-required';
  if (s.relayUrl === null || s.projectId === null) return 'relay-not-configured';
  if (!/^wss:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?(\/[A-Za-z0-9._~/-]*)?$/.test(s.relayUrl))
    return 'bad-relay-url';
  if (!/^[0-9a-f]{32}$/.test(s.projectId)) return 'bad-project-id';
  return 'ok';
}
