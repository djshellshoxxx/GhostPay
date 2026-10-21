import { b64urlDecode, b64urlEncode } from './base64url.js';
import { FlowError } from './errors.js';

/** Maximum accepted proof-code length in characters (PAYRE-2). */
export const MAX_PROOF_LENGTH = 512;

/** A payer proof: binds an invoice nonce to the transaction that paid it. */
export interface Proof {
  /** Lowercase hex invoice nonce, 16 to 64 chars, no 0x prefix. */
  readonly nonce: string;
  readonly chainId: number;
  /** Lowercase 0x-prefixed 32-byte transaction hash. */
  readonly txHash: string;
}

const NONCE_RE = /^[0-9a-f]{16,64}$/;
const TX_RE = /^0x[0-9a-f]{64}$/;

/** Validate and lowercase a tx hash. @throws FlowError BAD_TX_HASH */
export function normalizeTxHash(h: string): string {
  if (typeof h !== 'string') throw new FlowError('BAD_TX_HASH');
  const l = h.toLowerCase();
  if (!TX_RE.test(l)) throw new FlowError('BAD_TX_HASH');
  return l;
}

/** Validate a nonce (lowercase hex, 16-64 chars). @throws FlowError BAD_NONCE */
export function assertNonce(n: string): void {
  if (typeof n !== 'string' || !NONCE_RE.test(n)) throw new FlowError('BAD_NONCE');
}

/** Validate a chain id (positive safe integer). @throws FlowError BAD_CHAIN */
export function assertChainId(c: number): void {
  if (!Number.isSafeInteger(c) || c <= 0) throw new FlowError('BAD_CHAIN');
}

/**
 * Encode a proof as `base64url({"v":1,"n":..,"c":..,"t":..})`.
 * @security The code reveals nonce and tx hash to whoever receives it; share only with the seller.
 * @throws FlowError on invalid fields
 */
export function encodeProof(p: Proof): string {
  assertNonce(p.nonce);
  assertChainId(p.chainId);
  const t = normalizeTxHash(p.txHash);
  if (t !== p.txHash) throw new FlowError('BAD_TX_HASH');
  const json = `{"v":1,"n":"${p.nonce}","c":${p.chainId},"t":"${t}"}`;
  return b64urlEncode(new TextEncoder().encode(json));
}

/**
 * Strictly decode a proof code. Size-bounded, canonical-only, version-checked.
 * @security Untrusted input. Only ever throws {@link FlowError}.
 * @throws FlowError PROOF_TOO_LARGE | PROOF_ENCODING | PROOF_FORMAT | PROOF_VERSION | BAD_*
 */
export function decodeProof(s: string): Proof {
  if (typeof s !== 'string') throw new FlowError('PROOF_FORMAT');
  if (s.length > MAX_PROOF_LENGTH) throw new FlowError('PROOF_TOO_LARGE');
  const bytes = b64urlDecode(s);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw new FlowError('PROOF_ENCODING');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new FlowError('PROOF_FORMAT');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new FlowError('PROOF_FORMAT');
  const o = raw as Record<string, unknown>;
  if (Object.keys(o).length !== 4) throw new FlowError('PROOF_FORMAT');
  if (o['v'] !== 1) throw new FlowError(typeof o['v'] === 'number' ? 'PROOF_VERSION' : 'PROOF_FORMAT');
  const n = o['n'];
  const c = o['c'];
  const t = o['t'];
  if (typeof n !== 'string' || typeof c !== 'number' || typeof t !== 'string')
    throw new FlowError('PROOF_FORMAT');
  const proof: Proof = { nonce: n, chainId: c, txHash: t };
  // Canonical form check: re-encoding must reproduce the input (rejects whitespace, key order, escapes).
  if (encodeProof(proof) !== s) throw new FlowError('PROOF_FORMAT');
  return proof;
}
